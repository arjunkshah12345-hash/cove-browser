import React, { useId, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { deleteFolder, renameFolder } from './folders.js';

function FolderEditor({ folder, setState, notify }) {
  const [name, setName] = useState(folder.name);
  const [confirm, setConfirm] = useState(false);
  const inputId = useId();
  const explanationId = useId();
  const update = operation => setState(previous => previous.activeSpaceId === folder.spaceId
    && previous.folders.some(entry => entry.id === folder.id && entry.spaceId === folder.spaceId)
    ? operation(previous) : previous);

  return <>
    <form aria-label={`Rename folder ${folder.name}`} onSubmit={event => {
      event.preventDefault();
      if (!name.trim()) return;
      update(previous => renameFolder(previous, folder.id, name));
      notify?.('Folder renamed.');
    }}>
      <label className="field-label" htmlFor={inputId}>Folder name</label>
      <input className="text-field" id={inputId} value={name} maxLength={80} required onChange={event => setName(event.target.value)}/>
      <div className="form-actions"><button type="submit" className="primary-button" disabled={!name.trim()}>Save name</button></div>
    </form>
    <div className="tools-footer space-delete">
      <p id={explanationId}>Deleting a folder keeps all its tabs, including archived tabs. Only their folder assignment is removed.</p>
      {confirm ? <>
        <p role="status">Delete “{folder.name}”? Your tabs will be kept.</p>
        <button type="button" className="danger-button" aria-describedby={explanationId} onClick={() => {
          update(previous => deleteFolder(previous, folder.id));
          setConfirm(false);
          notify?.('Folder deleted. All tabs kept.');
        }}>Confirm delete folder</button>
        <button type="button" onClick={() => setConfirm(false)}>Cancel</button>
      </> : <button type="button" className="danger-button" aria-describedby={explanationId} onClick={() => setConfirm(true)}>Delete folder</button>}
    </div>
  </>;
}

export function FolderControls({ state, setState, notify }) {
  const [selection, setSelection] = useState(null);
  const folders = state.folders.filter(folder => folder.spaceId === state.activeSpaceId);
  const selected = folders.find(folder => folder.id === selection) || folders[0];

  return <>
    <span className="eyebrow">KEEP THINGS TOGETHER</span>
    <h2>Your folders.</h2>
    <p>Rename or remove folders in this space. Your tabs stay with you.</p>
    {selected ? <>
      <div className="tools-list" role="group" aria-label="Folders in this space">
        {folders.map(folder => <div className="tools-entry" key={folder.id}>
          <button type="button" className="tools-entry-main" aria-pressed={folder.id === selected.id} onClick={() => setSelection(folder.id)}>
            <FolderOpen size={17} aria-hidden="true"/><span><strong>{folder.name}</strong></span>
          </button>
        </div>)}
      </div>
      <FolderEditor key={`${selected.spaceId}:${selected.id}:${selected.name}`} folder={selected} setState={setState} notify={notify}/>
    </> : <div className="tools-empty">
      <FolderOpen size={28} aria-hidden="true"/><h3>No folders yet.</h3>
      <p>This space has no folders. Create one from the sidebar to organize pinned tabs.</p>
    </div>}
  </>;
}

export default FolderControls;
