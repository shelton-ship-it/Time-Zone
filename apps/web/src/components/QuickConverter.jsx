import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { zonedTimeToUtc, offsetLabel } from '../lib/tz.js';
import { fmtShortDate } from './ui.jsx';
import { diffLabel } from './helpers.js';

/** Compact converter used on the homepage; full tool lives at /converter. */
export function quickConvert(now, prefs) {
  const [fromTz, setFrom] = useState(prefs.referenceCity?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [toTz, setTo] = useState('Asia/Tokyo');
  const zones = ['Etc/UTC', 'Africa/Maputo', 'Europe/London', 'America/New_York', 'Asia/Dubai', 'Australia/Sydney', 'Asia/Tokyo', 'America/Los_Angeles', 'Europe/Berlin', 'Asia/Kolkata'];
  const r = zonedTimeToUtc(...splitInstant(now), fromTz);
  return (
    <div className="card row" role="group" aria-label="Quick timezone conversion">
      <label className="mb0" style={{ display: 'grid', gap: 4 }}>From
        <select value={fromTz} onChange={e => setFrom(e.target.value)}>{zones.map(z => <option key={z}>{z}</option>)}</select>
      </label>
      <label className="mb0" style={{ display: 'grid', gap: 4 }}>To
        <select value={toTz} onChange={e => setTo(e.target.value)}>{zones.map(z => <option key={z}>{z}</option>)}</select>
      </label>
      <div>
        <div className="mono dim">{fmtShortDate(now, fromTz)} <strong style={{ color: 'var(--text)' }}>{new Intl.DateTimeFormat('en-GB', { timeZone: fromTz, hour: '2-digit', minute: '2-digit', hour12: prefs.hour12 }).format(now)}</strong></div>
        <div className="mono">↓</div>
        <div className="mono dim">{fmtShortDate(now, toTz)} <strong style={{ color: 'var(--text)' }}>{new Intl.DateTimeFormat('en-GB', { timeZone: toTz, hour: '2-digit', minute: '2-digit', hour12: prefs.hour12 }).format(now)}</strong></div>
      </div>
      <span className="pill accent">{diffLabel(fromTz, toTz, now)}</span>
      <Link to="/converter" className="btn small">Full converter →</Link>
    </div>
  );
}
function splitInstant(ms) {
  // use *current* UTC components — quick converter only shows "now"
  const d = new Date(ms);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()];
}
