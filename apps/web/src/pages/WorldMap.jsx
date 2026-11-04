import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSeoTitle, Field, Notice } from '../components/ui.jsx';
import { CITIES, citySlug } from '../lib/cities.js';
import { offsetMinAt, offsetString } from '../lib/tz.js';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../lib/config.js';

// Lightweight slippy-map (no heavy dependency needed): Web Mercator tiles from a
// configurable tile server (VITE_MAP_TILE_URL). Day/night is computed analytically.
const TILE = 256;
function lonLatToXY(lon, lat, z) {
  const n = TILE * Math.pow(2, z);
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin(lat * Math.PI / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return [x, y];
}
function xyToLonLat(x, y, z) {
  const n = TILE * Math.pow(2, z);
  const lon = (x / n) * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y / n)))) * 180 / Math.PI;
  return [lon, lat];
}

/** Terminator polygon points (local solar time == -0.833° altitude) for instant t. */
function terminatorPoints(tMs) {
  const days = tMs / 86400000;
  const theta = (2 * Math.PI / 365.24) * (days + 10); // approx solar longitude param
  const decl = -23.44 * Math.cos(theta + 2 * Math.PI * ((Math.floor(days) % 365)) / 365.24) * 0 + // recompute properly below
    23.44 * Math.sin(2 * Math.PI * (days - 172.1) / 365.25) * 0;
  // Proper: solar declination via day-of-year approximation
  const doy = ((days % 365.25) + 365.25) % 365.25;
  const dec = 23.44 * Math.sin(2 * Math.PI * (doy - 80) / 365.25) * Math.PI / 180;
  const gmstHours = ((tMs / 3600000) % 24 + 24) % 24;
  const sunLonUtc = -(gmstHours - 12) * 15; // subsolar longitude (approx, UTC)
  const pts = [];
  for (let i = 0; i <= 72; i++) {
    const ha = (-Math.PI / 2) + (i / 72) * Math.PI; // hour angle -90..+90 deg
    const lat = Math.atan(-Math.cos(ha) / Math.tan(dec));
    const lon = ha * 180 / Math.PI + sunLonUtc;
    pts.push([((lon + 540) % 360) - 180, lat * 180 / Math.PI]);
  }
  return { pts, decDeg: dec * 180 / Math.PI, subLon: sunLonUtc };
}

export default function WorldMap() {
  useSeoTitle('World Map — Stive Timezone');
  const [view, setView] = useState({ x: TILE * 2 ** 2 / 2, y: TILE * 2 ** 2 / 2 * 0.62, z: 2 });
  const [now, setNow] = useState(Date.now());
  const [mode, setMode] = useState('daylight');
  const drag = useRef(null);
  const boxRef = useRef(null);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);

  const W = TILE * 2 ** view.z;
  const { pts } = useMemo(() => terminatorPoints(now), [now]);

  // build night overlay path in screen coords
  const nightPath = useMemo(() => {
    if (mode !== 'daylight') return null;
    const scr = pts.map(([lon, lat]) => { const [x, y] = lonLatToXY(lon, lat, view.z); return `${(x - view.x).toFixed(1)},${(y - view.y).toFixed(1)}`; });
    // close the polygon over the pole that is in darkness
    const northDark = (pts[36][1] > 0 ? true : false); // sample midpoint latitude sign
    const topY = -W; // far above
    const botY = W * 2;
    const first = scr[0].split(','), last = scr[scr.length - 1].split(',');
    // decide which vertical edge closes toward the dark pole using subsolar declination
    const doy = ((now / 86400000 % 365.25) + 365.25) % 365.25;
    const dec = 23.44 * Math.sin(2 * Math.PI * (doy - 80) / 365.25);
    const darkPoleTop = dec < 0; // northern winter → north pole dark
    const edgeY = darkPoleTop ? topY : botY;
    return `M ${first[0]},${edgeY} L ${first.join(',')} L ${scr.join(' L ')} L ${last[0]},${edgeY} Z`;
  }, [pts, view, now, mode, W]);

  const onDown = e => { drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }; };
  const onMove = e => { if (!drag.current) return; setView(v => ({ ...v, x: drag.current.ox - (e.clientX - drag.current.sx), y: drag.current.oy - (e.clientY - drag.current.sy) })); };
  const onUp = () => { drag.current = null; };
  const onWheel = e => {
    const nz = Math.min(6, Math.max(1, view.z + (e.deltaY < 0 ? 1 : -1)));
    setView(v => {
      const scale = 2 ** (nz - v.z);
      return { z: nz, x: (v.x + (e.nativeEvent.offsetX || 0)) * scale - (e.nativeEvent.offsetX || 0), y: (v.y + (e.nativeEvent.offsetY || 0)) * scale - (e.nativeEvent.offsetY || 0) };
    });
  };

  const tiles = [];
  const tx0 = Math.max(0, Math.floor(view.x / TILE)), ty0 = Math.max(0, Math.floor(view.y / TILE));
  const count = 2 ** view.z;
  for (let ty = ty0; ty <= ty0 + 8 && ty < count; ty++)
    for (let tx = tx0; tx <= tx0 + 12 && tx < count; tx++)
      tiles.push({ key: `${tx}-${ty}`, url: MAP_TILE_URL.replace('{z}', view.z).replace('{x}', tx).replace('{y}', ty), left: tx * TILE - view.x, top: ty * TILE - view.y });

  return (
    <div>
      <h1 className="mt0">World Map</h1>
      <p className="subtitle">Live day/night terminator and timezone offsets. Drag to pan, scroll to zoom.</p>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={'btn small' + (mode === 'daylight' ? ' primary' : '')} onClick={() => setMode('daylight')}>🌗 Daylight map</button>
        <button className={'btn small' + (mode === 'offsets' ? ' primary' : '')} onClick={() => setMode('offsets')}>🕑 Timezone markers</button>
        <span className="pill mono">{new Date(now).toISOString().slice(11, 16)} UTC</span>
      </div>
      <div ref={boxRef} className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative', height: 520, cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={onWheel} role="application" aria-label="Interactive world map">
        {tiles.map(t => <img key={t.key} src={t.url} alt="" width={TILE} height={TILE} draggable={false} style={{ position: 'absolute', left: t.left, top: t.top, imageRendering: 'auto', userSelect: 'none' }} />)}
        {nightPath && <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <path d={nightPath} fill="rgba(10,15,40,0.5)" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
        </svg>}
        {mode === 'offsets' && CITIES.filter(c => c.pop > 3_000_000 || ['Maputo', 'Dubai', 'Reykjavik'].includes(c.city)).slice(0, 70).map(c => {
          const [x, y] = lonLatToXY(c.lon, c.lat, view.z);
          const left = x - view.x, top = y - view.y;
          if (left < -20 || top < -20 || left > (boxRef.current?.clientWidth || 800) + 20) return null;
          const off = offsetMinAt(c.tz, now);
          return <div key={c.tz + c.city} title={`${c.city} · UTC${offsetString(off)}`} style={{ position: 'absolute', left, top, transform: 'translate(-50%,-50%)' }}>
            <span className="pill accent mono" style={{ fontSize: 10.5, padding: '1px 6px' }}>{c.city} {offsetString(off)}</span>
          </div>;
        })}
        <div style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 10.5, background: 'rgba(0,0,0,.55)', color: '#fff', padding: '2px 7px', borderRadius: 6 }}>
          {MAP_ATTRIBUTION} · Stive Timezone
        </div>
      </div>
      <Notice kind="info">The terminator is computed analytically (±few minutes) — for exact local sunrise/sunset open a city page or the Astronomy tool.</Notice>
    </div>
  );
}
