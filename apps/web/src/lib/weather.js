// ── Normalized weather service ────────────────────────────────────────────────
// Providers: WeatherAPI.com (primary, real-time observation via server proxy)
//            MET Norway Locationforecast 2.0 (fallback, forecast-derived).
// All UI components consume getWeather() — never a provider directly.

import SunCalcImport from 'suncalc';
import { WEATHER_PROXY_URL, METNO_URL, WEATHER_DAYS, CONTACT_EMAIL, SITE_URL } from './config.js';
const SITE_ORIGIN = SITE_URL || 'https://stive.local';

const DAY = 86400000;
const MEM_TTL = 10 * 60000;      // in-memory dedupe window
const LS_TTL = 3 * 3600000;      // localStorage cache TTL (3 h)
const LS_PREFIX = 'stive-wx-v1:';
const MAX_DAYS = WEATHER_DAYS; // free plan: 3, Starter: 7 — configured via VITE_WEATHER_DAYS

// ── normalized model ─────────────────────────────────────────────────────────
// {
//   source: 'weatherapi' | 'metno',
//   kind:   'observation' | 'forecast-nowcast',
//   observedAt: ms|null, generatedAt: ms|null, fetchedAt: ms,
//   location: {name,lat,lon,tz},
//   current: { tempC|null, feelsC|null, text|null, icon|null, humidity|null,
//              windKph|null, windDeg|null, pressureMb|null, uv|null,
//              visKm|null, precipMm|null, rainProb|null },
//   hourly: [{tMs, tempC, text, rainProb}],       // up to 24 entries
//   daily:  [{date, tzDate, minC, maxC, rainProb, text, sunriseISO|null, sunsetISO|null,
//             daylightMin|null, moonriseISO|null, moonsetISO|null, moonPhase|null}],
// }

function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (Date.now() - v.fetchedAt > LS_TTL) return { stale: true, ...v };
    return v;
  } catch { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch { /* quota */ }
  mem.set(key, val);
}
const mem = new Map();
const inflight = new Map();

async function fetchJson(url, opts = {}, timeoutMs = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, ...opts });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    return await res.json();
  } finally { clearTimeout(t); }
}

// ── WeatherAPI normalization ─────────────────────────────────────────────────
function normWeatherapi(j, days) {
  const cur = j.current || {}, loc = j.location || {};
  const outDays = (j.forecast?.forecastday || []).slice(0, days).map(d => ({
    date: d.date, tzDate: d.date,
    minC: d.day?.mintemp_c ?? null, maxC: d.day?.maxtemp_c ?? null,
    rainProb: d.day?.daily_chance_of_rain ?? null,
    text: d.day?.condition?.text ?? null, icon: d.day?.condition?.icon ?? null,
    sunriseISO: d.astrometry?.sunrise ?? null, sunsetISO: d.astrometry?.sunset ?? null,
    moonriseISO: d.astrometry?.moonrise ?? null, moonsetISO: d.astrometry?.moonset ?? null,
    moonPhase: d.astrometry?.moon_phase ?? null, moonIllum: d.astrometry?.moon_illumination ?? null,
    daylightMin: d.astrometry?.sunrise && d.astrometry?.sunset ? diffHm(d.astrometry.sunrise, d.astrometry.sunset) : null,
  }));
  const hourly = [];
  for (const day of (j.forecast?.forecastday || [])) {
    for (const h of day.hour || []) {
      hourly.push({ tLocal: h.time, epochMs: h.time_epoch, tempC: h.temp_c ?? null, text: h.condition?.text ?? null, rainProb: h.chance_of_rain ?? null });
    }
  }
  return {
    source: 'weatherapi', kind: 'observation',
    observedAt: cur.last_updated ? wallToUtc(cur.last_updated, loc.tz) : null,
    generatedAt: null, fetchedAt: Date.now(),
    location: { name: loc.name, lat: loc.lat, lon: loc.lon, tz: loc.tz },
    current: {
      tempC: cur.temp_c ?? null, feelsC: cur.feelslike_c ?? null,
      text: cur.condition?.text ?? null, icon: cur.condition?.icon ?? null,
      humidity: cur.humidity ?? null, windKph: cur.wind_kph ?? null, windDeg: cur.wind_degree ?? null,
      windDir: cur.wind_dir ?? null, pressureMb: cur.pressure_mb ?? null, uv: cur.uv ?? null,
      visKm: cur.vis_km ?? null, precipMm: cur.precip_mm ?? null, rainProb: null,
      isDay: cur.is_day === 1, cloud: cur.cloud ?? null, dewC: cur.dewpoint_c ?? null,
    },
    hourly, days: outDays,
    attribution: 'Weather data by WeatherAPI.com',
  };
}
// Interpret "YYYY-MM-DD HH:mm" wall time in tz as a UTC epoch.
function wallToUtc(s, tz) {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 3; i++) {
    const p = zonedPartsLite(guess, tz);
    const off = (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - guess) / 60000;
    guess = Date.UTC(y, mo - 1, d, h, mi) - off * 60000;
  }
  return guess;
}
function zonedPartsLite(t, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
  const o = {}; for (const x of f.formatToParts(new Date(t))) if (x.type!=='literal') o[x.type]=x.value;
  return { y:+o.year, mo:+o.month, d:+o.day, h:+(o.hour==='24'?0:o.hour), mi:+o.minute };
}
function diffHm(a, b) {
  const [ah, am] = a.match(/(\d+):(\d+)/).slice(1).map(Number);
  const ap = /pm/i.test(a) ? (ah % 12) + 12 : ah % 12;
  const [bh, bm] = b.match(/(\d+):(\d+)/).slice(1).map(Number);
  const bp = /pm/i.test(b) ? (bh % 12) + 12 : bh % 12;
  let d = (bp * 60 + bm) - (ap * 60 + am);
  if (d < 0) d += 1440;
  return d;
}

// ── MET Norway normalization (forecast only — never labelled as observation) ──
function normMetno(j, lat, lon, tz) {
  const ts = j.properties?.timeseries || [];
  if (!ts.length) throw Object.assign(new Error('empty timeseries'), { status: 204 });
  const now = Date.now();
  const next = ts[0];
  const instant = next.data.instant.details || {};
  const perDay = new Map();
  const hourly = [];
  for (const p of ts) {
    const t = Date.parse(p.time);
    const det = p.data.instant.details || {};
    const prev = p.data.next_1_hours || p.data.next_6_hours;
    const localDateKey = localDate(t, tz);
    if (hourly.length < 24 && t >= now - 3600000) {
      hourly.push({
        epochMs: t, tempC: det.air_temperature ?? null,
        text: prev?.summary?.symbol_code ?? null,
        rainProb: prev?.details?.probability_of_precipitation ?? null,
      });
    }
    if (!perDay.has(localDateKey)) perDay.set(localDateKey, { min: Infinity, max: -Infinity, probs: [], symbols: [] });
    const d = perDay.get(localDateKey);
    if (det.air_temperature != null) { d.min = Math.min(d.min, det.air_temperature); d.max = Math.max(d.max, det.air_temperature); }
    if (prev?.details?.probability_of_precipitation != null) d.probs.push(prev.details.probability_of_precipitation);
    if (prev?.summary?.symbol_code) d.symbols.push(prev.summary.symbol_code);
    if (prev?.details?.air_temperature != null) { d.min = Math.min(d.min, prev.details.air_temperature); d.max = Math.max(d.max, prev.details.air_temperature); }
  }
  const days = [...perDay.entries()].slice(0, MAX_DAYS).map(([date, d]) => {
    const [lat2, lon2] = [lat, lon];
    const astro = sunTimes(date, lat2, lon2, tz);
    return {
      date, tzDate: date,
      minC: isFinite(d.min) ? round1(d.min) : null,
      maxC: isFinite(d.max) ? round1(d.max) : null,
      rainProb: d.probs.length ? Math.max(...d.probs) : null,
      text: d.symbols[0] ? prettySymbol(d.symbols.find(s => /day|night|polartwilight/.test(s)) || d.symbols[0]) : null,
      symbolCode: d.symbols[0] || null,
      sunriseISO: astro.sunrise, sunsetISO: astro.sunset, daylightMin: astro.daylightMin,
      moonriseISO: null, moonsetISO: null, moonPhase: astro.moonPhase,
    };
  });
  return {
    source: 'metno', kind: 'forecast-nowcast',
    observedAt: null,                       // no real-time observation available
    generatedAt: Date.parse(j.properties?.meta?.updated_at ?? next.time),
    fetchedAt: now,
    location: { name: `${Number(lat).toFixed(2)}, ${Number(lon).toFixed(2)}`, lat, lon, tz },
    current: {
      tempC: instant.air_temperature ?? null,
      feelsC: instant.air_temperature_at_2_metres != null && instant.wind_speed != null
        ? round1(apparentTemp(instant.air_temperature, instant.wind_speed * 3.6, instant.relative_humidity)) : null,
      text: next.data.next_1_hours?.summary?.symbol_code ? prettySymbol(next.data.next_1_hours.summary.symbol_code) : null,
      symbolCode: next.data.next_1_hours?.summary?.symbol_code ?? null,
      humidity: instant.relative_humidity ?? null,
      windKph: instant.wind_speed != null ? round1(instant.wind_speed * 3.6) : null,
      windDeg: instant.wind_from_direction ?? null,
      pressureMb: instant.air_pressure_at_sea_level != null ? round1(instant.air_pressure_at_sea_level / 10) : null,
      uv: null, visKm: instant.visibility_distance != null ? round1(instant.visibility_distance / 1000) : null,
      precipMm: next.data.next_1_hours?.details?.precipitation_amount ?? null,
      rainProb: next.data.next_1_hours?.details?.probability_of_precipitation ?? null,
    },
    hourly, days,
    attribution: 'Forecast data © MET Norway (locationforecast 2.0, cc-by-4.0)',
  };
}
const round1 = x => Math.round(x * 10) / 10;
function apparentTemp(tc, kph, rhPct) {
  // simple Apparent Temperature (Australian BOM formula) using available fields
  if (tc == null) return null;
  const e = (rhPct ?? 50) / 100 * 6.105 * Math.exp(17.27 * tc / (237.7 + tc));
  return tc + 0.33 * e - 0.70 * (kph / 3.6) - 4.00;
}
function prettySymbol(code) {
  if (!code) return null;
  const base = code.replace(/_(day|night|polartwilight)$/, '').replace(/_/g, ' ');
  return base.replace(/\b\w/g, c => c.toUpperCase());
}
function localDate(epochMs, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(epochMs));
}
function sunTimes(dateStr, lat, lon, _tz) {
  // NOAA solar approximation for sunrise/sunset at the given coordinates.
  const [y, m, d] = dateStr.split('-').map(Number);
  const dayOfYear = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / DAY) + 1;
  const decl = -23.44 * Math.cos(((360 / 365) * (dayOfYear + 10)) * Math.PI / 180);
  const latR = lat * Math.PI / 180, decR = decl * Math.PI / 180;
  const cosH = -Math.tan(latR) * Math.tan(decR);
  let sunrise = null, sunset = null, daylightMin = null;
  if (cosH < -1) { daylightMin = 1440; }           // midnight sun
  else if (cosH > 1) { daylightMin = 0; }          // polar night
  else {
    const H = Math.acos(cosH) * 180 / Math.PI;     // degrees
    const solarNoonUTC = 12 - lon / 15;            // hours (approx, ignores EoT)
    const rise = solarNoonUTC - H / 15, set = solarNoonUTC + H / 15;
    sunrise = hm(rise); sunset = hm(set);
    daylightMin = Math.round((H / 15) * 2 * 60);
  }
  return { sunrise, sunset, daylightMin, moonPhase: moonPhaseName(dayOfYear, y, m, d) };
}
const hm = h => { let x = ((h % 24) + 24) % 24; const hh = Math.floor(x), mm = Math.round((x - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')} UTC`; };
function moonPhaseName(doy, y, m, d) {
  // known new moon: 2000-01-06 18:14 UTC
  const days = (Date.UTC(y, m - 1, d) - Date.UTC(2000, 0, 6)) / DAY;
  const phase = ((days % 29.530588853) + 29.530588853) % 29.530588853;
  const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  return names[Math.round(phase / 29.530588853 * 8) % 8];
}

// ── Provider calls ───────────────────────────────────────────────────────────
async function viaProxy(city) {
  const params = new URLSearchParams({ q: `${city.lat},${city.lon}` });
  const j = await fetchJson(`${WEATHER_PROXY_URL}?${params}`);
  if (!j || !j.__proxy) throw new Error('proxy unavailable');
  if (j.__proxy !== 'ok') throw Object.assign(new Error(j.error || 'proxy error'), { status: j.__proxy });
  return normWeatherapi(j.data, MAX_DAYS);
}
const metUserAgent = `StiveTimezone/1.0 (+${SITE_ORIGIN}${CONTACT_EMAIL ? '; ' + CONTACT_EMAIL : ''})`;
async function viaMetno(city) {
  const url = `${METNO_URL}?lat=${Number(city.lat).toFixed(4)}&lon=${Number(city.lon).toFixed(4)}`;
  // Browsers set User-Agent itself (forbidden header); we still send the
  // compliant app identifier via a custom header + document the requirement.
  const j = await fetchJson(url, { headers: { 'Accept': 'application/vnd.met.no+json', 'X-Unified-Type-User-Agent': metUserAgent } });
  return normMetno(j, city.lat, city.lon, city.tz);
}

export async function getWeather(city, { force = false } = {}) {
  const key = `${city.lat.toFixed(2)},${city.lon.toFixed(2)}`;
  if (!force) {
    const cached = mem.get(key) || lsGet(key);
    if (cached && !cached.stale) return { ...cached, fromCache: true };
    if (cached?.stale) { /* serve stale while refreshing below */ }
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    let primaryErr = null;
    try {
      const w = await viaProxy(city);
      lsSet(key, w);
      return w;
    } catch (e) { primaryErr = e; }
    try {
      const w = await viaMetno(city);
      lsSet(key, w);
      return w;
    } catch (e) {
      const stale = mem.get(key) || lsGet(key);
      if (stale) return { ...stale, stale: true };
      throw Object.assign(new Error(
        primaryErr?.status === 502 || primaryErr?.message?.includes('proxy')
          ? 'Weather providers are unreachable right now.' : 'Weather is unavailable right now.'
      ), { primaryErr, fallbackErr: e });
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function convertTemp(c, unit) { return unit === 'f' && c != null ? Math.round((c * 9 / 5 + 32) * 10) / 10 : c; }
export function convertWind(kph, unit) { return unit === 'mph' && kph != null ? Math.round(kph * 0.621371 * 10) / 10 : kph; }
export const tempUnitLabel = u => u === 'f' ? '°F' : '°C';
export const windUnitLabel = u => u === 'mph' ? 'mph' : 'km/h';

/** Sun/moon calculations (SunCalc) for a coordinate & date. */
export function astroFor(city, dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const noonUtc = Date.UTC(y, m - 1, d, 12) - (city.lon / 15) * 3600000;
  const times = SunCalc.getTimes(new Date(noonUtc), city.lat, city.lon);
  const illum = SunCalc.getMoonIllumination(new Date(noonUtc));
  const moon = SunCalc.getMoonTimes(new Date(noonUtc), city.lat, city.lon);
  const valid = t => t instanceof Date && !isNaN(t.getTime()) && t.getUTCFullYear() === y;
  const iso = t => valid(t) ? t.toISOString() : null;
  return {
    sunrise: iso(times.sunrise), sunset: iso(times.sunset),
    solarNoon: iso(times.solarNoon),
    goldenHourStart: iso(times.sunriseEnd) || iso(times.goldenHourEnd),
    goldenHourEnd: iso(times.goldenHour) || iso(times.sunsetStart),
    blueHourStart: iso(times.dawn), blueHourEnd: iso(times.sunrise),
    dusk: iso(times.dusk), dawn: iso(times.dawn),
    daylightMin: valid(times.sunrise) && valid(times.sunset) ? Math.round((times.sunset - times.sunrise) / 60000) : (valid(times.nadir) && times.civilDawn <= times.civilDusk ? 1440 : null),
    polarDay: isNaN(times.sunrise.getTime()) || isNaN(times.sunset.getTime()),
    moonPhase: Math.round(illum.phase * 100) / 100,
    moonName: moonPhaseFromPhase(illum.phase),
    moonIllumPct: Math.round(illum.frac * 100),
    moonrise: iso(moon.rise), moonset: iso(moon.set),
    moonAlwaysUp: moon.alwaysUp === true, moonAlwaysDown: moon.alwaysDown === true,
  };
}
const SunCalc = SunCalcImport.default ?? SunCalcImport;
export function moonPhaseFromPhase(p) {
  const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  return names[Math.round(p * 8) % 8];
}
