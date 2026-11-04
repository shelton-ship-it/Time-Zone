import { useEffect, useState } from 'react';
/** Ticking "now" shared by clocks. intervalMs default 1000. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    const id = setInterval(() => { if (alive) setNow(Date.now()); }, intervalMs);
    const onVis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [intervalMs]);
  return now;
}
