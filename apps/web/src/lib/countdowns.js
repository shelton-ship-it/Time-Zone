// Countdown events stored locally (shared by Home, Calculators, Timers, Widgets).
const KEY = 'stive-tz-countdowns-v1';
export function loadCountdowns() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function saveCountdowns(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} }
export function addCountdown({ label, targetMs }) {
  const list = loadCountdowns().filter(c => c.label !== label);
  list.push({ id: Date.now().toString(36), label, targetMs });
  saveCountdowns(list);
  return list;
}
export function removeCountdown(id) { saveCountdowns(loadCountdowns().filter(c => c.id !== id)); return loadCountdowns(); }
