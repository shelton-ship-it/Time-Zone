// ── Travel engine: jet lag, flight time, sleep plan ──────────────────────────
import { offsetMinAt, zonedParts, zonedTimeToUtc } from './tz.js';

const R = 6371; // km
const rad = d => d * Math.PI / 180;

export function greatCircleKm(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Estimated flight time: cruise speed model + fixed climb/descent allowance. */
export function estimateFlight(km) {
  if (km < 500) return { hours: 0.75 + km / 700, note: 'short-haul turboprop/jet model' };
  const hours = 1.0 + km / 850;   // ~850 km/h average block speed incl. taxi/climb
  return { hours: Math.round(hours * 100) / 100, note: 'typical jet airliner model' };
}

export function jetLag({ originTz, destTz, dateStr, direction = 'east' }) {
  const noon = Date.parse(dateStr + 'T12:00:00Z');
  const diffH = (offsetMinAt(destTz, noon) - offsetMinAt(originTz, noon)) / 60;
  const absDiff = Math.abs(diffH);
  const effEast = diffH > 0 ? absDiff : 0;   // eastward shift is harder (~2/3 day per hour rule of thumb)
  const effWest = diffH < 0 ? absDiff : 0;
  const daysToAdjust = Math.ceil(effEast / 1.5 + effWest / 2); // common heuristic: 1 day per 1.5h east, 2h west
  const circadianRisk = absDiff <= 3 ? 'low' : absDiff <= 6 ? 'moderate' : 'high';
  return { diffH, absDiff, daysToAdjust, circadianRisk, eastward: diffH > 0, westward: diffH < 0 };
}

/** Practical day-by-day sleep shift schedule toward destination time. */
export function sleepPlan({ originTz, destTz, travelDate, tripLengthDays = 7 }) {
  const noon = Date.parse(travelDate + 'T12:00:00Z');
  const diffH = (offsetMinAt(destTz, noon) - offsetMinAt(originTz, noon)) / 60;
  const steps = [];
  const totalShift = diffH;
  const n = Math.max(1, Math.min(tripLengthDays, Math.ceil(Math.abs(totalShift) / 1)));
  for (let i = 0; i <= tripLengthDays; i++) {
    const done = Math.min(1, i / n);
    const shift = totalShift * done;
    const bedtimeLocalOrigin = mod24(22 - shift); // shifting target bedtime in origin body-clock terms
    steps.push({
      day: i === 0 ? 'Travel day' : `Day +${i}`,
      shiftHours: Math.round(shift * 10) / 10,
      suggestedBedtimeOriginTime: fmtHM(bedtimeLocalOrigin),
      lightAdvice: totalShift > 0
        ? (i < n ? 'Seek morning light at destination; avoid late-afternoon sun.' : 'Full eastward adaptation — normal mornings.')
        : totalShift < 0 ? (i < n ? 'Seek evening light; tolerate early-morning dips.' : 'Westward adaptation complete.')
          : 'No shift needed (same timezone).',
    });
  }
  return { diffH, steps };
}
const mod24 = h => ((h % 24) + 24) % 24;
const fmtHM = h => `${String(Math.floor(mod24(h))).padStart(2, '0')}:${String(Math.round((mod24(h) % 1) * 60)).padStart(2, '0')}`;

/** Arrival planning: departure local datetime → arrival local datetime in destination. */
export function travelTimeline({ depCity, arrCity, depDateStr, depHour, depMin, durationH }) {
  // Interpret the departure wall time in the departure city's real zone (DST-safe).
  const [dy, dm, dd] = depDateStr.split('-').map(Number);
  const depUtc = zonedTimeToUtc(dy, dm, dd, depHour, depMin, 0, depCity.tz).utcMs;
  const arrUtc = depUtc + durationH * 3600000;
  const dp = zonedParts(depUtc, depCity.tz), ap = zonedParts(arrUtc, arrCity.tz);
  return {
    depUtc, arrUtc,
    depLocal: `${dp.year}-${String(dp.month).padStart(2,'0')}-${String(dp.day).padStart(2,'0')} ${String(dp.hour).padStart(2,'0')}:${String(dp.minute).padStart(2,'0')} (${dp.weekday})`,
    arrLocal: `${ap.year}-${String(ap.month).padStart(2,'0')}-${String(ap.day).padStart(2,'0')} ${String(ap.hour).padStart(2,'0')}:${String(ap.minute).padStart(2,'0')} (${ap.weekday})`,
    crossedMidnight: ap.day !== dp.day || ap.month !== dp.month || ap.year !== dp.year,
  };
}

