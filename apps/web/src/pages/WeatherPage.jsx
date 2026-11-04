import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getWeather, convertTemp, convertWind, tempUnitLabel, windUnitLabel } from '../lib/weather.js';
import { CITIES, findCityBySlug, searchCities } from '../lib/cities.js';
import { usePrefs } from '../lib/prefs.js';
import { CitySearch, useSeoTitle, Notice, Skeleton, EmptyState } from '../components/ui.jsx';
import { POPULAR } from '../lib/cities.js';

export default function WeatherPage() {
  useSeoTitle('Weather — Stive Timezone');
  const [prefs, update] = usePrefs();
  const [sp, setSp] = useSearchParams();
  const city = (() => {
    const slug = sp.get('city');
    if (slug) return findCityBySlug(slug);
    return prefs.referenceCity || POPULAR[1];
  })();
  const [wx, setWx] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!city) { setLoading(false); return; }
    let alive = true; setLoading(true); setErr(null);
    getWeather(city).then(w => alive && (setWx(w), setLoading(false)))
      .catch(e => alive && (setErr(e.message), setLoading(false)));
    return () => { alive = false; };
  }, [city?.lat, city?.lon]);

  const t = c => c == null ? '—' : Math.round(convertTemp(c, prefs.units.temp)) + tempUnitLabel(prefs.units.temp);
  const w = k => k == null ? '—' : convertWind(k, prefs.units.wind) + windUnitLabel(prefs.units.wind);

  return (
    <div>
      <h1>Weather</h1>
      <p className="subtitle">Integrated forecasts for every supported city. Units and provider source are always shown.</p>
      <div className="card row" style={{ marginBottom: 14 }}>
        <CitySearch onSelect={c => setSp({ city: slugOf(c.city) })} placeholder="Choose a city…" />
        <button className="btn small" onClick={() => update({ units: { ...prefs.units, temp: prefs.units.temp === 'c' ? 'f' : 'c' } })}>{t(0) !== '—' ? '' : ''}{prefs.units.temp === 'c' ? 'Switch to °F' : 'Switch to °C'}</button>
        <button className="btn small" onClick={() => update({ units: { ...prefs.units, wind: prefs.units.wind === 'kmh' ? 'mph' : 'kmh' } })}>{prefs.units.wind === 'kmh' ? 'Switch to mph' : 'Switch to km/h'}</button>
      </div>

      {!city && <EmptyState title="No city selected">Pick one of the popular cities below.</EmptyState>}
      {loading && <div className="grid g2"><Skeleton h={180} /><Skeleton h={180} /></div>}
      {err && <Notice kind="err">Weather is currently unavailable for {city?.city}: {err}. Clocks and converters keep working normally.</Notice>}

      {wx && !loading && city && (
        <>
          <Notice kind={wx.kind === 'observation' ? 'ok' : 'info'} style={{ marginBottom: 12 }}>
            <strong>{wx.attribution}</strong> · {wx.kind === 'observation'
              ? `Live observation${wx.observedAt ? ' at ' + new Date(wx.observedAt).toLocaleString([], { timeZone: city.tz }) : ''}`
              : 'Forecast-derived nowcast — MET Norway does not provide real-time observations, so values are model-based.'}
            {' '}Fetched {new Date(wx.fetchedAt).toLocaleTimeString()} {wx.stale && '(stale cache served)'}.
          </Notice>

          <div className="grid g2">
            <section className="card">
              <h2 className="mt0">{city.city}, {city.country}</h2>
              <div className="big-time" style={{ fontSize: 46 }}>{t(wx.current.tempC)}</div>
              <div className="dim mb0">{wx.current.text || 'Condition unavailable'}</div>
              <table aria-label="Current conditions" style={{ marginTop: 10 }}>
                <tbody>
                  <tr><td>Feels like</td><td className="mono">{t(wx.current.feelsC)}{wx.current.feelsC == null && <span className="faint"> (not provided)</span>}</td></tr>
                  <tr><td>Humidity</td><td className="mono">{wx.current.humidity != null ? wx.current.humidity + '%' : '—'}</td></tr>
                  <tr><td>Wind</td><td className="mono">{w(wx.current.windKph)} {wx.current.windDeg != null ? `(${Math.round(wx.current.windDeg)}°)` : ''}</td></tr>
                  <tr><td>Pressure</td><td className="mono">{wx.current.pressureMb != null ? wx.current.pressureMb + ' mb' : '—'}</td></tr>
                  <tr><td>UV index</td><td className="mono">{wx.current.uv ?? '— (provider-dependent)'}</td></tr>
                  <tr><td>Visibility</td><td className="mono">{wx.current.visKm != null ? wx.current.visKm + ' km' : '—'}</td></tr>
                  <tr><td>Precipitation</td><td className="mono">{wx.current.precipMm != null ? wx.current.precipMm + ' mm' : '—'}</td></tr>
                  <tr><td>Rain probability</td><td className="mono">{wx.current.rainProb != null ? wx.current.rainProb + '%' : '— (observation has no PoP)'}</td></tr>
                </tbody>
              </table>
            </section>

            <section className="card">
              <h2 className="mt0">Next 24 hours</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                {(wx.hourly || []).slice(0, 24).map(h => (
                  <div key={h.epochMs} className="pill" style={{ flexDirection: 'column', padding: '6px 4px', textAlign: 'center' }} title={h.text || ''}>
                    <span className="faint" style={{ fontSize: 10 }}>{new Intl.DateTimeFormat('en-GB', { timeZone: city.tz, hour: '2-digit' }).format(new Date(h.epochMs))}</span>
                    <strong>{t(h.tempC)}</strong>
                    {h.rainProb != null && <span style={{ fontSize: 10, color: 'var(--accent)' }}>💧{h.rainProb}%</span>}
                  </div>
                ))}
              </div>
              {(!wx.hourly || !wx.hourly.length) && <div className="dim">Hourly data not available from this provider.</div>}
            </section>
          </div>

          <section className="card" style={{ marginTop: 14 }}>
            <h2 className="mt0">{wx.days?.length >= 7 ? '7-day forecast' : `${wx.days?.length}-day forecast`}</h2>
            {wx.days?.length < 7 && <Notice kind="warn">Only {wx.days?.length} days supplied by the current plan/provider (WeatherAPI free tier = 3 days; production Starter plan = 7).</Notice>}
            <table><thead><tr><th>Date</th><th>Min / Max</th><th>Condition</th><th>Rain %</th><th>Sunrise</th><th>Sunset</th><th>Daylight</th><th>Moon</th></tr></thead>
              <tbody>{(wx.days || []).map(d => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td className="mono">{t(d.minC)} / {t(d.maxC)}</td>
                  <td>{d.text || '—'}</td>
                  <td className="mono">{d.rainProb != null ? d.rainProb + '%' : '—'}</td>
                  <td className="mono">{fmtLocalTime(d.sunriseISO, city.tz)}</td>
                  <td className="mono">{fmtLocalTime(d.sunsetISO, city.tz)}</td>
                  <td className="mono">{d.daylightMin != null ? `${Math.floor(d.daylightMin / 60)}h ${d.daylightMin % 60}m` : 'polar/extreme'}</td>
                  <td>{d.moonPhase || '—'}</td>
                </tr>))}
              </tbody></table>
          </section>
        </>
      )}

      <h2>Cities</h2>
      <div className="row">{POPULAR.concat(CITIES.filter(c => c.pop > 4e6).slice(0, 10)).map(c =>
        <button key={c.tz + c.city} className={`btn small ${city?.city === c.city ? 'primary' : ''}`} onClick={() => setSp({ city: slugOf(c.city) })}>{c.city}</button>)}</div>
    </div>
  );
}
const slugOf = c => c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
function fmtLocalTime(isoOrHm, tz) {
  if (!isoOrHm) return '—';
  if (/^\d{2}:\d{2}/.test(isoOrHm)) return isoOrHm.slice(0, 5); // MET "HH:MM UTC" strings kept as-is
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(isoOrHm)); } catch { return isoOrHm; }
}
