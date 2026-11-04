import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoTitle, Field, Notice, CitySearch } from '../components/ui.jsx';
import { CITIES, citySlug } from '../lib/cities.js';
import { greatCircleKm, estimateFlight, jetLag, sleepPlan, travelTimeline } from '../lib/travel.js';
import { offsetMinAt, offsetString, timeString, dateString } from '../lib/tz.js';
import { usePrefs } from '../lib/prefs.js';

function CityPick({ label, value, onChange }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <Field label={label}>
        <select value={value ? `${value.city}|${value.tz}` : ''} onChange={e => onChange(CITIES.find(c => `${c.city}|${c.tz}` === e.target.value))}>
          <option value="" disabled>Select a city…</option>
          {CITIES.map(c => <option key={c.tz + c.city} value={`${c.city}|${c.tz}`}>{c.city}, {c.country}</option>)}
        </select>
      </Field>
      <CitySearch onSelect={onChange} placeholder={`Or search for ${label.toLowerCase()}…`} />
    </div>
  );
}

export default function Travel() {
  useSeoTitle('Travel Planner — Stive Timezone');
  const [prefs] = usePrefs();
  const find = (name) => CITIES.find(c => c.city === name);
  const [dep, setDep] = useState(prefs.referenceCity || find('London'));
  const [arr, setArr] = useState(find('Tokyo'));
  const [dateStr, setDateStr] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [depHour, setDepHour] = useState(10), [depMin, setDepMin] = useState(0);

  const km = dep && arr ? greatCircleKm(dep, arr) : null;
  const est = km != null ? estimateFlight(km) : null;
  const jl = dep && arr ? jetLag({ originTz: dep.tz, destTz: arr.tz, dateStr }) : null;
  const sp = dep && arr ? sleepPlan({ originTz: dep.tz, destTz: arr.tz, travelDate: dateStr }) : null;
  const tl = dep && arr && est ? travelTimeline({ depCity: dep, arrCity: arr, depDateStr: dateStr, depHour, depMin, durationH: est.hours }) : null;

  const diffNow = useMemo(() => {
    if (!dep || !arr) return null;
    const noon = Date.parse(dateStr + 'T12:00:00Z');
    return (offsetMinAt(arr.tz, noon) - offsetMinAt(dep.tz, noon)) / 60;
  }, [dep, arr, dateStr]);

  if (!dep || !arr) return <div><h1 className="mt0">Travel Planner</h1><Notice kind="info">Pick departure and destination cities to begin.</Notice></div>;

  return (
    <div>
      <h1 className="mt0">Travel Planner</h1>
      <p className="subtitle">Jet lag, estimated flight time and a practical sleep-adjustment schedule. Estimates are models — not airline schedules.</p>

      <div className="grid g2">
        <CityPick label="Departure" value={dep} onChange={setDep} />
        <CityPick label="Destination" value={arr} onChange={setArr} />
      </div>

      <div className="row" style={{ margin: '14px 0' }}>
        <Field label="Travel date"><input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} /></Field>
        <Field label="Departure time (local)"><input type="time" value={`${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}`} onChange={e => { const [h, m] = e.target.value.split(':').map(Number); setDepHour(h || 0); setDepMin(m || 0); }} /></Field>
      </div>

      <div className="grid g3">
        <div className="card">
          <h3 className="mt0 mb0">Time difference</h3>
          <div className="big-time">{diffNow > 0 ? `+${diffNow}` : diffNow} h</div>
          <p className="dim">{dep.city}: {timeString(Date.parse(dateStr + 'T12:00:00Z'), dep.tz, false)} · {arr.city}: {timeString(Date.parse(dateStr + 'T12:00:00Z'), arr.tz, false)} (at noon UTC)</p>
          <p className="faint mono" style={{ fontSize: 12 }}>{dep.tz} UTC{offsetString(offsetMinAt(dep.tz, Date.parse(dateStr + 'T12:00:00Z')))} → {arr.tz} UTC{offsetString(offsetMinAt(arr.tz, Date.parse(dateStr + 'T12:00:00Z')))}</p>
        </div>
        <div className="card">
          <h3 className="mt0 mb0">Flight time (estimated)</h3>
          <div className="big-time">{Math.floor(est.hours)}h {Math.round(est.hours % 1 * 60)}m</div>
          <p className="dim">{km.toLocaleString()} km great-circle distance · model: {est.note}</p>
          <Notice kind="warn">This is a physics-based estimate, not a confirmed flight schedule.</Notice>
        </div>
        <div className="card">
          <h3 className="mt0 mb0">Jet lag score</h3>
          <div className="big-time">{jl.absDiff} h {jl.eastward ? '→ east' : jl.westward ? '← west' : '= 0'}</div>
          <p className="dim">Typical adjustment: <strong>~{jl.daysToAdjust} days</strong> · circadian strain: <span className={'pill ' + (jl.circadianRisk === 'high' ? 'err' : jl.circadianRisk === 'moderate' ? 'warn' : 'ok')}>{jl.circadianRisk}</span></p>
          <p className="faint" style={{ fontSize: 12 }}>Eastward travel is harder to adapt to than westward (heuristic: 1 day per 1.5 h east, per 2 h west).</p>
        </div>
      </div>

      <h2>Destination arrival plan</h2>
      {tl && (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <td className="dim">Depart {dep.city}</td><td className="mono"><strong>{tl.depLocal}</strong></td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <td className="dim">Flight (model)</td><td className="mono">{Math.floor(est.hours)}h {Math.round(est.hours % 1 * 60)}m · {km.toLocaleString()} km</td>
              </tr>
              <tr>
                <td className="dim">Arrive {arr.city}</td><td className="mono"><strong>{tl.arrLocal}</strong> {tl.crossedMidnight && <span className="pill warn">crosses midnight</span>}</td>
              </tr>
            </tbody>
          </table>
          <p className="dim" style={{ marginTop: 10 }}>First night: try to sleep near {arr.city}’s local night. Local time at arrival in {arr.city}: <strong>{timeString(tl.arrUtc, arr.tz, false)}</strong>, {dateString(tl.arrUtc, arr.tz)}.</p>
        </div>
      )}

      <h2>Sleep adjustment planner</h2>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-faint)' }}>
            <th>Day</th><th>Clock shift achieved</th><th>Suggested bedtime (your body clock)</th><th>Light strategy</th>
          </tr></thead>
          <tbody>
            {sp.steps.map(s => (
              <tr key={s.day} style={{ borderBottom: '1px solid var(--line)' }}>
                <td><strong>{s.day}</strong></td>
                <td className="mono">{s.shiftHours > 0 ? '+' : ''}{s.shiftHours} h</td>
                <td className="mono">{s.suggestedBedtimeOriginTime}</td>
                <td className="dim">{s.lightAdvice}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="faint" style={{ fontSize: 12 }}>Bedtimes are expressed in your origin-city body-clock terms; convert them with the <Link to="/converter">Timezone Converter</Link>. General wellness guidance — not medical advice.</p>
      </div>

      <h2>Quick destination conversions</h2>
      <div className="grid g4">
        {[0, 6, 12, 18].map(h => {
          const inst = Date.UTC(...[0]) || new Date(`${dateStr}T00:00:00Z`).getTime() + h * 3600000;
          return (
            <div key={h} className="card" style={{ textAlign: 'center' }}>
              <div className="dim" style={{ fontSize: 12 }}>{dep.city} {String(h).padStart(2, '0')}:00</div>
              <div className="big-time" style={{ fontSize: 24 }}>{timeString(inst, arr.tz, prefs.hour12)}</div>
              <div className="faint mono" style={{ fontSize: 11 }}>{dateString(inst, arr.tz)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
