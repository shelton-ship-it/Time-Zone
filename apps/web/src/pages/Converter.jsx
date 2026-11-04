import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { zonedTimeToUtc, offsetLabel, isDST, isValidZone } from '../lib/tz.js';
import { usePrefs } from '../lib/prefs.js';
import { CitySearch, useSeoTitle, CopyBtn, Notice, Field } from '../components/ui.jsx';
import { encodeConversion, decodeConversion, absoluteUrl } from '../lib/share.js';
import { diffLabel } from '../components/helpers.js';
import { CITIES } from '../lib/cities.js';

const pad = n => String(n).padStart(2, '0');

export default function Converter() {
  useSeoTitle('Timezone Converter — Stive Timezone');
  const [sp] = useSearchParams();
  const shared = decodeConversion(sp.toString());
  const [prefs] = usePrefs();
  const initial = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();
  const [sourceTz, setSourceTz] = useState(shared.sourceTz || prefs.referenceCity?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [destTzs, setDestTzs] = useState(shared.destTzs.length ? shared.destTzs : ['Etc/UTC']);
  const [localDT, setLocalDT] = useState(shared.iso || initial.slice(0, 16));

  const parsed = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localDT);
    if (!m) return null;
    return zonedTimeToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0), sourceTz);
  }, [localDT, sourceTz]);

  const rows = useMemo(() => {
    if (!parsed) return [];
    const utcMs = parsed.utcMs;
    const fmt = tz => ({
      tz,
      date: new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(utcMs)),
      time: new Intl.DateTimeFormat(prefs.hour12 ? 'en-US' : 'en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: prefs.hour12 }).format(new Date(utcMs)),
      offset: offsetLabel(tz, utcMs),
      dst: isDST(tz, utcMs),
      diff: diffLabel(sourceTz, tz, utcMs),
      nextDay: dayIndex(tz, utcMs) !== dayIndex(sourceTz, utcMs),
    });
    return [{ ...fmt('Etc/UTC'), label: 'UTC' }, ...destTzs.map(tz => fmt(tz))];
  }, [parsed, destTzs, sourceTz, prefs.hour12]);

  const shareUrl = parsed ? absoluteUrl(encodeConversion({ sourceTz, destTzs, iso: localDT })) : '';

  function swap() {
    if (destTzs.length === 0) return;
    const first = destTzs[0];
    setDestTzs([sourceTz, ...destTzs.slice(1)]);
    setSourceTz(first);
  }

  return (
    <div>
      <h1>Timezone Converter</h1>
      <p className="subtitle">Convert any date &amp; time between IANA zones — DST gaps, overlaps and historical rules handled by the timezone database.</p>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="Date & time (in source zone)">
            <input type="datetime-local" value={localDT} onChange={e => setLocalDT(e.target.value)} step={60} aria-label="Local date and time" />
          </Field>
          <Field label="Source zone">
            <ZoneSelect value={sourceTz} onChange={setSourceTz} />
          </Field>
          <button className="btn" onClick={swap} aria-label="Swap source and first destination" disabled={!destTzs.length}>⇄ Swap</button>
          <button className="btn" onClick={() => { setSourceTz('Etc/UTC'); }} title="Treat input as UTC">Input is UTC</button>
        </div>
        <Field label="Destination zones (multiple allowed)">
          <div className="row">
            {destTzs.map((tz, i) => (
              <span key={tz + i} className="pill accent mono">
                {tz} <button className="btn icon small" aria-label={`Remove ${tz}`} onClick={() => setDestTzs(destTzs.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none' }}>×</button>
              </span>
            ))}
            <ZoneSelect value="" onChange={v => v && !destTzs.includes(v) && setDestTzs([...destTzs, v])} ariaLabel="Add destination zone" />
          </div>
        </Field>
      </div>

      {!parsed && <Notice kind="err">Enter a valid date and time (YYYY-MM-DD HH:MM).</Notice>}
      {parsed && !parsed.exists && <Notice kind="warn"><strong>Nonexistent local time.</strong> {parsed.resolvedLabel || `The clocks in ${sourceTz} skipped past ${localDT} (spring-forward). The converted instant uses the post-transition offset.`}</Notice>}
      {parsed?.ambiguous && <Notice kind="warn"><strong>Ambiguous local time.</strong> {localDT} occurs twice in {sourceTz} (fall-back overlap). Using the <em>first</em> occurrence (before the clock rollback).</Notice>}

      <table aria-label="Conversion results">
        <thead><tr><th>Zone</th><th>Date</th><th>Time</th><th>UTC offset</th><th>DST</th><th>Δ vs source</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.tz + i} data-testid={`conv-${r.tz}`}>
              <td><span className="mono">{r.label || r.tz}</span></td>
              <td>{r.date}{r.nextDay && <span className="pill warn" title="Different calendar day than the source zone">day ±</span>}</td>
              <td className="mono"><strong>{r.time}</strong></td>
              <td className="mono">{r.offset}</td>
              <td>{r.dst ? <span className="pill ok">DST</span> : <span className="pill">STD</span>}</td>
              <td>{r.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {parsed && (
        <div className="row" style={{ marginTop: 14 }}>
          <CopyBtn text={`${localDT} ${sourceTz} → ${rows.map(r => `${r.time} (${r.tz})`).join(', ')}`} label="Copy result" />
          <CopyBtn text={shareUrl} label="Copy share link" />
          <a className="btn" href={shareUrl}>Open shared URL</a>
        </div>
      )}
    </div>
  );
}

function ZoneSelect({ value, onChange, ariaLabel = 'Choose timezone' }) {
  const zones = useMemo(() => [...new Set(CITIES.map(c => c.tz))].sort(), []);
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={ariaLabel}>
      <option value="">Select…</option>
      <option value="Etc/UTC">Etc/UTC</option>
      {zones.map(z => <option key={z} value={z}>{z}</option>)}
    </select>
  );
}
function dayIndex(tz, ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  return p;
}
