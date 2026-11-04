import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSeoTitle, Field, Notice, fmtTime } from '../components/ui.jsx';
import { pad } from '../lib/calc.js';
import { loadCountdowns, addCountdown, removeCountdown } from '../lib/countdowns.js';
import { countdownParts } from '../lib/calc.js';

// ── Drift-free engine: everything is derived from Date.now() anchors, never
//    from counting setInterval ticks. Tab suspension/throttling cannot skew it.
const fmtMs = (ms, withMs = false) => {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600000), m = Math.floor(abs % 3600000 / 60000), s = Math.floor(abs % 60000 / 1000);
  const cs = Math.floor(abs % 1000 / 10);
  const base = `${h ? String(h) + ':' : ''}${pad(m)}:${pad(s)}`;
  return withMs ? `${base}.${String(cs).padStart(2, '0')}` : base;
};

function useRafTick(active) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    let id, alive = true;
    const loop = () => { if (!alive) return; force(x => x + 1); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(id); };
  }, [active]);
  // also refresh on tab becoming visible again
  useEffect(() => {
    if (!active) return;
    const v = () => force(x => x + 1);
    document.addEventListener('visibilitychange', v);
    return () => document.removeEventListener('visibilitychange', v);
  }, [active]);
}

// ── Stopwatch ────────────────────────────────────────────────────────────────
function Stopwatch() {
  const [start, setStart] = useState(null);      // epoch ms when running started
  const [accum, setAccum] = useState(0);         // accumulated paused time
  const [laps, setLaps] = useState([]);          // absolute elapsed values
  const running = start != null;
  useRafTick(running);
  const elapsed = running ? accum + (Date.now() - start) : accum;
  const lapValue = laps.length ? elapsed - laps[laps.length - 1] : elapsed;
  return (
    <div className="card">
      <h3 className="mt0">Stopwatch</h3>
      <div className="big-time" role="timer" aria-live="off">{fmtMs(elapsed, true)}</div>
      <div className="row" style={{ marginTop: 10 }}>
        {!running
          ? <button className="btn primary" onClick={() => setStart(Date.now())}>{accum ? 'Resume' : 'Start'}</button>
          : <button className="btn" onClick={() => { setAccum(elapsed); setStart(null); }}>Pause</button>}
        <button className="btn" disabled={!running} onClick={() => setLaps([...laps, elapsed])}>Lap</button>
        <button className="btn" disabled={elapsed === 0} onClick={() => { setStart(null); setAccum(0); setLaps([]); }}>Reset</button>
      </div>
      {laps.length > 0 && (
        <table className="mono" style={{ width: '100%', marginTop: 12, fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr><th>Lap</th><th>Split</th><th>Total</th></tr></thead>
          <tbody>{[...laps].reverse().map((l, i) => {
            const idx = laps.length - 1 - i;
            const split = l - (idx ? laps[idx - 1] : 0);
            return <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}><td>#{idx + 1}</td><td>{fmtMs(split, true)}</td><td>{fmtMs(l, true)}</td></tr>;
          })}</tbody>
        </table>
      )}
      {running && <p className="faint" style={{ fontSize: 12 }}>Current split: {fmtMs(lapValue, true)}</p>}
    </div>
  );
}

// ── Countdown timers (multiple, independent) ────────────────────────────────
let nextId = 1;
function TimerCard({ timer, onChange, onRemove }) {
  // timer: {id, label, durationMs, endAt|null, pausedRemaining}
  const running = timer.endAt != null;
  useRafTick(running);
  const remaining = running ? Math.max(0, timer.endAt - Date.now()) : timer.pausedRemaining;
  const done = running && remaining <= 0;
  useEffect(() => { if (done && !timer.fired) { onChange({ ...timer, fired: true }); tryBeep(); } }, [done]);
  const start = () => onChange({ ...timer, endAt: Date.now() + timer.pausedRemaining, fired: false });
  const pause = () => onChange({ ...timer, endAt: null, pausedRemaining: Math.max(0, timer.endAt - Date.now()) });
  const reset = () => onChange({ ...timer, endAt: null, pausedRemaining: timer.durationMs, fired: false });
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <strong>{timer.label}</strong>
      <div className={`big-time ${done ? '' : ''}`} role="timer" aria-live="polite" style={{ color: done ? 'var(--ok)' : undefined }}>
        {done ? "Time's up!" : fmtMs(remaining)}
      </div>
      <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
        {!running ? <button className="btn primary small" onClick={start}>Start</button> : <button className="btn small" onClick={pause}>Pause</button>}
        <button className="btn small" onClick={reset}>Reset</button>
        <button className="btn small" onClick={onRemove} aria-label={`Remove timer ${timer.label}`}>✕</button>
      </div>
      <div className="faint" style={{ fontSize: 12 }}>{Math.round(remaining / 1000)} s remaining of {Math.round(timer.durationMs / 1000)} s</div>
    </div>
  );
}

function TimersSection() {
  const [timers, setTimers] = useState([{ id: nextId++, label: 'Timer 1', durationMs: 5 * 60000, pausedRemaining: 5 * 60000, endAt: null, fired: false }]);
  const [mins, setMins] = useState(5);
  const [label, setLabel] = useState('');
  const PRESETS = [[1, '1 min'], [5, '5 min'], [10, '10 min'], [25, 'Pomodoro 25'], [45, '45 min'], [60, '1 hour']];
  const add = (m) => {
    const dur = Math.max(1, Math.round(Number(m) * 60000));
    setTimers(t => [...t, { id: nextId++, label: label.trim() || `Timer ${t.length + 1}`, durationMs: dur, pausedRemaining: dur, endAt: null, fired: false }]);
    setLabel('');
  };
  return (
    <div className="card">
      <h3 className="mt0">Countdown timers</h3>
      <div className="row">
        <Field label="Minutes"><input type="number" min="0.1" step="0.1" value={mins} onChange={e => setMins(e.target.value)} /></Field>
        <Field label="Label (optional)"><input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="Stretch break" /></Field>
        <button className="btn primary" style={{ marginBottom: 12 }} onClick={() => add(mins)}>Add timer</button>
      </div>
      <div className="row">{PRESETS.map(([m, l]) => <button key={l} className="btn small" onClick={() => add(m)}>{l}</button>)}</div>
      <div className="grid g3" style={{ marginTop: 14 }}>
        {timers.map(t => (
          <TimerCard key={t.id} timer={t}
            onChange={nt => setTimers(ts => ts.map(x => x.id === t.id ? nt : x))}
            onRemove={() => setTimers(ts => ts.filter(x => x.id !== t.id))} />
        ))}
      </div>
      <p className="faint" style={{ fontSize: 12 }}>Timers are anchored to real clock time — a suspended or throttled tab stays accurate and fires as soon as it resumes.</p>
    </div>
  );
}

function tryBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    o.start(); o.stop(ctx.currentTime + 0.9);
  } catch { /* user gesture may be required */ }
}

// ── Pomodoro ─────────────────────────────────────────────────────────────────
function Pomodoro() {
  const [cfg, setCfg] = useState({ work: 25, short: 5, long: 15, every: 4 });
  const [phase, setPhase] = useState('work');
  const [endAt, setEndAt] = useState(null);
  const [remaining, setRemaining] = useState(cfg.work * 60000);
  const [cycles, setCycles] = useState(0);
  const running = endAt != null;
  useRafTick(running);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const r = endAt - Date.now();
      if (r <= 0) {
        const nextPhase = phase === 'work' ? 'break' : 'work';
        const c = phase === 'work' ? cycles + 1 : cycles;
        setCycles(c);
        const np = nextPhase === 'break' && c % cfg.every === 0 ? 'long' : nextPhase;
        setPhase(np);
        setEndAt(null);
        setRemaining((np === 'long' ? cfg.long : np === 'break' ? cfg.short : cfg.work) * 60000);
        tryBeep();
      } else setRemaining(r);
    }, 250);
    return () => clearInterval(id);
  }, [running, endAt, phase, cycles, cfg]);
  const dur = phase === 'work' ? cfg.work : phase === 'long' ? cfg.long : cfg.short;
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <h3 className="mt0">Pomodoro</h3>
      <span className={'pill ' + (phase === 'work' ? 'accent' : 'ok')}>{phase === 'work' ? '🍅 Focus' : phase === 'long' ? '☕ Long break' : '☕ Break'}</span>
      <div className="big-time" role="timer">{fmtMs(Math.max(0, running ? endAt - Date.now() : remaining))}</div>
      <div className="faint" style={{ fontSize: 12 }}>{Math.round((1 - Math.max(0, running ? endAt - Date.now() : remaining) / (dur * 60000)) * 100)}% · completed focus sessions: {cycles}</div>
      <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
        {!running ? <button className="btn primary" onClick={() => setEndAt(Date.now() + remaining)}>Start</button>
          : <button className="btn" onClick={() => { setRemaining(Math.max(0, endAt - Date.now())); setEndAt(null); }}>Pause</button>}
        <button className="btn" onClick={() => { setEndAt(null); setRemaining(dur * 60000); }}>Reset</button>
        <button className="btn" onClick={() => { setEndAt(null); setPhase(phase === 'work' ? 'break' : 'work'); setRemaining((phase === 'work' ? cfg.short : cfg.work) * 60000); }}>Skip</button>
      </div>
      <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
        <Field label="Focus (min)"><input type="number" min="1" style={{ width: 70 }} value={cfg.work} onChange={e => setCfg(c => ({ ...c, work: +e.target.value || 25 }))} /></Field>
        <Field label="Break (min)"><input type="number" min="1" style={{ width: 70 }} value={cfg.short} onChange={e => setCfg(c => ({ ...c, short: +e.target.value || 5 }))} /></Field>
        <Field label="Long break (min)"><input type="number" min="1" style={{ width: 70 }} value={cfg.long} onChange={e => setCfg(c => ({ ...c, long: +e.target.value || 15 }))} /></Field>
        <Field label="Every N"><input type="number" min="2" style={{ width: 70 }} value={cfg.every} onChange={e => setCfg(c => ({ ...c, every: +e.target.value || 4 }))} /></Field>
      </div>
    </div>
  );
}

// ── Interval timer (HIIT rounds) ─────────────────────────────────────────────
function IntervalTimer() {
  const [sets, setSets] = useState(3);
  const [workS, setWorkS] = useState(40);
  const [restS, setRestS] = useState(20);
  const [state, setState] = useState({ running: false, idx: 0, endAt: null, done: false });
  useRafTick(state.running && !state.done);
  const totalSteps = sets * 2;
  const isWork = state.idx % 2 === 0;
  useEffect(() => {
    if (!state.running || state.done) return;
    const id = setInterval(() => {
      if (state.endAt - Date.now() <= 0) {
        tryBeep();
        const ni = state.idx + 1;
        if (ni >= totalSteps) { setState(s => ({ ...s, done: true, running: false })); }
        else setState(s => ({ ...s, idx: ni, endAt: Date.now() + (ni % 2 === 0 ? workS : restS) * 1000 }));
      }
    }, 200);
    return () => clearInterval(id);
  }, [state, totalSteps, workS, restS]);
  const remaining = state.done ? 0 : Math.max(0, state.endAt ? state.endAt - Date.now() : (isWork ? workS : restS) * 1000);
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <h3 className="mt0">Interval timer (HIIT)</h3>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Field label="Sets"><input type="number" min="1" style={{ width: 70 }} value={sets} onChange={e => setSets(+e.target.value || 1)} disabled={state.running} /></Field>
        <Field label="Work (s)"><input type="number" min="1" style={{ width: 70 }} value={workS} onChange={e => setWorkS(+e.target.value || 1)} disabled={state.running} /></Field>
        <Field label="Rest (s)"><input type="number" min="1" style={{ width: 70 }} value={restS} onChange={e => setRestS(+e.target.value || 1)} disabled={state.running} /></Field>
      </div>
      <div className="big-time" role="timer">{state.done ? 'Done 💪' : fmtMs(remaining)}</div>
      <div className="faint">{state.running ? `${isWork ? 'Work' : 'Rest'} — set ${Math.floor(state.idx / 2) + 1}/${sets}` : `Total ${(sets * (workS + restS))} s`}</div>
      <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
        {!state.running ? <button className="btn primary" onClick={() => setState({ running: true, idx: 0, endAt: Date.now() + workS * 1000, done: false })}>{state.done ? 'Restart' : 'Start'}</button>
          : <button className="btn" onClick={() => setState(s => ({ ...s, running: false }))}>Pause</button>}
        <button className="btn" onClick={() => setState({ running: false, idx: 0, endAt: null, done: false })}>Reset</button>
      </div>
    </div>
  );
}

// ── Alarms (honest about browser limits) ─────────────────────────────────────
function Alarms() {
  const [alarms, setAlarms] = useState([]);
  const [time, setTime] = useState('07:30');
  const [label, setLabel] = useState('');
  const [notif, setNotif] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const ref = useRef();
  useEffect(() => {
    ref.current = setInterval(() => {
      const nowD = new Date();
      const hhmm = `${pad(nowD.getHours())}:${pad(nowD.getMinutes())}`;
      setAlarms(a => a.map(al => {
        if (al.on && !al.fired && al.time === hhmm && nowD.getSeconds() < 30) {
          tryBeep();
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try { new Notification('Stive alarm', { body: al.label || 'Alarm' }); } catch { /* ignore */ }
          }
          return { ...al, fired: true };
        }
        return al;
      }));
    }, 10000);
    return () => clearInterval(ref.current);
  }, []);
  return (
    <div className="card">
      <h3 className="mt0">Local alarms</h3>
      <Notice kind="warn">Alarms only fire while this tab is open. Browsers throttle background tabs, so keep the page open for reliable alarms — we do not promise delivery you can’t control.</Notice>
      <div className="row" style={{ marginTop: 10 }}>
        <Field label="Time (24h)"><input type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
        <Field label="Label"><input type="text" value={label} onChange={e => setLabel(e.target.value)} /></Field>
        <button className="btn primary" style={{ marginBottom: 12 }} onClick={() => { setAlarms(a => [...a, { id: Date.now(), time, label: label.trim(), on: true, fired: false }]); setLabel(''); }}>Add alarm</button>
        {notif === 'default' && typeof Notification !== 'undefined' && (
          <button className="btn" onClick={() => Notification.requestPermission().then(setNotif)}>Enable notifications</button>
        )}
      </div>
      {alarms.length === 0 ? <p className="dim">No alarms yet.</p> : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {alarms.map(a => (
            <li key={a.id} className="row spread" style={{ borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
              <span><span className="mono" style={{ fontSize: 16 }}>{a.time}</span> {a.label} {a.fired && <span className="pill ok">rang</span>}</span>
              <span className="row">
                <button className="btn small" onClick={() => setAlarms(xs => xs.map(x => x.id === a.id ? { ...x, on: !x.on, fired: false } : x))}>{a.on ? 'Disable' : 'Enable'}</button>
                <button className="btn small" onClick={() => setAlarms(xs => xs.filter(x => x.id !== a.id))}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Event countdowns (persisted, shared with Home/Widgets) ──────────────────
function EventCountdowns() {
  const [list, setList] = useState(loadCountdowns());
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState(`${new Date(Date.now() + 86400000).toISOString().slice(0, 16)}`);
  useRafTick(list.length > 0);
  return (
    <div className="card">
      <h3 className="mt0">Event countdowns</h3>
      <div className="row">
        <Field label="Event"><input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="Product launch" /></Field>
        <Field label="Target (local)"><input type="datetime-local" value={target} onChange={e => setTarget(e.target.value)} /></Field>
        <button className="btn primary" style={{ marginBottom: 12 }} disabled={!label.trim()} onClick={() => { setList(addCountdown({ label: label.trim(), targetMs: new Date(target).getTime() })); setLabel(''); }}>Add</button>
      </div>
      {list.length === 0 ? <p className="dim">Saved countdowns appear here and on the Home dashboard.</p> : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {list.map(c => {
            const p = countdownParts(c.targetMs);
            return (
              <li key={c.id} className="row spread" style={{ borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
                <span>{c.label}</span>
                <span className="mono">{p.past ? 'passed' : `${p.days}d ${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}`}</span>
                <button className="btn small" onClick={() => setList(removeCountdown(c.id))}>✕</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function Timers() {
  useSeoTitle('Timers & Productivity — Stive Timezone');
  return (
    <div>
      <h1 className="mt0">Timers &amp; Productivity</h1>
      <p className="subtitle">All timing uses real-clock anchors (Date.now()), so stopwatch, timers and Pomodoro stay exact even when the tab is throttled or suspended.</p>
      <div className="grid g2">
        <Stopwatch />
        <Pomodoro />
      </div>
      <div style={{ marginTop: 14 }}><TimersSection /></div>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <IntervalTimer />
        <Alarms />
      </div>
      <div style={{ marginTop: 14 }}><EventCountdowns /></div>
    </div>
  );
}
