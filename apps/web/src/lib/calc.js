// ── Date & Time calculators (pure, testable) ─────────────────────────────────
import { zonedParts, zonedTimeToUtc, offsetMinAt } from './tz.js';

const DAY = 86400000;
export const pad = n => String(n).padStart(2, '0');
export const toISODate = ms => new Date(ms).toISOString().slice(0, 10);

/** Inclusive-or-exclusive date difference. Returns {days, weeks, months, years,...}. */
export function dateDifference(startStr, endStr, { inclusiveEnd = false } = {}) {
  const s = parseYMD(startStr), e = parseYMD(endStr);
  if (!s || !e) return { error: 'Invalid date' };
  const sign = e >= s ? 1 : -1;
  const a = sign === 1 ? s : e, b = sign === 1 ? e : s;
  const daysWhole = Math.round((b - a) / DAY);
  const days = daysWhole + (inclusiveEnd ? 1 : 0);
  // calendar breakdown y/m/d
  let y = b.getUTCFullYear() - a.getUTCFullYear();
  let m = b.getUTCMonth() - a.getUTCMonth();
  let d = b.getUTCDate() - a.getUTCDate();
  if (d < 0) { m--; d += daysInMonth(prevMonth(b)); }
  if (m < 0) { y--; m += 12; }
  return {
    sign, days, hours: days * 24, minutes: days * 1440,
    weeks: Math.floor(days / 7), restDays: days % 7,
    years: y, months: m, remDays: d,
    weekdaysCount: countWeekdays(a, b, inclusiveEnd),
  };
}
function prevMonth(dt) { const x = new Date(dt); x.setUTCMonth(x.getUTCMonth() - 1); return x; }
export function parseYMD(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(dt)) return null;
  return dt;
}
export const daysInMonth = dt => new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
export const isLeapYear = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function countWeekdays(a, b, inclusive) {
  let c = 0;
  for (let t = a.getTime(); t < b.getTime() + (inclusive ? DAY : 0); t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (wd >= 1 && wd <= 5) c++;
  }
  return c;
}

/** Add/subtract amount of unit to a date string. */
export function addToDate(dateStr, amount, unit, direction = 1) {
  const dt = parseYMD(dateStr);
  if (!dt) return { error: 'Invalid date' };
  const v = Math.abs(amount) * direction;
  const out = new Date(dt);
  switch (unit) {
    case 'years': out.setUTCFullYear(out.getUTCFullYear() + v); break;      // clamps Feb 29 → Feb 28/29
    case 'months': out.setUTCMonth(out.getUTCMonth() + v); break;           // clamps month lengths
    case 'weeks': out.setUTCDate(out.getUTCDate() + v * 7); break;
    case 'days': out.setUTCDate(out.getUTCDate() + v); break;
    default: return { error: 'Unknown unit' };
  }
  return { result: toISODate(out.getTime()), dayOfWeek: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' }).format(out) };
}

/** Age in years/months/days + total days. */
export function age(birthStr, onStr, tz = 'UTC') {
  const b = parseYMD(birthStr), o = parseYMD(onStr);
  if (!b || !o) return { error: 'Invalid date' };
  if (b > o) return { error: 'Birth date must be before the reference date.' };
  let y = o.getUTCFullYear() - b.getUTCFullYear();
  let m = o.getUTCMonth() - b.getUTCMonth();
  let d = o.getUTCDate() - b.getUTCDate();
  if (d < 0) { m--; d += daysInMonth(new Date(Date.UTC(o.getUTCFullYear(), o.getUTCMonth(), 1))); }
  if (m < 0) { y--; m += 12; }
  const totalDays = Math.round((o - b) / DAY);
  return { years: y, months: m, days: d, totalDays, totalWeeks: Math.floor(totalDays / 7), totalMonths: y * 12 + m, nextBirthdayDays: daysUntilNextBirthday(b, o) };
}
function daysUntilNextBirthday(b, today) {
  let nb = new Date(Date.UTC(today.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()));
  if (nb < today) nb = new Date(Date.UTC(today.getUTCFullYear() + 1, b.getUTCMonth(), b.getUTCDate()));
  if (b.getUTCMonth() === 1 && b.getUTCDate() === 29 && !isLeapYear(nb.getUTCFullYear())) nb = new Date(Date.UTC(nb.getUTCFullYear(), 2, 1));
  return Math.round((nb - today) / DAY);
}

/** Business-day arithmetic with custom weekend days & holidays (YYYY-MM-DD list). */
export function addBusinessDays(dateStr, n, { weekend = [0, 6], holidays = [] } = {}) {
  const hol = new Set(holidays);
  let dt = parseYMD(dateStr);
  if (!dt) return { error: 'Invalid date' };
  const dir = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  let added = 0;
  while (left > 0) {
    dt.setUTCDate(dt.getUTCDate() + dir);
    added++;
    const wd = dt.getUTCDay();
    if (!weekend.includes(wd) && !hol.has(toISODate(dt.getTime()))) left--;
    if (added > 100000) return { error: 'Too many iterations' };
  }
  return { result: toISODate(dt.getTime()), calendarDays: added };
}

export function countBusinessDays(startStr, endStr, { weekend = [0, 6], holidays = [], inclusiveEnd = true } = {}) {
  const hol = new Set(holidays);
  const s = parseYMD(startStr), e = parseYMD(endStr);
  if (!s || !e) return { error: 'Invalid date' };
  const sign = e >= s ? 1 : -1;
  const a = sign === 1 ? s : e, b = sign === 1 ? e : s;
  let c = 0;
  for (let t = a.getTime(); t < b.getTime() + (inclusiveEnd ? DAY : 0); t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (!weekend.includes(wd) && !hol.has(toISODate(t))) c++;
  }
  return { businessDays: c * sign, totalDays: Math.round((b - a) / DAY) + (inclusiveEnd ? 1 : 0) };
}

/** ISO-8601 week number. */
export function isoWeek(dateStr) {
  const dt = parseYMD(dateStr);
  if (!dt) return { error: 'Invalid date' };
  const d = new Date(dt);
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const ftDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDay + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * DAY));
  return { year: d.getUTCFullYear(), week, dayOfWeek: (dt.getUTCDay() + 6) % 7 + 1,
    weekStart: toISODate(d.getTime() - 3 * DAY), weekEnd: toISODate(d.getTime() + 3 * DAY) };
}

/** Duration between two instants (ms), broken down. */
export function durationBetween(startMs, endMs) {
  if (!isFinite(startMs) || !isFinite(endMs)) return { error: 'Invalid times' };
  let ms = endMs - startMs;
  const sign = ms < 0 ? -1 : 1;
  ms = Math.abs(ms);
  const days = Math.floor(ms / DAY), rem = ms % DAY;
  const h = Math.floor(rem / 3600000), mi = Math.floor(rem % 3600000 / 60000), s = Math.floor(rem % 60000 / 1000);
  return { sign, totalMs: ms * sign, days, hours: h, minutes: mi, seconds: s,
    totalHours: ms / 3600000, totalMinutes: Math.round(ms / 60000), formatted: `${days}d ${pad(h)}:${pad(mi)}:${pad(s)}` };
}

/** Deadline calculator: work needed per day given available daily capacity. */
export function deadline({ dueStr, startStr = toISODate(Date.now()), hoursNeeded, hoursPerDay, weekendOnly = false }) {
  const s = parseYMD(startStr), d = parseYMD(dueStr);
  if (!s || !d) return { error: 'Invalid dates' };
  if (d < s) return { error: 'Due date is before the start date.' };
  const workDays = [];
  for (let t = s.getTime(); t <= d.getTime(); t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (weekendOnly ? (wd === 0 || wd === 6) : wd >= 1 && wd <= 5) workDays.push(toISODate(t));
  }
  const need = Math.max(0, hoursNeeded);
  const perDay = need / Math.max(1, workDays.length);
  return {
    totalCalendarDays: Math.round((d - s) / DAY), workingDays: workDays.length,
    requiredPerDay: Math.ceil(perDay * 100) / 100,
    feasible: perDay <= hoursPerDay,
    daysRemaining: workDays.length,
  };
}

/** Countdown parts from an instant to a target UTC ms. */
export function countdownParts(targetMs, nowMs = Date.now()) {
  const diff = targetMs - nowMs;
  const past = diff <= 0;
  const abs = Math.abs(diff);
  return {
    past, days: Math.floor(abs / DAY), hours: Math.floor(abs % DAY / 3600000),
    minutes: Math.floor(abs % 3600000 / 60000), seconds: Math.floor(abs % 60000 / 1000),
    totalMs: diff,
  };
}

/** Split a duration written in one timezone's wall time and measure elapsed across zones. */
export function timezoneDuration(startWall, fromTz, endWall, toTz) {
  const [sy, sm, sd, sh, smi] = startWall.match(/(\d+)-(\d+)-(\d+)[T ](\d+):(\d+)/).map(Number);
  const [ey, em, ed, eh, emi] = endWall.match(/(\d+)-(\d+)-(\d+)[T ](\d+):(\d+)/).map(Number);
  const a = zonedTimeToUtc(sy, sm, sd, sh, smi, 0, fromTz).utcMs;
  const b = zonedTimeToUtc(ey, em, ed, eh, emi, 0, toTz).utcMs;
  return durationBetween(a, b);
}
