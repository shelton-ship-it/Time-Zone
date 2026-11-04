import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSeoTitle, Field, CopyBtn, Notice, EmptyState } from '../components/ui.jsx';
import { toISODate, dateDifference, addToDate, age, addBusinessDays, countBusinessDays, isoWeek, durationBetween, deadline, timezoneDuration, pad } from '../lib/calc.js';
import { ZONES } from '../lib/cities.js';
import { copyText } from '../lib/share.js';

const TODAY = toISODate(Date.now());

function Result({ children, copy }) {
  if (!children) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <Notice kind="ok">{children}</Notice>
      {copy && <CopyBtn text={copy} label="Copy result" />}
    </div>
  );
}

function ZoneSelect({ value, onChange, label }) {
  return (
    <Field label={label}>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
      </select>
    </Field>
  );
}

// ── individual calculators ────────────────────────────────────────────────────
function DateDiff() {
  const [s, setS] = useState('2026-01-01'), [e, setE] = useState(TODAY), [inc, setInc] = useState(false);
  const r = dateDifference(s, e, { inclusiveEnd: inc });
  const bad = s > e;
  return (<>
    <div className="row">
      <Field label="Start date"><input type="date" value={s} onChange={ev => setS(ev.target.value)} /></Field>
      <Field label="End date"><input type="date" value={e} onChange={ev => setE(ev.target.value)} /></Field>
      <Field label="Range"><label className="row" style={{ gap: 6 }}><input type="checkbox" checked={inc} onChange={ev => setInc(ev.target.checked)} /> Include end date (inclusive)</label></Field>
    </div>
    <p className="faint" style={{ fontSize: 12 }}>Assumption: calendar days at midnight; “include end” counts both first and last day.</p>
    {!r.error && (
      <Result copy={`${r.days} days (${r.weeks} weeks + ${r.restDays} days) · ${r.years}y ${r.months}m ${r.remDays}d`}>
        <strong>{bad ? '-' : ''}{r.days} days</strong> = {r.weeks} weeks + {r.restDays} days · breakdown: {bad ? '-' : ''}{r.years} years, {r.months} months, {r.remDays} days · {r.hours.toLocaleString()} hours · {r.weekdaysCount} weekdays
      </Result>
    )}
  </>);
}

function TimeDiff() {
  const [tz, setTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [a, setA] = useState(`${TODAY}T09:00`), [b, setB] = useState(`${TODAY}T17:30`);
  const r = useMemo(() => {
    try { return timezoneDuration(a, tz, b, tz); } catch { return { error: 'Invalid date & time' }; }
  }, [a, b, tz]);
  return (<>
    <div className="row">
      <Field label="From"><input type="datetime-local" value={a} onChange={e => setA(e.target.value)} /></Field>
      <Field label="To"><input type="datetime-local" value={b} onChange={e => setB(e.target.value)} /></Field>
      <ZoneSelect label="Timezone (both times)" value={tz} onChange={setTz} />
    </div>
    {!r.error && <Result copy={r.formatted}>{r.sign < 0 ? '(negative interval) ' : ''}<strong>{r.formatted}</strong> — {r.days}d {pad(r.hours)}h {pad(r.minutes)}m {pad(r.seconds)}s · total {Math.round(r.totalHours * 100) / 100} h</Result>}
    {r.error && <Notice kind="err">{r.error}</Notice>}
  </>);
}

function AddSubtract() {
  const [d, setD] = useState(TODAY), [n, setN] = useState(30), [u, setU] = useState('days'), [dir, setDir] = useState(1);
  const r = addToDate(d, Number(n), u, dir);
  return (<>
    <div className="row">
      <Field label="Date"><input type="date" value={d} onChange={e => setD(e.target.value)} /></Field>
      <Field label="Amount"><input type="number" value={n} min="0" onChange={e => setN(e.target.value)} /></Field>
      <Field label="Unit"><select value={u} onChange={e => setU(e.target.value)}>{['days', 'weeks', 'months', 'years'].map(x => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Operation"><select value={dir} onChange={e => setDir(Number(e.target.value))}><option value={1}>Add (+)</option><option value={-1}>Subtract (−)</option></select></Field>
    </div>
    {!r.error && <Result copy={r.result}>Result: <strong>{r.result}</strong> ({r.dayOfWeek})</Result>}
    {r.error && <Notice kind="err">{r.error}</Notice>}
  </>);
}

function AgeCalc() {
  const [b, setB] = useState('2000-01-01'), [o, setO] = useState(TODAY);
  const r = age(b, o);
  return (<>
    <div className="row">
      <Field label="Birth date"><input type="date" value={b} onChange={e => setB(e.target.value)} /></Field>
      <Field label="Age on"><input type="date" value={o} onChange={e => setO(e.target.value)} /></Field>
    </div>
    {!r.error && <Result copy={`${r.years} years, ${r.months} months, ${r.days} days`}>
      <strong>{r.years} years, {r.months} months, {r.days} days</strong> · total {r.totalDays.toLocaleString()} days ({r.totalWeeks.toLocaleString()} weeks, {r.totalMonths} months) · next birthday in {r.nextBirthdayDays} days
    </Result>}
    {r.error && <Notice kind="err">{r.error}</Notice>}
  </>);
}

function WorkingDays({ business = false }) {
  const [mode, setMode] = useState('count');
  const [s, setS] = useState(TODAY), [e, setE] = useState(toISODate(Date.now() + 30 * 86400000));
  const [n, setN] = useState(10), [hol, setHol] = useState('');
  const weekend = business ? [0, 6] : [0, 6]; // working days = Mon–Fri by default
  const holidays = hol.split(/[,\s]+/).filter(Boolean);
  const rc = mode === 'count' ? countBusinessDays(s, e, { weekend, holidays }) : addBusinessDays(s, Number(n), { weekend, holidays });
  return (<>
    <div className="row">
      <Field label="Mode"><select value={mode} onChange={ev => setMode(ev.target.value)}><option value="count">Count days between dates</option><option value="add">Add business days to a date</option></select></Field>
      {mode === 'count' ? <>
        <Field label="Start"><input type="date" value={s} onChange={ev => setS(ev.target.value)} /></Field>
        <Field label="End"><input type="date" value={e} onChange={ev => setE(ev.target.value)} /></Field>
      </> : <>
        <Field label="From date"><input type="date" value={s} onChange={ev => setS(ev.target.value)} /></Field>
        <Field label="Business days to add"><input type="number" value={n} onChange={ev => setN(ev.target.value)} /></Field>
      </>}
    </div>
    <Field label="Holidays (YYYY-MM-DD, comma-separated)">
      <input type="text" value={hol} onChange={ev => setHol(ev.target.value)} placeholder="2026-12-25, 2027-01-01" />
    </Field>
    <p className="faint" style={{ fontSize: 12 }}>{business ? 'Business days exclude Sat/Sun and listed holidays.' : 'Working days exclude weekends and listed holidays. Count includes both start and end dates when they qualify.'}</p>
    {!rc.error && (mode === 'count'
      ? <Result copy={`${rc.businessDays} business days`}><strong>{rc.businessDays} business days</strong> out of {rc.totalDays} calendar days</Result>
      : <Result copy={rc.result}>Target date: <strong>{rc.result}</strong> ({rc.calendarDays} calendar days later)</Result>)}
    {rc.error && <Notice kind="err">{rc.error}</Notice>}
  </>);
}

function DurationCalc() {
  const [a, setA] = useState(`${TODAY}T08:30`), [b, setB] = useState(`${TODAY}T22:15`);
  const r = durationBetween(new Date(a).getTime(), new Date(b).getTime());
  return (<>
    <div className="row">
      <Field label="Start (local)"><input type="datetime-local" value={a} onChange={e => setA(e.target.value)} /></Field>
      <Field label="End (local)"><input type="datetime-local" value={b} onChange={e => setB(e.target.value)} /></Field>
    </div>
    {!r.error && <Result copy={r.formatted}><strong>{r.formatted}</strong> · {Math.round(r.totalMinutes).toLocaleString()} minutes · {Math.round(r.totalHours * 100) / 100} hours</Result>}
  </>);
}

function WeekNumber() {
  const [d, setD] = useState(TODAY);
  const r = isoWeek(d);
  return (<>
    <Field label="Date"><input type="date" value={d} onChange={e => setD(e.target.value)} /></Field>
    {!r.error && <Result copy={`W${r.year}-${pad(r.week)}`}>
      <strong>ISO week {pad(r.week)} of {r.year}</strong> (week {r.weekStart} → {r.weekEnd}) · day {r.dayOfWeek} of the week (Mon = 1)
    </Result>}
  </>);
}

function CountdownCalc() {
  const [t, setT] = useState(`${toISODate(Date.now() + 7 * 86400000)}T12:00`);
  const [now, setNow] = useState(Date.now());
  React.useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const ms = new Date(t).getTime();
  const parts = isFinite(ms) ? { past: ms <= now, d: Math.floor(Math.abs(ms - now) / 86400000), h: Math.floor(Math.abs(ms - now) % 86400000 / 3600000), m: Math.floor(Math.abs(ms - now) % 3600000 / 60000), s: Math.floor(Math.abs(ms - now) % 60000 / 1000) } : null;
  return (<>
    <Field label="Target date & time (local)"><input type="datetime-local" value={t} onChange={e => setT(e.target.value)} /></Field>
    {parts ? (
      <div className="big-time" aria-live="polite">{parts.past ? `${parts.d}d ${pad(parts.h)}:${pad(parts.m)}:${pad(parts.s)} ago` : `${parts.d}d ${pad(parts.h)}:${pad(parts.m)}:${pad(parts.s)} remaining`}</div>
    ) : <Notice kind="err">Invalid date</Notice>}
  </>);
}

function DateRange() {
  const [s, setS] = useState(TODAY), [days, setDays] = useState(14);
  const start = new Date(s + 'T00:00:00Z');
  const end = new Date(start.getTime() + (Number(days) - 1) * 86400000);
  const list = [];
  for (let t = start.getTime(); t <= end.getTime() && list.length < 400; t += 86400000) {
    list.push({ iso: toISODate(t), wd: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(new Date(t)), week: isoWeek(toISODate(t)).week });
  }
  return (<>
    <div className="row">
      <Field label="Start"><input type="date" value={s} onChange={e => setS(e.target.value)} /></Field>
      <Field label="Number of days (inclusive)"><input type="number" min="1" max="400" value={days} onChange={e => setDays(e.target.value)} /></Field>
    </div>
    <p className="dim" style={{ fontSize: 13 }}>Range: <strong>{s}</strong> → <strong>{toISODate(end.getTime())}</strong> ({list.length} days, ends on {new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' }).format(end)})</p>
    <div style={{ maxHeight: 260, overflow: 'auto' }} className="mono">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr><th>Date</th><th>Weekday</th><th>ISO week</th></tr></thead>
        <tbody>{list.map(r => <tr key={r.iso} style={{ borderBottom: '1px solid var(--line)' }}><td>{r.iso}</td><td>{r.wd}</td><td>W{pad(r.week)}</td></tr>)}</tbody>
      </table>
    </div>
  </>);
}

function TzDuration() {
  const [a, setA] = useState(`${TODAY}T22:00`), [ta, setTa] = useState('Europe/London');
  const [b, setB] = useState(`${TODAY}T06:00`), [tb, setTb] = useState('America/New_York');
  let r; try { r = timezoneDuration(a, ta, b, tb); } catch { r = { error: 'Invalid input' }; }
  return (<>
    <div className="row">
      <Field label="Departure / start (wall time)"><input type="datetime-local" value={a} onChange={e => setA(e.target.value)} /></Field>
      <ZoneSelect label="Start timezone" value={ta} onChange={setTa} />
      <Field label="Arrival / end (wall time)"><input type="datetime-local" value={b} onChange={e => setB(e.target.value)} /></Field>
      <ZoneSelect label="End timezone" value={tb} onChange={setTb} />
    </div>
    <p className="faint" style={{ fontSize: 12 }}>Both wall times are resolved to real UTC instants using IANA rules (incl. DST), then elapsed time is measured.</p>
    {!r.error ? <Result copy={r.formatted}>Elapsed: <strong>{r.formatted}</strong>{r.sign < 0 ? ' (end before start)' : ''}</Result> : <Notice kind="err">{r.error}</Notice>}
  </>);
}

function DeadlineCalc() {
  const [due, setDue] = useState(toISODate(Date.now() + 10 * 86400000));
  const [start, setStart] = useState(TODAY);
  const [need, setNeed] = useState(20), [perDay, setPerDay] = useState(3);
  const r = deadline({ dueStr: due, startStr: start, hoursNeeded: Number(need), hoursPerDay: Number(perDay) });
  return (<>
    <div className="row">
      <Field label="Start today/on"><input type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
      <Field label="Due date"><input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
      <Field label="Hours of work needed"><input type="number" min="0" value={need} onChange={e => setNeed(e.target.value)} /></Field>
      <Field label="Hours available per day"><input type="number" min="0" value={perDay} onChange={e => setPerDay(e.target.value)} /></Field>
    </div>
    {!r.error ? (
      <Result copy={`Deadline plan: ${r.workingDays} working days, ${r.requiredPerDay} h/day`}>
        <strong>{r.workingDays} working days</strong> until the due date · you need <strong>{r.requiredPerDay} h/day</strong> → {r.feasible ? <span className="pill ok">feasible with your capacity</span> : <span className="pill err">not feasible — increase daily hours or move the date</span>}
      </Result>
    ) : <Notice kind="err">{r.error}</Notice>}
  </>);
}

const TOOLS = [
  ['diff', 'Date Difference', DateDiff],
  ['timediff', 'Time Difference', TimeDiff],
  ['addsub', 'Add / Subtract Date', AddSubtract],
  ['age', 'Age Calculator', AgeCalc],
  ['working', 'Working Days', () => <WorkingDays />],
  ['business', 'Business Days', () => <WorkingDays business />],
  ['duration', 'Time Duration', DurationCalc],
  ['week', 'Week Number', WeekNumber],
  ['countdown', 'Countdown to Date', CountdownCalc],
  ['range', 'Date Range', DateRange],
  ['tzdur', 'Timezone Duration', TzDuration],
  ['deadline', 'Deadline Calculator', DeadlineCalc],
];

export default function Calculators() {
  useSeoTitle('Date & Time Calculators — Stive Timezone');
  const [params, setParams] = useSearchParams();
  const active = TOOLS.find(t => t[0] === params.get('tool')) || TOOLS[0];
  const [copied, setCopied] = useState(false);
  const Tool = active[2];
  return (
    <div>
      <div className="topbar">
        <h1 className="mt0 mb0">Date &amp; Time Calculators</h1>
        <button className="btn small" onClick={async () => { await copyText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Link copied ✓' : 'Share this calculator'}</button>
      </div>
      <div className="tabs" role="tablist">
        {TOOLS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={id === active[0]} className={'tab' + (id === active[0] ? ' active' : '')}
            onClick={() => setParams({ tool: id })}>{label}</button>
        ))}
      </div>
      <div className="card" role="tabpanel">
        <h2 className="mt0">{active[1]}</h2>
        <Tool />
      </div>
      <EmptyState title="Everything runs locally">No data leaves your browser — all calculations use IANA timezone rules via Intl.</EmptyState>
    </div>
  );
}
