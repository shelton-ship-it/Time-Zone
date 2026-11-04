import React, { useMemo, useState } from 'react';
import { useSeoTitle, Field, Notice, CitySearch } from '../components/ui.jsx';
import { CITIES } from '../lib/cities.js';
import { astroFor, moonPhaseFromPhase } from '../lib/weather.js';
import { timeString, dateString, isValidZone } from '../lib/tz.js';
import { usePrefs } from '../lib/prefs.js';

const MOON_ICONS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
const toLocal = (iso, tz) => iso ? timeString(new Date(iso).getTime(), tz, false) : '—';

export default function Astronomy() {
  useSeoTitle('Astronomy — Sun & Moon — Stive Timezone');
  const [prefs] = usePrefs();
  const [city, setCity] = useState(CITIES.find(c => c.city === 'London'));
  const [dateStr, setDateStr] = useState(new Date().toISOString().slice(0, 10));
  const safeCity = city && isValidZone(city.tz) ? city : CITIES.find(c => c.city === 'London');
  const a = useMemo(() => astroFor(safeCity, dateStr), [safeCity, dateStr]);

  // moon phases for surrounding 30 days
  const month = useMemo(() => {
    const out = [];
    const base = new Date(dateStr + 'T12:00:00Z');
    for (let i = 0; i < 30; i++) {
      const d = new Date(base.getTime() + i * 86400000);
      const ds = d.toISOString().slice(0, 10);
      try { out.push({ date: ds, ...astroFor(safeCity, ds) }); } catch { /* skip */ }
    }
    return out;
  }, [safeCity, dateStr]);

  const phaseIdx = Math.round(a.moonPhase * 8) % 8;
  const daylightH = a.daylightMin != null ? `${Math.floor(a.daylightMin / 60)}h ${a.daylightMin % 60}m` : '—';

  return (
    <div>
      <h1 className="mt0">Astronomy</h1>
      <p className="subtitle">Sunrise, sunset, golden hour and moon data computed with SunCalc for any location and date.</p>

      <div className="card row" style={{ alignItems: 'flex-end' }}>
        <Field label="Location"><select value={`${safeCity.city}|${safeCity.tz}`} onChange={e => setCity(CITIES.find(c => `${c.city}|${c.tz}` === e.target.value))}>
          {CITIES.map(c => <option key={c.tz + c.city} value={`${c.city}|${c.tz}`}>{c.city}, {c.country}</option>)}
        </select></Field>
        <div style={{ flex: 1, minWidth: 220 }}><CitySearch onSelect={setCity} placeholder="Search another city…" /></div>
        <Field label="Date"><input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} /></Field>
      </div>

      {a.polarDay && <Notice kind="warn">Extreme latitude on this date — sun may not set (midnight sun) or not rise (polar night).</Notice>}

      <h2>Sun</h2>
      <div className="grid g4">
        {[['🌅 Sunrise', a.sunrise], ['🌇 Sunset', a.sunset], ['☀️ Solar noon', a.solarNoon], ['🌆 Blue hour start', a.blueHourStart],
          ['✨ Golden hour (AM)', a.goldenHourStart], ['✨ Golden hour (PM)', a.goldenHourEnd], ['🌒 Civil dawn', a.dawn], ['🌘 Civil dusk', a.dusk]].map(([label, iso]) => (
          <div key={label} className="card" style={{ textAlign: 'center' }}>
            <div className="dim" style={{ fontSize: 12.5 }}>{label}</div>
            <div className="big-time" style={{ fontSize: 22 }}>{toLocal(iso, safeCity.tz)}</div>
            <div className="faint mono" style={{ fontSize: 11 }}>{iso ? new Date(iso).toISOString() : 'not observable'}</div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <span className="pill accent">Day length: {daylightH}</span>
        <span className="pill">{dateString(new Date(dateStr + 'T12:00:00Z').getTime(), safeCity.tz)}</span>
        <span className="pill mono">{safeCity.lat.toFixed(2)}, {safeCity.lon.toFixed(2)} · {safeCity.tz}</span>
      </div>

      <h2>Moon</h2>
      <div className="grid g2">
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 64 }} role="img" aria-label={a.moonName}>{MOON_ICONS[phaseIdx]}</div>
          <h3 className="mt0 mb0">{a.moonName}</h3>
          <p className="dim">{a.moonIllumPct}% illuminated · phase {a.moonPhase.toFixed(3)} of the synodic cycle</p>
          <div className="row spread" style={{ marginTop: 8 }}>
            <span>🌜 Moonrise: <strong className="mono">{a.moonAlwaysDown ? 'below horizon all day' : toLocal(a.moonrise, safeCity.tz)}</strong></span>
            <span>🌛 Moonset: <strong className="mono">{a.moonAlwaysUp ? 'above horizon all day' : toLocal(a.moonset, safeCity.tz)}</strong></span>
          </div>
        </div>
        <div className="card">
          <h3 className="mt0">Next 30 days</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 6 }}>
            {month.map(m => {
              const idx = Math.round(m.moonPhase * 8) % 8;
              const isSel = m.date === dateStr;
              return (
                <button key={m.date} onClick={() => setDateStr(m.date)} title={`${m.date} · ${m.moonName} (${m.moonIllumPct}%)`}
                  className="btn small" style={{ padding: '6px 2px', background: isSel ? 'var(--accent-soft)' : undefined, borderColor: isSel ? 'var(--accent)' : 'transparent' }}>
                  <div style={{ fontSize: 20 }}>{MOON_ICONS[idx]}</div>
                  <div className="mono" style={{ fontSize: 10.5 }}>{m.date.slice(5)}</div>
                  <div className="faint" style={{ fontSize: 10 }}>{m.moonIllumPct}%</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <h2>Best light windows ({safeCity.city})</h2>
      <div className="card">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <tbody>
            {[['Blue hour', a.blueHourStart, a.blueHourEnd || a.sunrise], ['Golden hour morning', a.goldenHourStart, a.solarNoon], ['Golden hour evening', a.goldenHourEnd || a.sunset, a.dusk]].map(([n, s, e]) => (
              <tr key={n} style={{ borderBottom: '1px solid var(--line)' }}>
                <td className="dim">{n}</td><td className="mono">{toLocal(s, safeCity.tz)}</td><td className="mono">{toLocal(e, safeCity.tz)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="faint" style={{ fontSize: 12 }}>Times shown in {safeCity.tz} local time (your display format: {prefs.hour12 ? '12-hour' : '24-hour'}). “Not observable” means the sun stays below/above the horizon threshold at this latitude on this date.</p>
      </div>
    </div>
  );
}
