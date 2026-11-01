import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { getSplitLayout } from './splits.js';
import './resource-settings.css';

function selectedIds(state) {
  const split = getSplitLayout(state);
  return new Set([state.activeTabId, split?.primaryId, split?.secondaryId].filter(Boolean));
}

function lifecycle(resource) {
  return [resource.sleeping && 'Sleeping', resource.loaded && 'Loaded', resource.visible && 'Visible',
    resource.audible && 'Playing audio', resource.loading && 'Loading',
    !resource.loaded && !resource.sleeping && 'Not loaded'].filter(Boolean).join(' · ');
}

function reasonText(reason) {
  return typeof reason === 'string' && reason.trim() ? reason : '';
}

export default function ResourceSettings({ state, notify, onDataCleared }) {
  const headingId = useId();
  const selectId = useId();
  const warningId = useId();
  const currentSpace = state.spaces.find(space => space.id === state.activeSpaceId);
  const split = getSplitLayout(state);
  const contextKey = JSON.stringify([state.activeSpaceId, currentSpace?.name, state.activeTabId,
    split?.primaryId, split?.secondaryId, state.tabs.map(tab => [tab.id, tab.spaceId, tab.url])]);
  const latest = useRef({ state, contextKey, version: 0 });
  if (latest.current.contextKey !== contextKey) latest.current.version += 1;
  latest.current = { state, contextKey, version: latest.current.version };
  const mounted = useRef(false);
  const request = useRef(0);
  const operation = useRef(false);
  const [resources, setResources] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [selectedSpace, setSelectedSpace] = useState('');
  const sleepAvailable = typeof window.cove?.sleepTab === 'function';
  const resetAvailable = typeof window.cove?.clearSpaceData === 'function';

  const refresh = useCallback(async () => {
    const sequence = ++request.current;
    const version = latest.current.version;
    setStatus('loading');
    setResources([]);
    setError('');
    if (typeof window.cove?.getTabResources !== 'function') {
      setStatus('unavailable');
      return;
    }
    try {
      const result = await window.cove.getTabResources();
      if (!Array.isArray(result) || result.some(resource => !resource || typeof resource.id !== 'string'
        || typeof resource.spaceId !== 'string' || ['loaded', 'visible', 'audible', 'loading', 'sleeping', 'canSleep']
          .some(key => typeof resource[key] !== 'boolean'))) throw new Error('Invalid resource response');
      if (!mounted.current || sequence !== request.current || version !== latest.current.version) return;
      setResources(result);
      setStatus('ready');
    } catch {
      if (!mounted.current || sequence !== request.current || version !== latest.current.version) return;
      setError('Couldn’t refresh tab resources. Refresh before making changes.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current += 1; };
  }, []);

  useEffect(() => {
    setConfirmation(null);
    setSelectedSpace('');
    setMessage('');
    void refresh();
  }, [contextKey, refresh]);

  const announce = text => {
    if (mounted.current) setMessage(text);
    notify?.(text);
  };
  const targetIsCurrent = target => target.version === latest.current.version
    && target.spaceId === latest.current.state.activeSpaceId;
  const busy = pending || status === 'loading';
  const ready = status === 'ready' && !pending;

  const confirmOperation = async () => {
    const target = confirmation;
    if (!target || operation.current || status !== 'ready') return;
    if (!targetIsCurrent(target)) {
      setConfirmation(null);
      announce('The space or tab selection changed. Review the current space again.');
      return;
    }
    operation.current = true;
    setPending(true);
    setConfirmation(null);
    setError('');
    setMessage('');
    let attemptedReset = false;
    try {
      if (target.kind === 'sleep') {
        const snapshot = await window.cove.getTabResources();
        const resource = Array.isArray(snapshot) && snapshot.find(entry => entry.id === target.id && entry.spaceId === target.spaceId);
        const current = latest.current.state;
        if (!targetIsCurrent(target) || !current.tabs.some(tab => tab.id === target.id && tab.spaceId === target.spaceId)
          || selectedIds(current).has(target.id) || !resource?.canSleep || resource.visible
          || resource.audible || resource.loading || resource.sleeping || !resource.loaded) {
          announce('This tab can no longer be put to sleep. Its current state has been refreshed.');
          return;
        }
        const result = await window.cove.sleepTab(target.id);
        announce(result?.ok === true ? `“${target.name}” is now sleeping.`
          : `Couldn’t put “${target.name}” to sleep.${reasonText(result?.reason) ? ` ${reasonText(result.reason)}` : ''}`);
      } else {
        if (!targetIsCurrent(target) || typeof window.cove?.clearSpaceData !== 'function') {
          announce('The space changed or desktop reset is unavailable. Nothing was reset.');
          return;
        }
        attemptedReset = true;
        const result = await window.cove.clearSpaceData({ spaceId: target.spaceId, confirmed: true });
        const detail = reasonText(result?.reason);
        announce(result?.partial
          ? `“${target.name}” was only partially reset. Some site data may remain.${detail ? ` ${detail}` : ''} Review before trying again.`
          : result?.ok === true ? `Site data for “${target.name}” was reset.`
            : `Couldn’t fully reset “${target.name}”. Some data may have changed.${detail ? ` ${detail}` : ''} Review before trying again.`);
      }
    } catch {
      announce(attemptedReset
        ? `The reset of “${target.name}” could not be confirmed. Some site data may have changed. Review before trying again.`
        : 'Couldn’t complete the sleep request. Refresh and review the tab before trying again.');
    } finally {
      if (attemptedReset) {
        try { await onDataCleared?.(); }
        catch { if (mounted.current) setError('The reset was attempted, but the desktop layout could not be resynced. Reopen Settings to review.'); }
      }
      operation.current = false;
      if (mounted.current) {
        setPending(false);
        setSelectedSpace('');
        await refresh();
      }
    }
  };

  const protectedTabs = selectedIds(state);
  const currentResources = resources.filter(resource => resource.spaceId === state.activeSpaceId);
  return <section className="resource-settings" aria-labelledby={headingId}>
    <div className="resource-settings-heading">
      <div><h3 id={headingId}>Tabs &amp; site data</h3><p>Real tab activity. A little more room to breathe.</p></div>
      <button type="button" onClick={() => { setConfirmation(null); void refresh(); }} disabled={busy}>Refresh</button>
    </div>
    <p className="resource-settings-note">Selected tabs in either split pane stay protected, even while Settings covers them. Sleeping a tab is not archiving it.</p>
    <div role="status" aria-live="polite" aria-atomic="true">
      {pending ? 'Applying your change…' : status === 'loading' ? 'Checking desktop tab resources…' : message}
    </div>
    {error && <div className="resource-settings-error" role="alert"><span>{error}</span>
      <button type="button" disabled={busy} onClick={() => { setConfirmation(null); void refresh(); }}>Retry</button>
    </div>}
    {status === 'unavailable' && <p className="resource-settings-note">Live tab resources and tab sleeping are desktop-only. This web demo or desktop version does not expose the resource API; no activity or memory usage is estimated here.</p>}
    {status === 'ready' && <>
      <h4>Tabs in {currentSpace?.name || 'the current space'}</h4>
      {!sleepAvailable && <p className="resource-settings-note">Tab sleeping is not available in this desktop version.</p>}
      {currentResources.length === 0 ? <p className="resource-settings-note">No native tab resources were reported for this space.</p>
        : <ul className="resource-settings-list">{currentResources.map(resource => {
          const tab = state.tabs.find(entry => entry.id === resource.id && entry.spaceId === resource.spaceId);
          const protectedTab = protectedTabs.has(resource.id);
          const eligible = Boolean(tab) && resource.canSleep && resource.loaded && !resource.sleeping
            && !resource.visible && !resource.audible && !resource.loading && !protectedTab;
          const explanation = protectedTab ? 'Protected: selected in a pane.'
            : reasonText(resource.reason) || (!eligible ? 'Not eligible for sleep.' : 'Can be put to sleep.');
          return <li key={resource.id}><div className="resource-settings-tab">
            <strong>{tab?.title || resource.id}</strong><span>{lifecycle(resource)}</span><small>{explanation}</small>
          </div><button type="button" disabled={!ready || !sleepAvailable || !eligible || Boolean(confirmation)}
            aria-label={`Sleep ${tab?.title || resource.id}`} onClick={() => setConfirmation({ kind: 'sleep', id: resource.id,
              spaceId: resource.spaceId, name: tab?.title || resource.id, version: latest.current.version })}>Sleep</button></li>;
        })}</ul>}
    </>}
    <div className="resource-settings-reset">
      <h4>Reset this space’s site data</h4>
      <p id={warningId}>Signs you out, stops this space’s tabs, and loses unsaved forms. Resets cookies, site storage, cache, and authentication only. Keeps your workspace, history, bookmarks, and files. Permission grants are not reset.</p>
      {!resetAvailable && <p className="resource-settings-note">Space data reset is desktop-only and unavailable in this version. No browser data has been changed.</p>}
      <label htmlFor={selectId}>Space to reset</label>
      <select id={selectId} value={selectedSpace} aria-describedby={warningId} disabled={!ready || !resetAvailable || Boolean(confirmation) || !currentSpace}
        onChange={event => setSelectedSpace(event.target.value)}>
        <option value="">Choose the current space</option>
        {currentSpace && <option value={currentSpace.id}>{currentSpace.name} (current space)</option>}
      </select>
      <button type="button" className="resource-settings-danger" disabled={!ready || !resetAvailable || !currentSpace || selectedSpace !== currentSpace.id || Boolean(confirmation)}
        onClick={() => setConfirmation({ kind: 'reset', spaceId: currentSpace.id, name: currentSpace.name, version: latest.current.version })}>Review site data reset</button>
    </div>
    {confirmation && <div className="resource-settings-confirm" role="group" aria-label={confirmation.kind === 'sleep' ? 'Confirm tab sleep' : 'Confirm space reset'}>
      <strong>{confirmation.kind === 'sleep' ? `Put “${confirmation.name}” to sleep?` : `Reset site data for “${confirmation.name}”?`}</strong>
      <p>{confirmation.kind === 'sleep' ? 'Unsaved forms will be lost. The tab stays in your workspace and can reload when selected. Selected split panes cannot be put to sleep.'
        : `Only “${confirmation.name}” will be reset. You will be signed out, its tabs will stop, and unsaved forms will be lost. Cookies, storage, cache, and authentication will be reset. Workspace, history, bookmarks, files, and permission grants are preserved.`}</p>
      <div className="resource-settings-actions"><button type="button" autoFocus onClick={() => setConfirmation(null)}>Cancel</button>
        <button type="button" className="resource-settings-danger" disabled={!ready || !targetIsCurrent(confirmation)} onClick={confirmOperation}>
          {confirmation.kind === 'sleep' ? 'Confirm sleep' : `Reset “${confirmation.name}” site data`}</button></div>
    </div>}
  </section>;
}
