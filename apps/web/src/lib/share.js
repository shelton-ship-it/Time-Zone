// ── Shareable links (state lives entirely in the URL — no accounts, no PII) ──
import { zonedTimeToUtc } from './tz.js';
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
  return {
    sourceTz: p.get('from'),
    destTzs: p.get('to') ? p.get('to').split(',').filter(Boolean) : [],
    iso: p.get('at'),
  };
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
    return {
      dateStr: p.get('d'), durationMin: Number(p.get('dur')) || 60, refTz: p.get('ref'),
      participants: p.get('who').split(';').filter(Boolean).map(tok => {
        const [tz, ws, we, days] = tok.split('|');
        return { tz, workStart: +ws, workEnd: +we, workDays: [...(days || '12345')].map(Number) };
      }),
    };
  } catch { return null; }
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
