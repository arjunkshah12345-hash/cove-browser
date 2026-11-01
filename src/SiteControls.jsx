import React, { useEffect, useId, useRef, useState } from 'react';
import { Camera, LockKeyhole, MapPin, Bell } from 'lucide-react';
import './site-controls.css';

const PERMISSIONS = [
  { key: 'geolocation', label: 'Location', description: 'Share your location with this site.', icon: MapPin },
  { key: 'notifications', label: 'Notifications', description: 'Let this site send notifications.', icon: Bell },
  { key: 'media', label: 'Camera + microphone', description: 'Allow future camera and microphone requests.', icon: Camera }
];

function readSettings(value) {
  if (!value || typeof value.eligible !== 'boolean' ||
    (value.origin != null && typeof value.origin !== 'string') ||
    (value.eligible && !value.origin) ||
    !PERMISSIONS.every(({ key }) => typeof value.permissions?.[key] === 'boolean')) {
    throw new Error('Invalid site permissions response.');
  }
  return value;
}

function SitePermissionPanel({ tabId, notify }) {
  const id = useId();
  const validTab = typeof tabId === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(tabId);
  const [settings, setSettings] = useState(null);
  const [pending, setPending] = useState(validTab);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    if (validTab) {
      setPending(true);
      setError('');
      Promise.resolve().then(() => {
        if (typeof window.cove?.getSitePermissions !== 'function') {
          throw new Error('Site controls are unavailable.');
        }
        return window.cove.getSitePermissions(tabId);
      }).then(readSettings).then(value => {
        if (!cancelled) setSettings(value);
      }).catch(() => {
        if (!cancelled) setError('Couldn’t load site permissions. Open this page in the desktop browser and try again.');
      }).finally(() => {
        if (!cancelled) setPending(false);
      });
    }
    return () => { cancelled = true; mounted.current = false; };
  }, [tabId, validTab, attempt]);

  const disabled = pending || !validTab || !settings?.eligible || !!error;

  async function updatePermission(permission, allowed) {
    if (disabled || busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    setStatus('');
    let message;
    try {
      const api = window.cove;
      const result = permission
        ? await api.setSitePermission({ tabId, origin: settings.origin, permission, allowed })
        : await api.clearSitePermissions({ tabId, origin: settings.origin });
      const next = readSettings(result);
      if (!mounted.current) return;
      setSettings(next);
      message = !next.eligible ? 'This page no longer supports site permissions.' : permission
        ? 'Site permission updated for future requests.'
        : 'Site permissions reset. All future requests are blocked.';
      setStatus(message);
    } catch {
      if (mounted.current) setError('Couldn’t save site permissions. Retry to check the current settings before making another change.');
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
    if (message && mounted.current && typeof notify === 'function') notify(message);
  }

  return <section className="site-controls" aria-labelledby={`${id}-heading`} aria-busy={pending}>
    <span className="eyebrow">A LITTLE MORE PRIVACY</span>
    <h2 id={`${id}-heading`}>This site, your rules.</h2>
    <div className="site-controls-origin" dir="auto">{settings?.origin || 'No eligible site selected'}</div>
    <p className="site-controls-intro">Blocked by default. These choices are kept in memory for this space and site origin only, and apply to future requests.</p>
    <div className="site-controls-status" role="status" aria-live="polite" aria-atomic="true">
      {pending ? (settings ? 'Saving site permissions…' : 'Loading site permissions…') : !validTab
        ? 'Select a website tab to manage its permissions.'
        : settings && !settings.eligible ? 'Permissions aren’t available for this page. Open a supported website to make changes.' : status}
    </div>
    {error && <div className="site-controls-error" role="alert"><span>{error}</span><button type="button" disabled={pending} onClick={() => { setSettings(null); setAttempt(value => value + 1); }}>Retry</button></div>}
    <div className="site-controls-list" role="group" aria-label="Site permissions">
      {PERMISSIONS.map(({ key, label, description, icon: Icon }) => <div className="site-controls-row" key={key}>
        <Icon size={18} aria-hidden="true"/>
        <div className="site-controls-copy"><label id={`${id}-${key}-label`} htmlFor={`${id}-${key}`}>{label}</label><small id={`${id}-${key}-description`}>{description}</small></div>
        <label className="site-controls-switch">
          <input id={`${id}-${key}`} type="checkbox" role="switch" checked={settings?.permissions[key] === true} disabled={disabled} aria-labelledby={`${id}-${key}-label`} aria-describedby={`${id}-${key}-description`} onChange={event => updatePermission(key, event.target.checked)}/>
          <span className="site-controls-track" aria-hidden="true"><span/></span>
          <span className="site-controls-switch-state" aria-hidden="true">{settings?.permissions[key] ? 'Allowed' : 'Blocked'}</span>
        </label>
      </div>)}
      <div className="site-controls-row site-controls-locked"><LockKeyhole size={18} aria-hidden="true"/><div className="site-controls-copy"><strong>Display capture</strong><small>Screen sharing always stays blocked.</small></div><span>Blocked</span></div>
    </div>
    <p className="site-controls-note">Pages aren’t reloaded automatically. Reload if needed for a new request. Revoking access won’t stop an already active camera or microphone stream; close the tab to stop it.</p>
    <button className="site-controls-reset" type="button" disabled={disabled} onClick={() => updatePermission(null)}>Reset site permissions</button>
  </section>;
}

export function SiteControls({ tabId, notify }) {
  return <SitePermissionPanel key={tabId ?? 'no-tab'} tabId={tabId} notify={notify}/>;
}

export default SiteControls;
