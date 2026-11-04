import React, { useEffect, useMemo, useState } from 'react';
import { useSeoTitle, Field, Notice, CopyBtn } from '../components/ui.jsx';
import { zonedTimeToUtc, offsetMinAt, offsetString, isValidZone, userZone, isoInZone } from '../lib/tz.js';
import { ZONES } from '../lib/cities.js';
import { pad } from '../lib/calc.js';

const TZ_OPTIONS = ['UTC', ...ZONES.filter(z => z !== 'UTC')];
const pad3 = n => String(n).padStart(3, '0');

function parseUnitInput(v) {
  const s = (v || '').trim();
  if (!/^-?\d+$/.test(s)) return { error: 'Timestamp must be an integer.' };
  const n = Number(s);
  // heuristic unit detection with explicit override
  const abs = Math.abs(n);
  const auto = abs >= 1e14 ? 'microseconds' : abs >= 1e11 ? 'milliseconds' : abs >= 1e8 ? 'seconds' : 'seconds';
  return { n, auto };
}

function ConvertBlock({ title, children }) {
  return <div className="card"><h3 className="mt0">{title}</h3>{children}</div>;
}

function Out({ label, value, copy }) {
  if (value == null || value === '') return null;
  return (
    <div className="row spread" style={{ borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
      <span className="dim">{label}</span>
      <span className="mono"><strong>{value}</strong> {copy !== false && <CopyBtn text={String(value)} />}</span>
    </div>
  );
}

export default function Developer() {
  useSeoTitle('Developer Tools — Stive Timezone');
  const localTz = useMemo(() => userZone(), []);
  const [tz, setTz] = useState(localTz);

  // ── Unix timestamp → date ──
  const [ts, setTs] = useState(String(Math.floor(Date.now() / 1000)));
  const [unit, setUnit] = useState('auto');
  const tsRes = useMemo(() => {
    const p = parseUnitInput(ts);
    if (p.error) return p;
    const mult = { seconds: 1000, milliseconds: 1, microseconds: 0.001, nanoseconds: 0.000001 }[unit === 'auto' ? p.auto : unit] ?? 1000;
    const ms = p.n * mult;
    if (!isFinite(ms) || Math.abs(ms) > 8.64e15 * 200) return { error: 'Timestamp is outside the supportable date range.' };
    const d = new Date(ms);
    if (isNaN(d)) return { error: 'Invalid timestamp' };
    return { ms, effUnit: unit === 'auto' ? p.auto : unit, iso: d.toISOString(), local: isoInZone(ms, tz), pretty: new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }).format(d) };
  }, [ts, unit, tz]);

  // ── Date → timestamp ──
  const [dt, setDt] = useState(new Date().toISOString().slice(0, 16));
  const dtRes = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(dt);
    if (!m) return { error: 'Enter a local date & time (YYYY-MM-DDTHH:mm).' };
    const r = zonedTimeToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0), tz);
    return { r };
  }, [dt, tz]);

  // ── ISO / RFC 3339 parser ──
  const [iso, setIso] = useState(new Date().toISOString());
  const isoRes = useMemo(() => {
    const s = (iso || '').trim();
    // RFC 3339 / ISO 8601 basic validation
    const re = /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(Z|z|[+-]\d{2}:?\d{2})?$/;
    const m = re.exec(s);
    if (!m) return { error: 'Not a valid ISO 8601 / RFC 3339 date-time. Expected e.g. 2026-11-04T15:30:00Z or 2026-11-04T15:30:00+02:00.' };
    const withZone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(s) ? s.replace(' ', 'T') : s + 'Z';
    const d = new Date(withZone);
    if (isNaN(d)) return { error: 'Calendar-invalid date.' };
    const naive = !m[7];
    return { d, naive, isoUtc: d.toISOString(), local: isoInZone(d.getTime(), tz), rfc3339: rfc3339(d.getTime(), tz) };
  }, [iso, tz]);

  // ── UTC ↔ local ──
  const [wall, setWall] = useState(new Date().toISOString().slice(0, 16));
  const utcRes = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(wall);
    if (!m) return { error: 'Enter wall time as YYYY-MM-DDTHH:mm.' };
    const r = zonedTimeToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], 0, tz);
    const u = new Date(r.utcMs);
    return { r, utc: `${u.getUTCFullYear()}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())} ${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())} UTC` };
  }, [wall, tz]);

  // ── Offset finder / calculator ──
  const [offDate, setOffDate] = useState(new Date().toISOString().slice(0, 16));
  const [tzB, setTzB] = useState('America/New_York');
  const offsets = useMemo(() => {
    const ms = new Date(offDate + ':00').getTime();
    const t = isNaN(ms) ? Date.now() : Date.UTC(...[0].concat([])) || ms; // parse as UTC
    const inst = isNaN(ms) ? Date.now() : ms;
    const a = offsetMinAt(tz, inst), b = offsetMinAt(tzB, inst);
    return { inst, a, b, diff: (b - a) / 60 };
  }, [offDate, tz, tzB]);

  // ── Duration converters ──
  const [msVal, setMsVal] = useState(String(Date.now()));
  const [secVal, setSecVal] = useState('9012345');

  // ── Timestamp comparison ──
  const [t1, setT1] = useState(String(Math.floor(Date.now() / 1000)));
  const [t2, setT2] = useState(String(Math.floor((Date.now() + 3600 * 1000) / 1000)));
  const cmp = useMemo(() => {
    const a = parseUnitInput(t1), b = parseUnitInput(t2);
    if (a.error || b.error) return { error: a.error || b.error };
    const am = a.n * 1000, bm = b.n * 1000;
    const d = Math.abs(bm - am) / 1000;
    return { am, bm, delta: d, earlier: am <= bm ? 'first' : 'second', isoA: new Date(am).toISOString(), isoB: new Date(bm).toISOString() };
  }, [t1, t2]);

  // ── Format converter ──
  const [fmtSrc, setFmtSrc] = useState(new Date().toISOString());
  const FORMATS = [
    ['ISO 8601', d => d.toISOString()],
    ['RFC 3339', d => rfc3339(d.getTime(), tz)],
    ['Unix seconds', d => String(Math.floor(d.getTime() / 1000))],
    ['Unix milliseconds', d => String(d.getTime())],
    ['en-GB datetime', d => new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'long' }).format(d)],
    ['US format', d => new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'medium' }).format(d)],
    ['YYYY/MM/DD HH:mm', d => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`],
    ['RFC 2822', d => d.toUTCString()],
  ];
  const fmtParsed = useMemo(() => {
    const s = (fmtSrc || '').trim();
    let d = new Date(s);
    if (/^\d+$/.test(s)) d = new Date(s.length > 11 ? +s : +s * 1000);
    return isNaN(d.getTime()) ? null : d;
  }, [fmtSrc]);

  return (
    <div>
      <h1 className="mt0">Developer Tools</h1>
      <p className="subtitle">Deterministic, client-side conversions. Invalid input is rejected — never silently coerced.</p>

      <Field label="Working timezone">
        <select value={tz} onChange={e => setTz(e.target.value)}>{TZ_OPTIONS.map(z => <option key={z}>{z}</option>)}</select>
      </Field>

      <div className="grid g2">
        <ConvertBlock title="Unix Timestamp → Date">
          <div className="row">
            <Field label="Timestamp"><input className="mono" value={ts} onChange={e => setTs(e.target.value)} /></Field>
            <Field label="Unit"><select value={unit} onChange={e => setUnit(e.target.value)}>
              <option value="auto">Auto-detect ({tsRes.effUnit || '…'})</option><option>seconds</option><option>milliseconds</option><option>microseconds</option>
            </select></Field>
          </div>
          {tsRes.error ? <Notice kind="err">{tsRes.error}</Notice> : <>
            <Out label="UTC (ISO 8601)" value={tsRes.iso} />
            <Out label={`Local (${tz})`} value={tsRes.pretty} />
            <Out label="Epoch ms" value={String(tsRes.ms)} />
            <p className="faint" style={{ fontSize: 12 }}>Interpreted as <strong>{tsRes.effUnit}</strong>.</p>
          </>}
        </ConvertBlock>

        <ConvertBlock title="Date → Unix Timestamp">
          <Field label={`Local date & time (${tz})`}><input type="datetime-local" value={dt} onChange={e => setDt(e.target.value)} /></Field>
          {dtRes.error ? <Notice kind="err">{dtRes.error}</Notice> : <>
            <Out label="Unix seconds" value={String(Math.floor(dtRes.r.utcMs / 1000))} />
            <Out label="Unix milliseconds" value={String(dtRes.r.utcMs)} />
            <Out label="UTC" value={new Date(dtRes.r.utcMs).toISOString()} />
            {dtRes.r.note && <Notice kind="warn">{dtRes.r.note}</Notice>}
          </>}
        </ConvertBlock>

        <ConvertBlock title="ISO 8601 / RFC 3339 Converter">
          <Field label="Parse string"><input className="mono" value={iso} onChange={e => setIso(e.target.value)} /></Field>
          {isoRes.error ? <Notice kind="err">{isoRes.error}</Notice> : <>
            <Out label="Normalized UTC ISO" value={isoRes.isoUtc} />
            <Out label="RFC 3339 (with offset)" value={isoRes.rfc3339} />
            <Out label={`In ${tz}`} value={isoRes.local} />
            {isoRes.naive && <Notice kind="warn">No offset given — parsed as UTC by convention. Add “Z” or ±HH:mm to be explicit.</Notice>}
          </>}
        </ConvertBlock>

        <ConvertBlock title="UTC Converter (local wall ↔ UTC)">
          <Field label={`Wall time in ${tz}`}><input type="datetime-local" value={wall} onChange={e => setWall(e.target.value)} /></Field>
          {utcRes.error ? <Notice kind="err">{utcRes.error}</Notice> : <>
            <Out label="Equivalent UTC" value={utcRes.utc} />
            <Out label="Offset applied" value={`UTC${offsetString(offsetsA(tz, utcRes.r.utcMs))}`} />
            {utcRes.r.note && <Notice kind="warn">{utcRes.r.note}</Notice>}
          </>}
        </ConvertBlock>

        <ConvertBlock title="UTC Offset Finder">
          <Field label="Instant (interpreted in UTC)"><input type="datetime-local" value={offDate} onChange={e => setOffDate(e.target.value)} /></Field>
          <Out label={`${tz} at that instant`} value={`UTC${offsetString(offsets.a)} · ${shortName(tz, offsets.inst)}`} />
          <Out label={`${tzB} at that instant`} value={`UTC${offsetString(offsets.b)} · ${shortName(tzB, offsets.inst)}`} />
        </ConvertBlock>

        <ConvertBlock title="UTC Offset Calculator & Timestamp Comparison">
          <Out label={`Difference ${tz} → ${tzB}`} value={`${offsets.diff > 0 ? '+' : ''}${offsets.diff} h`} />
          <hr style={{ border: 'none', borderTop: '1px solid var(--line)' }} />
          <div className="row">
            <Field label="Timestamp A (s)"><input className="mono" value={t1} onChange={e => setT1(e.target.value)} /></Field>
            <Field label="Timestamp B (s)"><input className="mono" value={t2} onChange={e => setT2(e.target.value)} /></Field>
          </div>
          {cmp.error ? <Notice kind="err">{cmp.error}</Notice> : cmp.delta === 0 ? <Notice kind="ok">Both timestamps refer to the same instant.</Notice> : (
            <Notice kind="info">The <strong>{cmp.earlier}</strong> timestamp is earlier by <strong>{fmtDur(cmp.delta)}</strong>. ({cmp.isoA} vs {cmp.isoB})</Notice>
          )}
        </ConvertBlock>

        <ConvertBlock title="Milliseconds ⇄ Seconds">
          <div className="row">
            <Field label="Milliseconds"><input className="mono" value={msVal} onChange={e => setMsVal(e.target.value)} /></Field>
            <Field label="Seconds"><input className="mono" value={secVal} onChange={e => setSecVal(e.target.value)} /></Field>
          </div>
          <Out label={`${msVal || 0} ms =`} value={`${Number(msVal || 0) / 1000} s`} />
          <Out label={`${secVal || 0} s =`} value={`${Number(secVal || 0) * 1000} ms`} copy={false} />
        </ConvertBlock>

        <ConvertBlock title="Date Format Converter">
          <Field label="Any date, timestamp or ISO string"><input className="mono" value={fmtSrc} onChange={e => setFmtSrc(e.target.value)} /></Field>
          {!fmtParsed ? <Notice kind="err">Could not parse “{fmtSrc}”. Try ISO 8601, RFC 3339 or a numeric Unix timestamp.</Notice> : (
            FORMATS.map(([name, fn]) => <Out key={name} label={name} value={fn(fmtParsed)} />)
          )}
        </ConvertBlock>
      </div>
    </div>
  );
}

function offsetsA(tz, ms) { return offsetMinAt(tz, ms); }
function shortName(tz, ms) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms));
    return (p.find(x => x.type === 'timeZoneName') || {}).value || '';
  } catch { return ''; }
}
function rfc3339(ms, tz) {
  const off = offsetMinAt(tz, ms);
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(ms));
  const g = t => (p.find(x => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}:${g('second')}${sign}${pad(Math.floor(a / 60))}:${pad3(a % 60).slice(-2)}`;
}
function fmtDur(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = Math.round(sec % 60);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}
