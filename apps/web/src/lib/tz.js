// ── Stive Timezone: IANA timezone engine ─────────────────────────────────────
// All conversions go through the runtime IANA tz database (V8/timezone-data) via
// Intl.DateTimeFormat and date-fns-tz. No fixed UTC offsets are ever assumed.

const fmtCache = new Map();

export function isValidZone(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; }
  catch { return false; }
}

function partsFormatter(tz, hour12 = false) {
  const key = tz + '|' + hour12;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    fmtCache.set(key, f);
  }
  return f;
}

/** Calendar parts of an instant as seen in a timezone. */
export function zonedParts(instant, tz, hour12 = false) {
  const out = {};
  for (const p of partsFormatter(tz, hour12).formatToParts(new Date(instant))) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  // Intl gives hour "24" at midnight in h23 mode on some engines — normalize.
  if (out.hour === '24') out.hour = '00';
  return {
    year: +out.year, month: +out.month, day: +out.day,
    hour: +out.hour, minute: +out.minute, second: +out.second,
    weekday: out.weekday,
  };
}

/** Offset (in minutes) of a timezone at a given instant: localUTC − UTC. */
export function offsetMinAt(tz, instant) {
  const d = new Date(instant);
  const p = zonedParts(instant, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Round to whole minute to absorb ms drift between format call and now.
  return Math.round((asUTC - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** Minutes west/east convention: returns offset in minutes for `HH:mm` display. */
export function offsetString(mins) {
  const sign = mins < 0 ? '-' : '+';
  const a = Math.abs(mins);
  const h = Math.floor(a / 60), m = a % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function offsetLabel(tz, instant = Date.now()) {
  return 'UTC' + offsetString(offsetMinAt(tz, instant));
}

const gmtFormatterCache = new Map();
export function shortAbbr(tz, instant = Date.now()) {
  // Generic long form, e.g. "GMT+8", "GMT+5:30". Unambiguous unlike EST/IST.
  const key = String(instant);
  let f = gmtFormatterCache.get(key);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }); gmtFormatterCache.set(key, f); }
  const part = f.formatToParts(new Date(instant)).find(p => p.type === 'timeZoneName');
  return part ? part.value.replace('GMT', 'UTC').replace('UTC', 'UTC') : offsetLabel(tz, instant);
}

export function abbrShort(tz, instant = Date.now()) {
  const p = zonedParts(instant, tz);
  const off = offsetMinAt(tz, instant);
  const stdOff = standardOffsetMin(tz);
  const dst = off > stdOff;
  const name = tz.split('/').pop().replace(/_/g, ' ');
  return { name, offset: off, dst, label: offsetString(off) };
}

/** Smallest offset over ±4 years ≈ standard offset (works for both hemispheres). */
export function standardOffsetMin(tz) {
  const now = Date.now();
  let min = Infinity;
  for (let i = 0; i <= 48; i++) {
    const t = now + (i - 24) * 30 * 86400000;
    min = Math.min(min, offsetMinAt(tz, t));
  }
  return min;
}

/** DST detection at an instant: offset greater than the zone's minimum offset. */
export function isDST(tz, instant = Date.now()) {
  if (!isValidZone(tz)) return false;
  return offsetMinAt(tz, instant) > standardOffsetMin(tz);
}

/**
 * Convert a wall-clock time in `tz` to a UTC epoch (ms).
 * Iterative fixed-point using real tz rules → correct across DST transitions.
 * nonexistent: true when the local time does not exist (spring-forward gap).
 * ambiguous:   true when the local time maps to two instants (fall-back overlap).
 */
export function zonedTimeToUtc(year, month, day, hour, minute, second, tz) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const off = offsetMinAt(tz, guess);
    const next = Date.UTC(year, month - 1, day, hour, minute, second) - off * 60000;
    if (next === guess) break;
    guess = next;
  }
  // Probe ±1h around the result to classify the transition behaviour.
  const probes = [guess - 3600000, guess, guess + 3600000];
  const sols = [];
  for (const base of probes) {
    let t = base;
    for (let i = 0; i < 4; i++) {
      const off = offsetMinAt(tz, t);
      const nt = Date.UTC(year, month - 1, day, hour, minute, second) - off * 60000;
      if (nt === t) break;
      t = nt;
    }
    const p = zonedParts(t, tz);
    if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute) {
      if (!sols.some(s => s === t)) sols.push(t);
    }
  }
  const canonical = sols.length ? sols[0] : guess;
  const cp = zonedParts(canonical, tz);
  const matches = cp.year === year && cp.month === month && cp.day === day && cp.hour === hour && cp.minute === minute;
  return {
    utcMs: canonical,
    exists: matches,                       // false ⇒ nonexistent local time (gap)
    ambiguous: sols.length > 1,            // true ⇒ rolled-back overlap
    resolvedLabel: matches ? null : (() => {
      const want = `${pad(day)}/${pad(month)}/${year} ${pad(hour)}:${pad(minute)}`;
      const got = `${pad(cp.day)}/${pad(cp.month)}/${cp.year} ${pad(cp.hour)}:${pad(cp.minute)}`;
      return `Local time ${want} does not exist in ${tz} (clocks jump from ${got === want ? '' : shiftedFrom(year,month,day,hour,minute,tz)} forward). Interpreted as ${got}.`;
    })(),
  };
}

function shiftedFrom(y, m, d, h, mi, tz) {
  // Find the post-gap wall time by stepping back offset diff.
  const target = Date.UTC(y, m - 1, d, h, mi);
  for (let k = 0; k <= 180; k++) {
    const t = target - k * 60000;
    const p = zonedParts(t, tz);
    if (p.hour !== h || p.minute !== mi) {
      const np = zonedParts(t + 60000, tz);
      return `${pad(p.hour)}:${pad(p.minute)}`;
    }
  }
  return `${pad(h)}:${pad(mi)}`;
}

const pad = n => String(n).padStart(2, '0');

/** Format helpers built on Intl so they always respect real tz rules. */
export function formatInZone(instant, tz, opts) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }).format(new Date(instant));
}

export function timeString(instant, tz, hour12) {
  return formatInZone(instant, tz, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12 });
}
export function dateString(instant, tz, hour12 = false) {
  return formatInZone(instant, tz, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
export function isoInZone(instant, tz) {
  const p = zonedParts(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** Difference (hours, may be fractional incl. :30/:45 zones) between two zones at an instant. */
export function zoneDiffHours(tzA, tzB, instant = Date.now()) {
  return (offsetMinAt(tzB, instant) - offsetMinAt(tzA, instant)) / 60;
}

/** Upcoming DST transitions within ~2 years for a zone. */
export function nextDstTransitions(tz, fromMs = Date.now(), count = 2) {
  const res = [];
  let prevOff = offsetMinAt(tz, fromMs);
  let t = fromMs;
  for (let i = 0; i < 730 && res.length < count; i++) {
    t += 86400000;
    const off = offsetMinAt(tz, t);
    if (off !== prevOff) {
      // binary-search the exact change point within this day
      let lo = t - 86400000, hi = t;
      while (hi - lo > 60000) {
        const mid = Math.floor((lo + hi) / 2);
        if (offsetMinAt(tz, mid) === prevOff) lo = mid; else hi = mid;
      }
      res.push({
        atUtcMs: hi,
        from: offsetString(prevOff),
        to: offsetString(off),
        direction: off > prevOff ? 'forward' : 'backward',
        localBefore: isoInZone(lo, tz),
        localAfter: isoInZone(hi, tz),
      });
      prevOff = off;
      t = hi;
    }
  }
  return res;
}

export function userZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC';
}
