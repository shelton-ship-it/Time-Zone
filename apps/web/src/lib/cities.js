// ── City / timezone dataset helpers ───────────────────────────────────────────
import raw from '../data/cities.json';
import { isValidZone, offsetMinAt } from './tz.js';

export const CITIES = raw.filter(c => isValidZone(c.tz));

export const ZONES = [...new Set(CITIES.map(c => c.tz))].sort();

const slugCache = new Map();
export function citySlug(city) {
  let s = slugCache.get(city);
  if (!s) {
    s = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    slugCache.set(city, s);
  }
  return s;
}
export function findCityBySlug(slug) {
  return CITIES.find(c => citySlug(c.city) === slug) || null;
}
export function findCity(name, tz) {
  const n = name.toLowerCase();
  return CITIES.find(c => c.city.toLowerCase() === n && (!tz || c.tz === tz))
    || CITIES.find(c => c.city.toLowerCase().startsWith(n) && (!tz || c.tz === tz))
    || null;
}

/** Search by city, country or IANA zone. Ranked by population then name. */
export function searchCities(q, limit = 12) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const scored = [];
  for (const c of CITIES) {
    const city = c.city.toLowerCase(), country = c.country.toLowerCase(), zone = c.tz.toLowerCase();
    let score = -1;
    if (city === needle) score = 100;
    else if (city.startsWith(needle)) score = 80;
    else if (zone.split('/')[1]?.startsWith(needle.replace(/-/g, '_'))) score = 70;
    else if (zone.includes(needle.replace(/-/g, '_'))) score = 60;
    else if (city.includes(needle)) score = 40;
    else if (country.startsWith(needle)) score = 30;
    else if (country.includes(needle)) score = 20;
    if (score > 0) scored.push([score + Math.min(10, c.pop / 1000000), c]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, limit).map(([, c]) => c);
}

export const POPULAR = ['Maputo', 'London', 'New York', 'Tokyo', 'Dubai', 'Sydney']
  .map(n => CITIES.find(c => c.city === n)).filter(Boolean);

export function zonesWithOffsets(instant = Date.now()) {
  // one representative label per zone id, with current offsets (for Explorer)
  const map = new Map();
  for (const c of CITIES) {
    if (!map.has(c.tz)) map.set(c.tz, { tz: c.tz, cities: [], offset: offsetMinAt(c.tz, instant) });
    map.get(c.tz).cities.push(c);
  }
  return [...map.values()].sort((a, b) => a.offset - b.offset || a.tz.localeCompare(b.tz));
}

export function countries() {
  const set = new Set(CITIES.map(c => c.country).filter(Boolean));
  return [...set].sort();
}
