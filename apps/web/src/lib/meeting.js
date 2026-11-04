// ── Meeting Planner engine (IANA-rule based, no fixed offsets) ───────────────
import { zonedParts, offsetMinAt, zonedTimeToUtc } from './tz.js';

const DAY = 86400000;

/** UTC ms for a local wall time "YYYY-MM-DD" + HH:mm in tz. */
export function localToUtc(dateStr, hour, minute, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return zonedTimeToUtc(y, m, d, hour, minute, 0, tz).utcMs;
}

/** Local calendar date of an instant in tz ("YYYY-MM-DD"). */
export function localDateOf(instant, tz) {
  const p = zonedParts(instant, tz);
  return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
}

/** Minute-of-day (local) of an instant in tz. */
export function localMinuteOfDay(instant, tz) {
  const p = zonedParts(instant, tz);
  return p.hour * 60 + p.minute;
}

/** Is the participant's local weekday included in workDays (0=Sun..6=Sat)? */
export function isWorkDay(instant, tz, workDays) {
  const wd = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const p = zonedParts(instant, tz);
  const idx = wd.indexOf(p.weekday);
  return workDays.includes(idx);
}

/** Classify a meeting start instant for one participant. */
export function classifySlot(startUtc, durationMin, p /*participant*/) {
  const endUtc = startUtc + durationMin * 60000;
  const statePerHalf = [];
  let inNight = false, inWork = false, blocked = false, rollover = false;
  // sample every 15 min across the meeting in the participant's local time
  for (let t = startUtc; t <= endUtc; t += 15 * 60000) {
    const lm = localMinuteOfDay(t, p.tz);
    const night = lm < 360 || lm >= 1380;              // 00:00-06:00 & 23:00-24:00 = night band
    const workday = isWorkDay(t, p.tz, p.workDays ?? [1,2,3,4,5]);
    const work = workday && lm >= (p.workStart ?? 540) && lm < (p.workEnd ?? 1020);
    const off = (p.breaks ?? []).some(b => lm >= b.start && lm < b.end && localDateOf(t, p.tz) === b.date);
    if (night) inNight = true;
    if (work) inWork = true;
    if (off) blocked = true;
    if (localDateOf(t, p.tz) !== localDateOf(startUtc, p.tz)) rollover = true;
    statePerHalf.push({ lm, night, work, off });
  }
  const workCovered = statePerHalf.filter(s => s.work).length / statePerHalf.length;
  return {
    night: inNight, working: inWork, blocked, rollover,
    workCoverage: Math.round(workCovered * 100),
    localStart: isoInZoneLocal(startUtc, p.tz),
    localEnd: isoInZoneLocal(endUtc, p.tz),
    startMinute: localMinuteOfDay(startUtc, p.tz),
    endMinute: localMinuteOfDay(endUtc, p.tz),
  };
}
function isoInZoneLocal(ms, tz){ const p=zonedParts(ms,tz); return `${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`; }

/** Convenience re-export so pages don't import tz.js twice. */
export { offsetMinAt };

/**
 * Score all candidate start times on a day (in 15-min steps, anchored to the
 * reference timezone's day) and rank them by participant convenience.
 * Returns { candidates: [{startUtc, score, perParticipant}], best: [...] }
 */
export function findSlots(dateStr, participants, durationMin, refTz, stepMin = 15) {
  const out = [];
  const dayStartUtc = localToUtc(dateStr, 0, 0, refTz);
  for (let k = 0; k < 96; k++) {
    const startUtc = dayStartUtc + k * stepMin * 60000;
    // only consider starts whose LOCAL date in refTz is still `dateStr`
    if (localDateOf(startUtc, refTz) !== dateStr) continue;
    const per = participants.map(p => ({ p, c: classifySlot(startUtc, durationMin, p) }));
    let score = 0;
    for (const { p, c } of per) {
      if (c.blocked) score -= 30;
      if (c.night) score -= 25;
      score += c.workCoverage * 0.5;                       // reward full-hours coverage
      if (!c.night && !c.blocked && c.workCoverage === 100) score += 10;
      if (c.rollover) score -= 5;                          // meeting crosses their midnight
    }
    out.push({ startUtc, score: Math.round(score), perParticipant: per });
  }
  const ranked = [...out].sort((a, b) => b.score - a.score);
  return { candidates: out, best: ranked.slice(0, 5) };
}

/** 24h timeline rows: per participant, mark each half-hour as work/night/off/normal (local). */
export function timelineRows(dateStr, participants, refTz, durationMin = 60) {
  const dayStartUtc = localToUtc(dateStr, 0, 0, refTz);
  return participants.map(p => {
    const cells = [];
    for (let m = 0; m < 1440; m += 30) {
      const t = dayStartUtc + m * 60000;
      const lm = localMinuteOfDay(t, p.tz);
      const night = lm < 360 || lm >= 1380;
      const workday = isWorkDay(t, p.tz, p.workDays ?? [1,2,3,4,5]);
      const work = workday && lm >= (p.workStart ?? 540) && lm < (p.workEnd ?? 1020);
      const off = (p.breaks ?? []).some(b => lm >= b.start && lm < b.end && localDateOf(t, p.tz) === b.date);
      cells.push({ refMin: m, localMin: lm, night, work, off, label: `${String(Math.floor(lm/60)).padStart(2,'0')}:${String(lm%60).padStart(2,'0')}` });
    }
    return { p, cells };
  });
}

/** ICS export (RFC 5545) with TZID properties — clients resolve real rules. */
export function buildICS({ title, startUtc, durationMin, organizerTz, participants }) {
  const dt = (ms, tz) => {
    if (tz === 'UTC') return fmtUtc(ms) + 'Z';
    const p = zonedParts(ms, tz);
    return `${p.year}${pp(p.month)}${pp(p.day)}T${pp(p.hour)}${pp(p.minute)}00`;
  };
  const fmtUtc = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}${pp(d.getUTCMonth()+1)}${pp(d.getUTCDate())}T${pp(d.getUTCHours())}${pp(d.getUTCMinutes())}${pp(d.getUTCSeconds())}`; };
  const pp = n => String(n).padStart(2, '0');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Stive Timezone//Meeting Planner//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:stive-${startUtc}@stivetimezone`,
    `DTSTAMP:${fmtUtc(Date.now())}Z`,
    `DTSTART;TZID=${organizerTz}:${dt(startUtc, organizerTz)}`,
    `DTEND;TZID=${organizerTz}:${dt(startUtc + durationMin * 60000, organizerTz)}`,
    `SUMMARY:${(title || 'Meeting').replace(/[,;]/g, '')}`,
    `DESCRIPTION:${participants.map(p => `${p.city}: ${isoInZoneLocal(startUtc,p.tz)}–${isoInZoneLocal(startUtc+durationMin*60000,p.tz)}`).join('\\n').replace(/[,;]/g,' ')}`,
    ...participants.map(p => `ATTENDEE;CN=${p.city}:mailto:${(p.email||'participant').replace(/\s/g,'.')}@example.com`),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}
export { zonedParts };
