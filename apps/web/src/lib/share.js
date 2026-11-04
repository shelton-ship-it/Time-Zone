// ── Shareable links (state lives entirely in the URL — no accounts, no PII) ──
import { zonedTimeToUtc, isValidZone } from './tz.js';
import { SITE_URL, GOOGLE_CAL_URL } from './config.js';

export function encodeConversion({ sourceTz, destTzs, iso }) {
  const p = new URLSearchParams();
  p.set('from', sourceTz);
  p.set('to', destTzs.join(','));
  if (iso) p.set('at', iso);
  return `/converter?${p.toString()}`;
}
export function decodeConversion(search) {
  const p = new URLSearchParams(search);
  const sourceTz = p.get('from');
  const destTzs = p.get('to') ? p.get('to').split(',').filter(Boolean) : [];
  const iso = p.get('at');
  // Malformed shares: unknown zones or unparseable datetimes are ignored so the
  // converter falls back to sane defaults instead of breaking.
  if (sourceTz && !isValidZone(sourceTz)) return { sourceTz: null, destTzs: [], iso: null };
  if (iso && !/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(:\d{2})?$/.test(iso)) return { sourceTz, destTzs, iso: null };
  if (!sourceTz && !destTzs.length && !iso) return { sourceTz: null, destTzs: [], iso: null };
  return { sourceTz, destTzs, iso };
}

/** Meeting link: participants encoded as tz|startMin|endMin|workDays (no names/emails). */
export function encodeMeeting({ dateStr, durationMin, refTz, participants }) {
  const p = new URLSearchParams();
  p.set('d', dateStr); p.set('dur', String(durationMin)); p.set('ref', refTz);
  p.set('who', participants.map(x => [x.tz, x.workStart ?? 540, x.workEnd ?? 1020, (x.workDays ?? [1,2,3,4,5]).join('')].join('|')).join(';'));
  return `/meeting-planner?${p.toString()}`;
}
export function decodeMeeting(search) {
  try {
    const p = new URLSearchParams(search);
    if (!p.get('who')) return null;
    const participants = p.get('who').split(';').filter(Boolean).map(tok => {
      const [tz, ws, we, days] = tok.split('|');
      return { tz, workStart: +ws, workEnd: +we, workDays: [...(days || '12345')].map(Number) };
    });
    // Reject malformed shares (missing/invalid zones or nonsense working-hour ranges).
    if (!participants.length || !isValidZone(p.get('ref'))) return null;
    for (const x of participants) {
      if (!x.tz || !isValidZone(x.tz)) return null;
      if (!(x.workStart >= 0 && x.workStart <= 1439 && x.workEnd >= 0 && x.workEnd <= 1440 && x.workEnd > x.workStart)) return null;
      if (!x.workDays.length || x.workDays.some(d => !(d >= 0 && d <= 6))) return null;
    }
    return { dateStr: p.get('d'), durationMin: Number(p.get('dur')) || 60, refTz: p.get('ref'), participants };
  } catch { return null; }
}

/** Absolute embed URL for the standalone clock widget (iframe-safe route). */
export function embedUrl({ cities, hour12 = false, theme = 'light', showDate = true, showWeather = false, width = 320, height = 180 }) {
  const base = SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const p = new URLSearchParams();
  p.set('cities', (Array.isArray(cities) ? cities : [cities]).join(','));
  p.set('h', hour12 ? '12' : '24');
  p.set('theme', theme);
  if (!showDate) p.set('date', '0');
  if (showWeather) p.set('weather', '1');
  p.set('w', String(width));
  p.set('ht', String(height));
  return `${base}/embed/clock?${p.toString()}`;
}

export function absoluteUrl(path) {
  const base = SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  return base ? base + path : path;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    // fallback for non-secure contexts
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }
}

export function downloadICS(filename, icsText) {
  const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function googleCalUrl({ title, startUtc, durationMin, details }) {
  const fmt = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z/, 'Z');
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: title,
    dates: `${fmt(startUtc)}/${fmt(startUtc + durationMin * 60000)}`,
    details: details || '', trv: 'tp',
  });
  return `${GOOGLE_CAL_URL}?${p.toString()}`;
}
