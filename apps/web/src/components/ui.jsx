import React, { useEffect, useRef, useState } from 'react';
import { searchCities } from '../lib/cities.js';

export function useSeoTitle(title) {
  useEffect(() => { document.title = title; }, [title]);
}

export function CitySearch({ onSelect, placeholder = 'Search cities, countries or timezones…', autoFocus = false }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const results = q.trim().length >= 2 ? searchCities(q, 10) : [];
  const boxRef = useRef();
  useEffect(() => {
    const h = e => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const pick = c => { setQ(''); setOpen(false); onSelect(c); };
  return (
    <div className={`searchbox ${autoFocus ? '' : ''}`} ref={boxRef} style={{ flex: 1, minWidth: 220 }}>
      <input type="text" role="combobox" aria-expanded={open} aria-controls="city-search-list" aria-label="Search cities"
        style={{ width: '100%' }} placeholder={placeholder} value={q} autoFocus={autoFocus}
        onChange={e => { setQ(e.target.value); setOpen(true); setIdx(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter' && results[idx]) { e.preventDefault(); pick(results[idx]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {open && results.length > 0 && (
        <div className="search-results" id="city-search-list" role="listbox">
          {results.map((c, i) => (
            <button key={c.tz + c.city} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => pick(c)}>
              <strong>{c.city}</strong><span className="dim"> — {c.country}</span>
              <div className="faint mono" style={{ fontSize: 11 }}>{c.tz}</div>
            </button>
          ))}
        </div>
      )}
      {open && q.trim().length >= 2 && results.length === 0 && (
        <div className="search-results"><div style={{ padding: 12 }} className="dim">No matches for “{q}”.</div></div>
      )}
    </div>
  );
}

export function CopyBtn({ text, label = 'Copy', small = true }) {
  const [done, setDone] = useState(false);
  return <button className={`btn ${small ? 'small' : ''}`} onClick={async () => {
    const { copyText } = await import('../lib/share.js');
    if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1500); }
  }}>{done ? 'Copied ✓' : label}</button>;
}

export function Field({ label, children, hint }) {
  return <div className="field"><label>{label}</label>{children}{hint && <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{hint}</div>}</div>;
}

export function Skeleton({ w = '100%', h = 14 }) {
  return <div className="skeleton" style={{ width: w, height: h }} aria-hidden="true" />;
}

export function Notice({ kind = 'info', children }) {
  return <div className={`notice ${kind}`} role={kind === 'err' ? 'alert' : 'status'}>{children}</div>;
}

export function EmptyState({ title, children }) {
  return <div className="card" style={{ textAlign: 'center', padding: 30 }}>
    <h3 className="mt0">{title}</h3><div className="dim">{children}</div>
  </div>;
}

/** Format an instant in tz honoring hour12 pref. */
export function fmtTime(instant, tz, hour12) {
  return new Intl.DateTimeFormat(hour12 ? 'en-US' : 'en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12 }).format(new Date(instant));
}
export function fmtDate(instant, tz) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(instant));
}
export function fmtShortDate(instant, tz) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(instant));
}
