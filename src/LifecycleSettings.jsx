import React, { useId } from 'react';
import { getAutoArchiveHours } from './lifecycle.js';

export default function LifecycleSettings({ state, setState }) {
  const inputId = useId();
  const descriptionId = useId();
  return <section className="lifecycle-settings" aria-label="Tab lifecycle">
    <label className="field-label" htmlFor={inputId}>Auto-archive inactive tabs</label>
    <select className="text-field" id={inputId} aria-describedby={descriptionId} value={getAutoArchiveHours(state)} onChange={event => {
      const autoArchiveHours = Number(event.target.value);
      setState(previous => ({ ...previous, autoArchiveHours }));
    }}>
      <option value="0">Off</option>
      <option value="24">After 24 hours</option>
      <option value="168">After 7 days</option>
      <option value="720">After 30 days</option>
    </select>
    <p id={descriptionId}>Off by default. Pinned tabs, favorites, and tabs visible in either pane are never auto-archived. Recover auto-archived tabs from the Archive, which keeps the 100 most recently closed tabs.</p>
  </section>;
}
