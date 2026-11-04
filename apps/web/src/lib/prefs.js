// ── Shared app preferences (localStorage, no accounts) ───────────────────────
import { useCallback, useEffect, useState } from 'react';

const KEY = 'stive-tz-prefs-v1';

const DEFAULTS = {
  theme: 'auto',            // auto | light | dark
  hour12: false,
  units: { temp: 'c', wind: 'kmh' },
  referenceCity: null,      // {city,country,tz,lat,lon}
  favorites: [],            // city objects
  recents: [],              // city objects
  clocksOrder: null,        // array of tz ids
};

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

let state = load();
const listeners = new Set();

export function getPrefs() { return state; }
export function setPrefs(patch) {
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota */ }
  listeners.forEach(l => l(state));
}

export function usePrefs() {
  const [p, setP] = useState(state);
  useEffect(() => {
    const l = s => setP(s);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  const update = useCallback(patch => setPrefs(patch), []);
  return [p, update];
}

export function effectiveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function addRecent(city) {
  if (!city) return;
  const recents = [city, ...state.recents.filter(c => c.tz !== city.tz || c.city !== city.city)].slice(0, 8);
  setPrefs({ recents });
}

export function toggleFavorite(city) {
  const exists = state.favorites.some(f => f.tz === city.tz && f.city === city.city);
  const favorites = exists
    ? state.favorites.filter(f => !(f.tz === city.tz && f.city === city.city))
    : [...state.favorites, city];
  setPrefs({ favorites });
  return !exists;
}

export const isFavorite = (city) => state.favorites.some(f => f.tz === city.tz && f.city === city.city);
