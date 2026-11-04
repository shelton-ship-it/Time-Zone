import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePrefs } from '../lib/prefs.js';
import { useNow } from '../lib/useNow.js';
import { CitySearch, fmtTime, fmtDate, useSeoTitle, Notice } from '../components/ui.jsx';
import CityClockCard from '../components/CityClockCard.jsx';
import { POPULAR, findCityBySlug, userZoneCity } from '../lib/cities.js';
import { zonedParts, offsetLabel, userZone } from '../lib/tz.js';
import { getWeather } from '../lib/weather.js';
import { quickConvert } from '../components/QuickConverter.jsx';
import { loadCountdowns } from '../lib/countdowns.js';

export default function Home() {
  useSeoTitle('Stive Timezone — Global Time, Weather & Planning Platform');
  const [prefs] = usePrefs();
  const now = useNow();
  const nav = useNavigate();
  const ref = prefs.referenceCity || { city: 'Your time', country: '', tz: userZone(), lat: 0, lon: 0 };
  const p = zonedParts(now, ref.tz);
  const clocks = (prefs.favorites.length ? prefs.favorites : POPULAR.slice(0, 4));
  const [wx, setWx] = useState(null);
  const refCity = prefs.referenceCity || POPULAR[1];
  useEffect(() => { let a = true; getWeather(refCity).then(w => a && setWx(w)).catch(() => a && setWx(null)); return () => { a = false; }; }, [refCity.lat, refCity.lon]);
  const countdowns = loadCountdowns().filter(c => c.targetMs > now).slice(0, 3);

  return (
    <div>
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="row spread" style={{ alignItems: 'flex-start' }}>
          <div>
            <h1 className="mb0">{fmtTime(now, ref.tz, prefs.hour12)}</h1>
            <div className="dim">{fmtDate(now, ref.tz)} · <span className="mono">{offsetLabel(ref.tz, now)}</span> · {ref.tz}</div>
            <p className="subtitle" style={{ margin: '8px 0 0' }}>Global time, weather & planning for every city on Earth.</p>
          </div>
          <div style={{ minWidth: 260, flex: 1 }}>
            <CitySearch onSelect={c => nav(`/timezone/${slugOf(c.city)}`)} placeholder="Search any city, country or timezone…" autoFocus={false} />
            <div className="row" style={{ marginTop: 10 }}>
              <Link className="btn primary" to="/meeting-planner">Plan a meeting</Link>
              <Link className="btn" to="/converter">Convert times</Link>
              <Link className="btn" to="/world-clock">World clock</Link>
            </div>
          </div>
        </div>
      </section>

      <div className="grid g2" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <section aria-label="Favorite clocks">
          <div className="row spread"><h2 style={{ margin: 0 }}>{prefs.favorites.length ? 'Favorite clocks' : 'Popular cities'}</h2><Link to="/world-clock" className="small">Manage →</Link></div>
          <div className="grid g3" style={{ marginTop: 10 }}>
            {clocks.map(c => <CityClockCard key={c.tz + c.city} city={c} now={now} refTz={ref.tz} hour12={prefs.hour12} compact />)}
          </div>
        </section>
        <section aria-label="Overview">
          <h2>Weather snapshot</h2>
          {wx ? (
            <div className="card">
              <strong>{refCity.city}</strong>
              <div className="big-time" style={{ fontSize: 26 }}>{Math.round(wx.current.tempC ?? NaN)}°{wx.current.tempC == null ? '' : prefs.units.temp === 'f' ? 'F' : 'C'}</div>
              <div className="dim">{wx.current.text || '—'} · feels {wx.current.feelsC != null ? Math.round(prefs.units.temp === 'f' ? wx.current.feelsC * 9 / 5 + 32 : wx.current.feelsC) + (prefs.units.temp === 'f' ? '°F' : '°C') : 'n/a'}</div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="pill">💧 {wx.current.humidity != null ? wx.current.humidity + '%' : 'n/a'}</span>
                <span className="pill">🌬️ {wx.current.windKph != null ? wx.current.windKph + ' km/h' : 'n/a'}</span>
                <span className="pill">UV {wx.current.uv ?? 'n/a'}</span>
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>{wx.kind === 'observation' ? `Observed ${new Date(wx.observedAt || wx.fetchedAt).toLocaleTimeString()}` : 'Forecast-based (no live observation available)'} · {wx.attribution}</div>
              <Link to="/weather" className="btn small" style={{ marginTop: 8 }}>Full weather →</Link>
            </div>
          ) : <div className="card dim" role="status">Loading weather… (clocks work even if this fails)</div>}

          <h2>Upcoming countdowns</h2>
          {countdowns.length ? <div className="card">
            {countdowns.map(c => <div key={c.id} className="row spread" style={{ padding: '4px 0' }}>
              <Link to="/calculators?tab=countdown">{c.label}</Link>
              <span className="mono">{fmtRemaining(c.targetMs - now)}</span>
            </div>)}
          </div> : <Notice kind="info">No active countdowns. <Link to="/calculators?tab=countdown">Create one →</Link></Notice>}

          <h2>Quick tools</h2>
          <div className="grid g4" style={{ gap: 8 }}>
            {[['/calculators', 'Date calculators'], ['/timers', 'Timers'], ['/developer', 'Unix tools'], ['/travel', 'Jet lag'], ['/astronomy', 'Sun & moon'], ['/widgets', 'Embed a clock']].map(([to, label]) =>
              <Link key={to} to={to} className="btn" style={{ textAlign: 'center' }}>{label}</Link>)}
          </div>
        </section>
      </div>

      <section style={{ marginTop: 20 }}>
        <h2>Timezone converter</h2>
        {quickConvert(now, prefs)}
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Explore timezones</h2>
        <div className="row">
          {POPULAR.map(c => <Link key={c.tz} className="pill accent" to={`/timezone/${slugOf(c.city)}`} style={{ textDecoration: 'none' }}>{c.city} · {fmtTime(now, c.tz, prefs.hour12)}</Link>)}
          <Link className="pill" to="/timezones">All {new Set(POPULAR.map(p => p.tz)).size}+ zones →</Link>
        </div>
      </section>
    </div>
  );
}
const slugOf = c => c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
function fmtRemaining(ms) {
  const d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000), m = Math.floor(ms % 3600000 / 60000);
  return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}
