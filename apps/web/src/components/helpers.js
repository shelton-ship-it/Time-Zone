import { zoneDiffHours } from '../lib/tz.js';
export function diffLabel(fromTz, toTz, now) {
  const d = zoneDiffHours(fromTz, toTz, now);
  const sign = d >= 0 ? '+' : '−';
  const a = Math.abs(d);
  const h = Math.floor(a), m = Math.round((a - h) * 60);
  if (h === 0 && m === 0) return 'same time';
  return `${sign}${h > 0 ? h + 'h' : ''}${m > 0 ? (h ? ' ' : '') + m + 'm' : ''}`;
}
