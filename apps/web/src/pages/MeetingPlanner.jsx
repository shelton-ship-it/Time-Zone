import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePrefs } from '../lib/prefs.js';
import { CITIES, searchCities } from '../lib/cities.js';
import { zonedTimeToUtc, offsetLabel, userZone } from '../lib/tz.js';
import { findSlots, timelineRows, localToUtc, localDateOf, classifySlot } from '../lib/meeting.js';
import { buildICS } from '../lib/meeting.js';
import { encodeMeeting, decodeMeeting, absoluteUrl, downloadICS, copyText, googleCalUrl } from '../lib/share.js';
import { useSeoTitle, Notice, CopyBtn, Field, EmptyState } from '../components/ui.jsx';

const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export default function MeetingPlanner() {
  useSeoTitle('Meeting Planner — Stive Timezone');
  const [prefs] = usePrefs();
  const [sp] = useSearchParams();
  const shared = decodeMeeting(sp.toString());

  const mkPart = c => ({ city: c.city, tz: c.tz, lat: c.lat, lon: c.lon, workStart: 540, workEnd: 1020, workDays: [1,2,3,4,5], breaks: [] });
  const [participants, setParticipants] = useState(() => {
    if (shared?.participants?.length) {
      return shared.participants.map(p => {
        const c = CITIES.find(x => x.tz === p.tz) || { city: p.tz.split('/').pop(), tz: p.tz, lat: 0, lon: 0 };
        return { ...mkPart(c), workStart: p.workStart, workEnd: p.workEnd, workDays: p.workDays };
      });
    }
    const home = prefs.referenceCity || { city: 'Your zone', tz: userZone(), lat: 0, lon: 0 };
    return [mkPart(home), mkPart(CITIES.find(c => c.city === 'London'))].filter(Boolean);
  });
  const [dateStr, setDateStr] = useState(shared?.dateStr || todayStr());
  const [durationMin, setDuration] = useState(shared?.durationMin || 60);
  const refTz = participants[0]?.tz || userZone();
  const [selStart, setSelStart] = useState(null); // UTC ms chosen via timeline click/drag
  const [dragFrom, setDragFrom] = useState(null);
  const [copied, setCopied] = useState('');

  const slots = useMemo(() => participants.length ? findSlots(dateStr, participants, durationMin, refTz) : null, [dateStr, participants, durationMin, refTz]);
  const rows = useMemo(() => participants.length ? timelineRows(dateStr, participants, refTz) : [], [dateStr, participants, refTz]);
  const dayOffsets = useMemo(() => participants.map(p => offsetLabel(p.tz, localToUtc(dateStr, 12, 0, refTz))), [participants, dateStr, refTz]);

  function addParticipant(city) {
    if (!city || participants.some(p => p.tz === city.tz && p.city === city.city)) return;
    setParticipants([...participants, mkPart(city)]);
  }
  function updateP(i, patch) { setParticipants(participants.map((p, j) => j === i ? { ...p, ...patch } : p)); }
  function removeP(i) { setParticipants(participants.filter((_, j) => j !== i)); }

  const selInfo = selStart != null ? {
    startUtc: selStart,
    per: participants.map(p => ({ p, c: classifySlot(selStart, durationMin, p) })),
  } : null;

  const shareUrl = absoluteUrl(encodeMeeting({ dateStr, durationMin, refTz, participants }));
  const icsText = selStart != null ? buildICS({ title: `Stive meeting ${dateStr}`, startUtc: selStart, durationMin, organizerTz: refTz, participants }) : '';
  const noOverlap = slots && slots.candidates.every(c => c.perParticipant.some(({ c }) => c.blocked || c.night));

  // compare across days
  const weekScores = useMemo(() => {
    if (!slots) return [];
    return [...Array(7)].map((_, k) => {
      const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + k - (k % 1));
      const ds = d.toISOString().slice(0, 10);
      const s = findSlots(ds, participants, durationMin, participants[0]?.tz || refTz);
      return { date: ds, best: s.best[0]?.score ?? -999, weekday: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()] };
    });
  }, [dateStr, participants, durationMin, refTz]);

  return (
    <div>
      <h1>Meeting Planner</h1>
      <p className="subtitle">Find the fairest hour for everyone. Availability is computed from real IANA rules — never fixed offsets.</p>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="Meeting date"><input type="date" value={dateStr} onChange={e => { setDateStr(e.target.value); setSelStart(null); }} /></Field>
          <Field label="Duration">
            <select value={durationMin} onChange={e => setDuration(+e.target.value)}>
              {[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m < 60 ? m + ' min' : (m / 60) + ' h'}</option>)}
            </select>
          </Field>
          <ParticipantPicker onPick={addParticipant} />
        </div>
      </div>

      {participants.length === 0 && <EmptyState title="Add participants">Search a city above to start planning.</EmptyState>}

      {participants.map((p, i) => (
        <div key={p.tz + p.city} className="card" style={{ marginBottom: 10 }}>
          <div className="row spread">
            <strong>{p.city} <span className="dim mono" style={{ fontSize: 12 }}>{p.tz}</span></strong>
            <div className="row" style={{ gap: 6 }}>
              <label className="mb0" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>Work
                <input type="time" value={hm(p.workStart)} onChange={e => updateP(i, { workStart: hm2min(e.target.value) })} aria-label={`Work start for ${p.city}`} />
                <input type="time" value={hm(p.workEnd)} onChange={e => updateP(i, { workEnd: hm2min(e.target.value) })} aria-label={`Work end for ${p.city}`} />
              </label>
              <WeekdayPicker value={p.workDays} onChange={v => updateP(i, { workDays: v })} label={`Workdays for ${p.city}`} />
              <button className="btn small" onClick={() => {
                const start = prompt(`Break/unavailable block for ${p.city} on ${dateStr} — start HH:MM`, '12:00');
                if (!start) return;
                const end = prompt('End HH:MM', '13:00'); if (!end) return;
                updateP(i, { breaks: [...(p.breaks || []), { date: dateStr, start: hm2min(start), end: hm2min(end) }] });
              }}>+ Break</button>
              <button className="btn small" aria-label={`Remove ${p.city}`} onClick={() => removeP(i)}>×</button>
            </div>
          </div>
          <div className="tl-overlay" role="group" aria-label={`Availability timeline for ${p.city}`}>
            <div className="timeline-row">
              {rows[i]?.cells.map((c, k) => (
                <div key={k} className={`tl-cell ${c.off ? 'tl-off' : c.night ? 'tl-night' : c.work ? 'tl-work' : 'tl-normal'}`}
                  title={`${p.city} local ${c.label}`} onClick={() => setSelStart(localToUtc(dateStr, Math.floor(c.refMin / 60), c.refMin % 60, refTz))}
                  style={{ cursor: 'pointer' }} />
              ))}
            </div>
            <div className="dim" style={{ fontSize: 12 }}>Local time at midnight in this row: <span className="mono">{localMidnightLabel(p.tz, dateStr, refTz)}</span> → <span className="mono">{localMidnightLabel(p.tz, nextDay(dateStr), refTz)}</span></div>
          </div>
        </div>
      ))}

      <div className="hour-scale" aria-hidden="true">{[...Array(24)].map((_, h) => <span key={h}>{pad(h)}</span>)}</div>
      <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>Scale shows hours in <strong>{refTz}</strong>. Legend: green = working hours · dark = night · striped = unavailable.</div>

      {noOverlap && <Notice kind="warn">No slot fits all participants within their working hours. Consider shortening the meeting or moving the date.</Notice>}

      {slots && (
        <section style={{ marginTop: 18 }}>
          <h2>Recommended slots</h2>
          <table><thead><tr><th>#</th><th>{`Start (${refTz.split('/').pop()})`}</th><th>Score</th>{participants.map(p => <th key={p.tz + p.city}>{p.city}</th>)}</tr></thead>
            <tbody>{slots.best.map((s, i) => (
              <tr key={s.startUtc}>
                <td>{i + 1}</td>
                <td><button className="btn small mono" onClick={() => setSelStart(s.startUtc)}>{fmtRef(s.startUtc, refTz)}</button></td>
                <td><span className={`pill ${s.score >= 60 ? 'ok' : s.score >= 20 ? '' : 'warn'}`}>{s.score}</span></td>
                {s.perParticipant.map(({ p, c }) => <td key={p.tz + p.city} className="mono" style={{ color: c.night ? 'var(--err)' : c.workCoverage === 100 ? 'var(--ok)' : undefined }}>
                  {c.localStart}{c.rollover ? ' →next day' : ''}{c.blocked ? ' ✕' : ''}
                </td>)}
              </tr>))}
            </tbody></table>

          <h2>Compare across days (best score)</h2>
          <div className="row">{weekScores.map(w => (
            <button key={w.date} className={`btn small ${w.date === dateStr ? 'primary' : ''}`} onClick={() => setDateStr(w.date)} title={`Best score ${w.best}`}>
              {w.weekday} {w.date.slice(5)} <span className={w.best >= 60 ? 'pill ok' : w.best >= 20 ? 'pill' : 'pill warn'} style={{ marginLeft: 6 }}>{w.best}</span>
            </button>))}</div>
        </section>
      )}

      {selInfo && (
        <section className="card" style={{ marginTop: 18 }}>
          <h2 className="mt0">Selected meeting</h2>
          <table><thead><tr><th>Participant</th><th>Local start</th><th>Local end</th><th>Status</th></tr></thead>
            <tbody>{selInfo.per.map(({ p, c }) => (
              <tr key={p.tz + p.city}>
                <td>{p.city} <span className="dim mono" style={{ fontSize: 11 }}>{p.tz}</span></td>
                <td className="mono">{localDateOf(selInfo.startUtc, p.tz)} {c.localStart}</td>
                <td className="mono">{localDateOf(selInfo.startUtc + durationMin * 60000, p.tz)} {c.localEnd}</td>
                <td>{c.blocked ? <span className="pill err">unavailable</span> : c.night ? <span className="pill warn">night</span> : c.workCoverage === 100 ? <span className="pill ok">within working hours</span> : <span className="pill">partial ({c.workCoverage}%)</span>}</td>
              </tr>))}
            </tbody></table>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => downloadICS(`stive-meeting-${dateStr}.ics`, icsText)}>Download .ics</button>
            <a className="btn" target="_blank" rel="noreferrer" href={googleCalUrl({ title: 'Stive meeting', startUtc: selInfo.startUtc, durationMin, details: selInfo.per.map(({ p, c }) => `${p.city}: ${c.localStart}`).join(', ') })}>Google Calendar</a>
            <CopyBtn text={shareUrl} label="Copy share link" />
            <CopyBtn text={selInfo.per.map(({ p, c }) => `${p.city}: ${localDateOf(selInfo.startUtc, p.tz)} ${c.localStart}–${c.localEnd}`).join('\n')} label="Copy times" />
          </div>
          <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Share link encodes zones, working hours and date only — no names or emails.</div>
        </section>
      )}
    </div>
  );
}

function ParticipantPicker({ onPick }) {
  const [q, setQ] = useState('');
  const results = q.trim().length >= 2 ? searchCities(q, 6) : [];
  return (
    <div className="searchbox" style={{ flex: 1, minWidth: 220 }}>
      <label>Add participant city</label>
      <input type="text" value={q} placeholder="e.g. Berlin" aria-label="Add participant city"
        onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && results[0]) { onPick(results[0]); setQ(''); } }} />
      {results.length > 0 && <div className="search-results">{results.map(c =>
        <button key={c.tz + c.city} onClick={() => { onPick(c); setQ(''); }}>{c.city} — {c.country}<div className="faint mono" style={{ fontSize: 11 }}>{c.tz}</div></button>)}</div>}
    </div>
  );
}
function WeekdayPicker({ value, onChange, label }) {
  const days = [['S', 0], ['M', 1], ['T', 2], ['W', 3], ['T', 4], ['F', 5], ['S', 6]];
  return <div role="group" aria-label={label} className="row" style={{ gap: 2 }}>
    {days.map(([l, i]) => <button key={i} className={`btn small ${value.includes(i) ? 'primary' : ''}`} aria-pressed={value.includes(i)}
      onClick={() => onChange(value.includes(i) ? value.filter(d => d !== i) : [...value, i].sort())} style={{ padding: '3px 6px' }}>{l}</button>)}
  </div>;
}
const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const hm2min = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
function fmtRef(ms, tz) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}
function localMidnightLabel(tz, dateStr, refTz) {
  const ms = localToUtc(dateStr, 0, 0, refTz);
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}
const nextDay = ds => { const d = new Date(ds + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
