import React, { useRef, useState } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronUp, File, FolderOpen, Globe2, History, Plus, Search, Trash2, X } from 'lucide-react';
import { DEFAULT_SHORTCUTS, deleteSpace, domain, HOME, normalizeUrl, renameSpace, uid } from './model.js';
import { parseBookmarks } from './bookmarks.js';
import { filterHistory, groupHistoryByDay } from './history.js';
import { buildBookmarkExport } from './bookmark-export.js';

function Empty({ icon: Icon = History, title, children }) {
  return <div className="tools-empty"><Icon size={28}/><h3>{title}</h3><p>{children}</p></div>;
}

export function HistoryPanel({ state, setState, onOpen }) {
  const [search, setSearch] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [timeRange, setTimeRange] = useState('all');
  const [confirm, setConfirm] = useState(null);
  const filtered = !!search.trim() || !!spaceId || timeRange !== 'all';
  const entries = filterHistory(state.history, { search, spaceId, timeRange });
  const requestClear = all => setConfirm({ all, ids: new Set((all ? state.history || [] : entries).map(entry => entry.id)) });
  return <>
    <span className="eyebrow">PICK UP THE THREAD</span><h2>Your trail.</h2><p>Places you’ve been. Stored only on this device.</p>
    <label className="tools-search"><Search size={16}/><input aria-label="Search browsing history" placeholder="Find a page you remember…" value={search} onChange={event => { setSearch(event.target.value); setConfirm(null); }}/></label>
    <div className="tools-footer"><label className="field-label">History space<select className="text-field" value={spaceId} onChange={event => { setSpaceId(event.target.value); setConfirm(null); }}><option value="">All spaces</option>{state.spaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}</select></label><label className="field-label">History time range<select className="text-field" value={timeRange} onChange={event => { setTimeRange(event.target.value); setConfirm(null); }}><option value="all">All time</option><option value="last24h">Last 24 hours</option><option value="last7days">Last 7 days</option><option value="last30days">Last 30 days</option></select></label></div>
    <div className="tools-list history-list">
      {entries.length ? groupHistoryByDay(entries.slice(0, 200)).map(group => <React.Fragment key={group.key}><div className="tools-day">{new Date(group.visitedAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</div>{group.entries.map(entry => <div className="tools-entry" key={entry.id}><button className="tools-entry-main" onClick={() => onOpen(entry.url, entry.title)}><Globe2 size={17}/><span><strong>{entry.title || domain(entry.url)}</strong><small>{domain(entry.url)} · {state.spaces.find(space => space.id === entry.spaceId)?.name || 'Previous space'}</small></span><ArrowUpRight size={14}/></button><button className="icon-button" aria-label={`Remove history entry ${entry.title}`} onClick={() => { setState(previous => ({ ...previous, history: (previous.history || []).filter(item => item.id !== entry.id) })); setConfirm(null); }}><X size={13}/></button></div>)}</React.Fragment>) : <Empty title={filtered ? 'No matching pages.' : 'A fresh trail.'}>{filtered ? 'Try different search, space, or time filters.' : 'Pages you visit in the desktop browser will appear here.'}</Empty>}
    </div>
    {!!state.history?.length && <div className="tools-footer">{confirm ? <><span>{confirm.all ? 'Clear all saved browsing history?' : `Clear only these ${confirm.ids.size} matching history entries? Other visits will be kept.`} This removes saved visit records only; website data is not erased.</span><button className="danger-button" onClick={() => { setState(previous => ({ ...previous, history: (previous.history || []).filter(entry => !confirm.ids.has(entry.id)) })); setConfirm(null); }}>{confirm.all ? 'Clear history' : 'Clear matching entries'}</button><button onClick={() => setConfirm(null)}>Keep it</button></> : <><span>{entries.length} matching visits of {state.history.length} · showing up to 200 matches</span><button disabled={!entries.length} onClick={() => requestClear(!filtered)}><Trash2 size={13}/>{filtered ? 'Clear matching entries' : 'Clear history'}</button>{filtered && <button onClick={() => requestClear(true)}>Clear entire history</button>}</>}</div>}
  </>;
}

function fileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export function DownloadsPanel({ downloads, notify }) {
  const run = promise => promise?.catch(() => notify('This download is no longer available.'));
  return <><span className="eyebrow">YOURS TO KEEP</span><h2>Your downloads.</h2><p>Save deliberately. Files never open automatically.</p>
    <div className="tools-list">{downloads.length ? downloads.map(item => <div className="download-entry" key={item.id}><File size={22}/><div><strong>{item.filename}</strong><small>{item.state === 'progressing' ? `${fileSize(item.receivedBytes)} of ${fileSize(item.totalBytes)}` : `${item.state === 'completed' ? 'Saved' : item.state === 'cancelled' ? 'Cancelled' : 'Interrupted'} · ${fileSize(item.totalBytes)}`}</small>{item.state === 'progressing' && <progress aria-label={`Downloading ${item.filename}`} value={item.totalBytes > 0 ? item.receivedBytes : undefined} max={item.totalBytes || undefined}/>}</div>{item.state === 'completed' ? <button className="icon-button" aria-label={`Show ${item.filename} in folder`} onClick={() => run(window.cove?.showDownload(item.id))}><FolderOpen size={17}/></button> : item.state === 'progressing' && <button className="icon-button" aria-label={`Cancel ${item.filename}`} onClick={() => run(window.cove?.cancelDownload(item.id))}><X size={16}/></button>}</div>) : <Empty icon={ArrowDownToLine} title="Nothing tucked away yet.">Desktop downloads will appear here for this session.</Empty>}</div>
    <div className="tools-footer"><span>Session history only. Your saved files stay on disk.</span></div>
  </>;
}

export function FavoritesPanel({ state, setState, notify }) {
  const favorites = state.shortcuts || DEFAULT_SHORTCUTS;
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const save = event => {
    event.preventDefault();
    const address = normalizeUrl(url);
    if (!address || address === HOME || !/^https?:\/\//i.test(url.trim()) && !url.includes('.')) { notify('Enter a website address, not a search.'); return; }
    const item = { id: editing || uid(), title: title.trim().slice(0, 40), url: address };
    if (!item.title) return;
    setState(previous => ({ ...previous, shortcuts: editing ? (previous.shortcuts || DEFAULT_SHORTCUTS).map(favorite => favorite.id === editing ? item : favorite) : [...(previous.shortcuts || DEFAULT_SHORTCUTS), item].slice(0, 12) }));
    setEditing(null); setTitle(''); setUrl('');
  };
  const reorder = (index, offset) => setState(previous => {
    const next = [...(previous.shortcuts || DEFAULT_SHORTCUTS)];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    return { ...previous, shortcuts: next };
  });
  return <><span className="eyebrow">THE PLACES THAT MATTER</span><h2>Keep your favorites close.</h2><p>Your shortcuts, in the sidebar and on every new tab.</p>
    <div className="tools-list favorites-list">{favorites.map((item, index) => <div className="tools-entry" key={item.id}><button className="tools-entry-main" aria-label={`Edit favorite ${item.title}`} onClick={() => { setEditing(item.id); setTitle(item.title); setUrl(item.url); }}><Globe2 size={17}/><span><strong>{item.title}</strong><small>{domain(item.url)}</small></span></button><button className="icon-button" disabled={!index} aria-label={`Move ${item.title} up`} onClick={() => reorder(index, -1)}><ArrowUp size={13}/></button><button className="icon-button" disabled={index === favorites.length - 1} aria-label={`Move ${item.title} down`} onClick={() => reorder(index, 1)}><ArrowDown size={13}/></button><button className="icon-button" aria-label={`Remove favorite ${item.title}`} onClick={() => { setState(previous => ({ ...previous, shortcuts: (previous.shortcuts || DEFAULT_SHORTCUTS).filter(favorite => favorite.id !== item.id) })); if (editing === item.id) { setEditing(null); setTitle(''); setUrl(''); } }}><X size={14}/></button></div>)}</div>
    {(favorites.length < 12 || editing) && <form className="favorite-form" onSubmit={save}><label className="field-label">Name<input className="text-field" aria-label="Favorite name" maxLength={40} value={title} placeholder="e.g. My reading corner" onChange={event => setTitle(event.target.value)}/></label><label className="field-label">Address<input className="text-field" aria-label="Favorite address" maxLength={16000} value={url} placeholder="https://…" onChange={event => setUrl(event.target.value)}/></label><div className="form-actions"><button className="primary-button" disabled={!title.trim() || !url.trim()}>{editing ? 'Save favorite' : 'Add favorite'}<Plus size={14}/></button>{editing && <button type="button" onClick={() => { setEditing(null); setTitle(''); setUrl(''); }}>Cancel edit</button>}</div></form>}
  </>;
}

export function SpacePanel({ state, setState, onClose }) {
  const space = state.spaces.find(item => item.id === state.activeSpaceId);
  const [name, setName] = useState(space.name);
  const [confirm, setConfirm] = useState(false);
  const count = state.tabs.filter(tab => tab.spaceId === space.id).length;
  return <><span className="eyebrow">A ROOM OF YOUR OWN</span><h2>Your {space.name} space.</h2><p>{count} tabs. Its own cookies and signed-in sessions.</p><form onSubmit={event => { event.preventDefault(); setState(previous => renameSpace(previous, space.id, name)); onClose(); }}><label className="field-label">Space name<input className="text-field" aria-label="Rename space" maxLength={40} value={name} onChange={event => setName(event.target.value)}/></label><button className="primary-button" disabled={!name.trim()}>Save space<Check size={15}/></button></form><div className="tools-footer space-delete">{confirm ? <><p>Remove this space and its {count} tabs from the workspace? The space’s website data is not erased.</p><button className="danger-button" onClick={() => { setState(previous => deleteSpace(previous, space.id)); onClose(); }}>Remove space</button><button onClick={() => setConfirm(false)}>Keep space</button></> : <button disabled={state.spaces.length === 1} onClick={() => setConfirm(true)}><Trash2 size={14}/>Remove this space</button>}</div></>;
}

export function BookmarkImportPanel({ state, setState, notify, onClose }) {
  const inputRef = useRef(null);
  const [exportScope, setExportScope] = useState('all');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const exportBookmarks = () => {
    let objectUrl;
    let anchor;
    try {
      const html = buildBookmarkExport(state, exportScope === 'current' ? { spaceId: state.activeSpaceId } : {});
      objectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = exportScope === 'current' ? 'cove-bookmarks-current-space.html' : 'cove-bookmarks-all-spaces.html';
      document.body.append(anchor);
      anchor.click();
      notify('Bookmark export requested. The HTML file persists outside Cove.');
    } catch { setError('Bookmarks could not be exported. Try again.'); }
    finally {
      anchor?.remove();
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  };
  const read = async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setReading(true); setError(''); setPreview(null);
    try {
      if (file.size > 5_000_000) throw new Error('Choose a bookmarks HTML file smaller than 5 MB.');
      const seen = new Set(state.tabs.filter(tab => tab.spaceId === state.activeSpaceId).map(tab => tab.url));
      const links = [];
      for (const bookmark of parseBookmarks(await file.text())) {
        if (seen.has(bookmark.url)) continue;
        seen.add(bookmark.url); links.push(bookmark);
      }
      if (!links.length) throw new Error('No new HTTP or HTTPS bookmarks found. Existing links are skipped.');
      setPreview(links);
    } catch (failure) { setError(failure.message || 'This file could not be read.'); }
    finally { setReading(false); }
  };
  const capacity = Math.max(0, 500 - state.tabs.length);
  const importLinks = () => {
    if (!preview?.length || !capacity) return;
    setState(previous => {
      const existing = new Set(previous.tabs.filter(tab => tab.spaceId === previous.activeSpaceId).map(tab => tab.url));
      const links = preview.filter(link => !existing.has(link.url)).slice(0, 500 - previous.tabs.length);
      if (!links.length) return previous;
      const folders = [...previous.folders];
      const groups = new Map();
      const imported = links.map(({ folder, ...link }) => {
        const name = (folder || 'Imported bookmarks').slice(0, 80);
        if (!groups.has(name) && folders.length < 200) { const id = uid(); groups.set(name, id); folders.push({ id, spaceId: previous.activeSpaceId, name }); }
        return { ...link, id: uid(), spaceId: previous.activeSpaceId, pinned: true, ...(groups.get(name) ? { folderId: groups.get(name) } : {}) };
      });
      return { ...previous, folders, tabs: [...previous.tabs, ...imported] };
    });
    notify('Bookmarks added to this space. Nothing was replaced.'); onClose();
  };
  return <><span className="eyebrow">BRING YOUR CORNERS WITH YOU</span><h2>A softer landing.</h2><p>Export bookmarks as HTML from your old browser, then bring them into this space. We never read browser profiles.</p><input type="file" accept="text/html,.html,.htm" ref={inputRef} hidden onChange={read}/><button className="import-dropzone" disabled={reading} onClick={() => inputRef.current.click()}><FolderOpen size={26}/><strong>{reading ? 'Reading your bookmarks…' : 'Choose bookmarks HTML'}</strong><small>Chrome, Firefox, Safari, or any Netscape-format export</small></button>{error && <p className="tools-error" role="alert">{error}</p>}{preview && <><div className="import-summary"><Check size={16}/><span>{preview.length} new bookmarks found</span></div><div className="tools-list import-preview">{preview.slice(0, 6).map(link => <div key={link.url}><Globe2 size={14}/><span>{link.title}</span><small>{domain(link.url)}</small></div>)}{preview.length > 6 && <small>And {preview.length - 6} more…</small>}</div>{preview.length > capacity && <p className="tools-error">Room for {capacity} more tabs. Only the first {capacity} bookmarks will be imported.</p>}<button className="primary-button" disabled={!capacity} onClick={importLinks}>Import {Math.min(preview.length, capacity)} bookmarks<ArrowUpRight size={15}/></button></>}<div className="tools-footer"><label className="field-label">Bookmark export scope<select className="text-field" value={exportScope} onChange={event => setExportScope(event.target.value)}><option value="all">All spaces</option><option value="current">Current space</option></select></label><button onClick={exportBookmarks}><ArrowDownToLine size={15}/>Export bookmarks HTML</button></div><p>Exports live tabs grouped by space and folder, plus global favorites separately in either scope. Duplicate URLs are kept across groups; within each group the first wins. Cove Home, history, notes, permission grants, cookies, and archives are excluded.</p>{window.cove?.isPrivate && <p className="tools-error">Private window: exporting creates an explicit persistent HTML file. It remains on disk after this private window closes.</p>}</>;
}

export function FindBar({ tabId, result, notify, onClose }) {
  const [text, setText] = useState('');
  const find = forward => {
    if (!text) return;
    window.cove?.findInPage({ tabId, text, forward }).catch(() => notify('This page could not be searched.'));
  };
  return <form className="find-bar" role="search" aria-label="Find in page" onSubmit={event => { event.preventDefault(); find(!event.nativeEvent.shiftKey); }}><Search size={15}/><input autoFocus aria-label="Find in page" placeholder="Find in this page…" value={text} maxLength={500} onChange={event => { setText(event.target.value); if (event.target.value) window.cove?.findInPage({ tabId, text: event.target.value, forward: true }).catch(() => notify('This page could not be searched.')); else window.cove?.stopFind(tabId).catch(() => {}); }}/><span className="find-count" role="status">{text && result ? `${result.activeMatchOrdinal || 0} / ${result.matches || 0}` : ''}</span><button type="button" className="icon-button" aria-label="Previous match" disabled={!text} onClick={() => find(false)}><ChevronUp size={16}/></button><button type="submit" className="icon-button" aria-label="Next match" disabled={!text}><ChevronDown size={16}/></button><button type="button" className="icon-button" aria-label="Close find" onClick={onClose}><X size={16}/></button></form>;
}
