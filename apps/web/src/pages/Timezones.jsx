import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoTitle, Field, Notice, EmptyState } from '../components/ui.jsx';
import { CITIES, ZONES, searchCities, citySlug } from '../lib/cities.js';
import { offsetMinAt, offsetString, isDST, shortAbbr, nextDstTransitions, userZone, isValidZone } from '../lib/tz.js';

export default function Timezones() {
  useSeoTitle('Timezone Explorer — Stive Timezone');
  const now = Date.now();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('offset');
  const [country, setCountry] = useState('');

  const countries = useMemo(() => [...new Set(CITIES.map(c => c.country))].sort(), []);
  const rows = useMemo(() => {
    let list = q.trim().length >= 2 ? searchCities(q, 200) : CITIES;
    if (country) list = list.filter(c => c.country === country);
    return [...list].sort((a, b) => sort === 'offset'
      ? offsetMinAt(a.tz, now) - offsetMinAt(b.tz, now)
      : a.city.localeCompare(b.city));
  }, [q, sort, country, now]);

  const dstNow = rows.filter(r => isDST(r.tz, now)).length;

  // DST calendar: upcoming transitions grouped by month for the next 6 months
  const dstCalendar = useMemo(() => {
    const byMonth = new Map();
    for (const tz of ZONES) {
      for (const t of nextDstTransitions(tz, now, 2)) {
        const key = new Date(t.atUtcMs).toISOString().slice(0, 7);
        if (!byMonth.has(key)) byMonth.set(key, []);
        if (byMonth.get(key).length < 40) byMonth.get(key).push({ tz, ...t });
      }
    }
    return [...byMonth.entries()].sort().slice(0, 6);
  }, [now]);

  return (
    <div>
      <h1 className="mt0">Timezone Explorer</h1>
      <p className="subtitle">IANA identifiers are authoritative — abbreviations like “CST” are ambiguous and shown only as labels.</p>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row">
          <Field label="Search"><input value={q} onChange={e => setQ(e.target.value)} placeholder="City, country or zone id…" /></Field>
          <Field label="Country"><select value={country} onChange={e => setCountry(e.target.value)}><option value="">All countries ({countries.length})</option>{countries.map(c => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Sort"><select value={sort} onChange={e => setSort(e.target.value)}><option value="offset">By UTC offset</option><option value="city">By city name</option></select></Field>
          <span className="pill">{rows.length} locations</span>
          <span className="pill warn">{dstNow} currently on DST</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, marginTop: 10 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-faint)' }}>
              <th>City</th><th>Country</th><th>IANA zone</th><th>Offset now</th><th>Abbrev</th><th>DST</th><th>Next transition</th><th></th>
            </tr></thead>
            <tbody>
              {rows.slice(0, 120).map(c => {
                const off = offsetMinAt(c.tz, now);
                const dst = isDST(c.tz, now);
                const next = nextDstTransitions(c.tz, now, 1)[0];
                return (
                  <tr key={c.tz + c.city} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td><Link to={`/timezone/${citySlug(c)}`}><strong>{c.city}</strong></Link></td>
                    <td className="dim">{c.country}</td>
                    <td className="mono">{c.tz}</td>
                    <td className="mono">UTC{offsetString(off)}</td>
                    <td>{shortAbbr(c.tz, now)}</td>
                    <td>{dst ? <span className="pill warn">active</span> : <span className="pill ok">standard</span>}</td>
                    <td className="dim" style={{ fontSize: 12 }}>{next ? `${new Date(next.atUtcMs).toISOString().replace('T', ' ').slice(0, 16)}Z ${next.from}→${next.to}` : 'none'}</td>
                    <td><Link className="btn small" to={`/converter?from=${encodeURIComponent(c.tz)}`}>Convert</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 120 && <p className="faint" style={{ fontSize: 12 }}>Showing first 120 of {rows.length} — refine your search.</p>}
          {rows.length === 0 && <EmptyState title="No matches">Try a different city, country or zone identifier.</EmptyState>}
        </div>
      </div>

        <h2>DST calendar (next months)</h2>
        <div className="grid g2">
          {dstCalendar.map(([month, list]) => (
            <div key={month} className="card">
              <h3 className="mt0 mb0">{new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3>
              <ul className="mono" style={{ fontSize: 13, paddingLeft: 18, margin: '8px 0 0' }}>
                {list.slice(0, 12).map(t => (
                  <li key={t.tz}>{new Date(t.atUtcMs).toISOString().replace('T', ' ').slice(0, 16)} UTC — <strong>{t.tz}</strong> clocks {t.direction === 'forward' ? 'forward 🔺' : 'back 🔻'} ({t.from} → {t.to})</li>
                ))}
                {list.length > 12 && <li className="dim">+{list.length - 12} more zones</li>}
              </ul>
            </div>
          ))}
        </div>

      <h2>Understanding abbreviations</h2>
      <div className="card">
        <Notice kind="info">Abbreviations such as CST map to America/Chicago, America/Havana, Asia/Shanghai and Australia/Sydney alike. Always store and transmit IANA zone IDs (e.g. <span className="mono">Africa/Maputo</span>) — this app uses <span className="mono">{userZone()}</span> as your device zone.</Notice>
      </div>
    </div>
  );
}
