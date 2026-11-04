// ── Central runtime configuration ────────────────────────────────────────────
// NO absolute URLs are hardcoded in components. Every external endpoint and
// base URL comes from build-time env (VITE_*) or runtime globals, with safe
// same-origin defaults. Secrets (WEATHERAPI_KEY) never appear here — they live
// only server-side (see vite.config.js weather proxy).
const env = import.meta.env || {};

/** Public site origin used for share links / embeds / widgets. */
export const SITE_URL = (env.VITE_SITE_URL || '').replace(/\/+$/, '')
  || (typeof window !== 'undefined' ? window.location.origin : '');

/** Base path for our own API surface (same-origin '/api' by default; set
 *  VITE_API_BASE_URL when the API is deployed on another host). */
export const API_BASE_URL = (env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

/** Weather proxy endpoint (served by our backend; key stays server-side). */
export const WEATHER_PROXY_URL = env.VITE_WEATHER_PROXY_URL || `${API_BASE_URL}/weather/current`;

/** MET Norway fallback — public, keyless, CORS-enabled. Overridable via env. */
export const METNO_URL = env.VITE_METNO_URL || 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

/** Contact info required by MET Norway's terms for the User-Agent.
 *  Configure VITE_CONTACT_EMAIL in deployment; we send a compliant UA either way. */
export const CONTACT_EMAIL = env.VITE_CONTACT_EMAIL || '';

/** Google Calendar helper link (public utility, overridable). */
export const GOOGLE_CAL_URL = env.VITE_GOOGLE_CAL_URL || 'https://calendar.google.com/calendar/render';

/** Number of forecast days requested (WeatherAPI free plan: 3, Starter: 7). */
export const WEATHER_DAYS = Math.min(7, Number(env.VITE_WEATHER_DAYS || 7));

/** Tile server for the world map (raster tiles need no key). Overridable so
 *  deployments can point at their own tile host. */
export const MAP_TILE_URL = env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_ATTRIBUTION = env.VITE_MAP_ATTRIBUTION || '© OpenStreetMap contributors';
