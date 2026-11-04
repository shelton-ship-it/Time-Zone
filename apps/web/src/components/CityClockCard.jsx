import React, { memo, useEffect, useState } from 'react';
import { offsetLabel, isDST, zonedParts } from '../lib/tz.js';
import { getWeather, convertTemp, convertWind, tempUnitLabel, windUnitLabel } from '../lib/weather.js';
import { fmtTime, fmtDate, fmtShortDate } from './ui.jsx';
import { toggleFavorite, isFavorite, usePrefs } from '../lib/prefs.js';
import { diffLabel } from './helpers.js';

function WeatherChip({ city }) {
  const [wx, setWx] = useState(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prefs] = usePrefs();
  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(false);
    getWeather(city).then(w => { if (alive) { setWx(w); setLoading(false); } })
      .catch(() => { if (alive) { setErr(true); setLoading(false); } });
    return () => { alive = false; };
  }, [city.lat, city.lon]);
  if (loading) return <span className="pill faint" role="status">weather…</span>;
  if (err || !wx) return <span className="pill faint">weather unavailable</span>;
  const t = convertTemp(wx.current.tempC, prefs.units.temp);
  const f = convertTemp(wx.current.feelsC, prefs.units.temp);
  const wd = convertWind(wx.current.windKph, prefs.units.wind);
  const d0 = wx.days?.[0];
  const min = convertTemp(d0?.minC, prefs.units.temp), max = convertTemp(d0?.maxC, prefs.units.temp);
  return (
    <span className="pill" title={`${wx.text || ''} · source: ${wx.source}${wx.kind === 'forecast-nowcast' ? ' (forecast, not observation)' : ''}`}>
      {t != null ? `${Math.round(t)}${tempUnitLabel(prefs.units.temp)}` : '—'}
      {wx.current.text ? ` · ${wx.current.text}` : ''}
      {f != null && f !== t ? <span className="faint"> feels {Math.round(f)}°</span> : null}
      {min != null && max != null ? <span className="faint"> {Math.round(min)}°/{Math.round(max)}°</span> : null}
      {wd != null ? <span className="faint"> · {wd}{windUnitLabel(prefs.units.wind)}</span> : null}
      {wx.kind === 'forecast-nowcast' && <span className="faint" aria-label="forecast data, not a live observation">(fcst)</span>}
    </span>
  );
}

export default memo(function CityClockCard({ city, now, refTz, hour12, onRemove, compact }) {
  const p = zonedParts(now, city.tz);
  const night = p.hour < 6 || p.hour >= 22;
  const dst = isDST(city.tz, now);
  const fav = isFavorite(city);
  return (
    <div className="card clock-card" data-testid={`clock-${city.city}`}>
      <div className={`sky ${night ? 'night' : 'day'}`} aria-hidden="true" />
      <div className="row spread" style={{ position: 'relative' }}>
        <div>
          <strong style={{ fontSize: 16 }}>{city.city}</strong>
          <span className="dim"> {city.country}</span>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn icon small" aria-label={fav ? `Unfavorite ${city.city}` : `Favorite ${city.city}`} aria-pressed={fav}
            onClick={() => toggleFavorite(city)}>{fav ? '★' : '☆'}</button>
          {onRemove && <button className="btn icon small" aria-label={`Remove ${city.city}`} onClick={() => onRemove(city)}>×</button>}
        </div>
      </div>
      <div className="big-time" style={{ position: 'relative' }} aria-label={`Current time in ${city.city}`}>{fmtTime(now, city.tz, hour12)}</div>
      <div className="dim" style={{ position: 'relative' }}>{fmtDate(now, city.tz)}</div>
      <div className="row" style={{ position: 'relative', marginTop: 8, gap: 6 }}>
        <span className="pill mono">{offsetLabel(city.tz, now)}</span>
        <span className="pill mono" title="IANA identifier">{city.tz.split('/').pop().replace(/_/g, ' ')}</span>
        {dst ? <span className="pill ok" title="Daylight Saving Time in effect">DST</span> : <span className="pill">STD</span>}
        <span className="pill">{night ? '🌙 night' : '☀️ day'}</span>
        {refTz && refTz !== city.tz && <span className="pill accent">{diffLabel(refTz, city.tz, now)}</span>}
      </div>
      {!compact && <div style={{ position: 'relative', marginTop: 8 }}><WeatherChip city={city} /></div>}
    </div>
  );
});
export { WeatherChip };
