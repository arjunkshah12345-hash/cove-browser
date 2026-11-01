import React, { useId, useRef, useState } from 'react';
import { applyHistoryRetention, getHistoryRetentionDays } from './retention.js';

export default function RetentionSettings({ state, setState, notify }) {
  const inputId = useId();
  const descriptionId = useId();
  const confirmationId = useId();
  const inputRef = useRef(null);
  const [pending, setPending] = useState(null);
  const days = getHistoryRetentionDays(state);
  const review = historyRetentionDays => {
    const now = Date.now();
    const preview = applyHistoryRetention({ ...state, historyRetentionDays }, { now });
    setPending({ days: historyRetentionDays, now, history: state.history, previousDays: days, count: (state.history?.length ?? 0) - (preview.history?.length ?? 0) });
  };
  const stale = pending && (pending.history !== state.history || pending.previousDays !== days);
  const cancel = () => { setPending(null); inputRef.current?.focus(); };

  return <section className="lifecycle-settings" aria-label="History retention">
    <label className="field-label" htmlFor={inputId}>Keep browsing history</label>
    <select className="text-field" id={inputId} ref={inputRef} aria-describedby={descriptionId} value={pending?.days ?? days} onChange={event => {
      const historyRetentionDays = Number(event.target.value);
      if (historyRetentionDays === days) { cancel(); return; }
      if (historyRetentionDays) { review(historyRetentionDays); return; }
      setPending(null);
      setState(previous => ({ ...previous, historyRetentionDays: 0 }));
      notify?.('History age limit turned off. Previously removed history cannot be recovered.');
    }}>
      <option value="0">No age limit (up to 1,000 visits)</option>
      <option value="1">1 day</option>
      <option value="7">7 days</option>
      <option value="30">30 days</option>
      <option value="90">90 days</option>
    </select>
    <p id={descriptionId}>Applies only to workspace history across all spaces, with a maximum of 1,000 visits. Open tabs, Archive, cookies, and website data are unaffected. Increasing the limit cannot restore removed visits here. Recovery backups and earlier exports may still contain them; this is not secure erasure. Private windows apply this setting in memory only.</p>
    {pending && <div className="tools-footer" role="group" aria-labelledby={confirmationId}>
      <p id={confirmationId} role="status">{stale ? 'History or its retention setting changed. Review the updated preview before confirming.' : `Keep ${pending.days} ${pending.days === 1 ? 'day' : 'days'} of history? This immediately removes ${pending.count} saved ${pending.count === 1 ? 'visit' : 'visits'} from this workspace. Future expired visits will also be removed automatically. This cannot be undone here.`}</p>
      {stale ? <button type="button" onClick={() => review(pending.days)}>Review updated preview</button> : <button type="button" className="danger-button" onClick={() => {
        setState(previous => previous.history === pending.history && getHistoryRetentionDays(previous) === pending.previousDays
          ? applyHistoryRetention({ ...previous, historyRetentionDays: pending.days }, { now: pending.now })
          : previous);
        cancel();
      }}>Confirm history retention</button>}
      <button type="button" onClick={cancel}>Cancel</button>
    </div>}
  </section>;
}
