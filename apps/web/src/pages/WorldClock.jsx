import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePrefs, setPrefs, addRecent } from '../lib/prefs.js';
import { useNow } from '../lib/useNow.js';
import { CitySearch, useSeoTitle, EmptyState } from '../components/ui.jsx';
import CityClockCard from '../components/CityClockCard.jsx';
import { POPULAR, CITIES } from '../lib/cities.js';
import { userZone } from '../lib/tz.js';

export default function WorldClock() {
  useSeoTitle('World Clock — Stive Timezone');
  const [prefs, update] = usePrefs();
  const now = useNow();
  const [sort, setSort] = useState('manual');
  const ref = prefs.referenceCity || { tz: userZone(), city: 'Your time' };

  const clocks = (() => {
    let list = [...prefs.favorites];
    if (sort === 'offset') list.sort((a, b) => offsetOf(a.tz, now) - offsetOf(b.tz, now));
    if (sort === 'name') list.sort((a, b) => a.city.localeCompare(b.city));
    return list;
  })();

  function add(city) {
    if (prefs.favorites.some(f => f.tz === city.tz && f.city === city.city)) return;
    update({ favorites: [...prefs.favorites, city] });
    addRecent(city);
  }
  function remove(city) {
    update({ favorites: prefs.favorites.filter(f => !(f.tz === city.tz && f.city === city.city)) });
  }
  function move(i, dir) {
    const list = [...prefs.favorites];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    update({ favorites: list });
  }
  function setReference(city) { update({ referenceCity: city }); }

  return (
    <div>
      <div className="topbar">
        <div><h1 className="mb0">World Clock</h1><p className="subtitle mb0">Real-time clocks with DST, offsets and weather. Reference: <strong>{ref.city}</strong> ({ref.tz})</p></div>
        <div className="row">
          <label className="mb0" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Sort
            <select value={sort} onChange={e => setSort(e.target.value)}>
              <option value="manual">Manual</option><option value="offset">By UTC offset</option><option value="name">By name</option>
            </select>
          </label>
        </div>
      </div>

      <div className="card row" style={{ marginBottom: 14 }}>
        <CitySearch onSelect={add} placeholder="Add a city to your clocks…" />
      </div>

      {clocks.length === 0 ? (
        <EmptyState title="No clocks yet">Add cities above, or start with popular picks:</EmptyState>
      ) : (
        <div className="grid g3">
          {clocks.map((c, i) => (
            <div key={c.tz + c.city}>
              <CityClockCard city={c} now={now} refTz={ref.tz} hour12={prefs.hour12} onRemove={remove} />
              {sort === 'manual' && <div className="row" style={{ marginTop: 6 }}>
                <button className="btn small" aria-label={`Move ${c.city} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="btn small" aria-label={`Move ${c.city} later`} disabled={i === clocks.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="btn small" onClick={() => setReference(c)} aria-pressed={ref.tz === c.tz && ref.city === c.city}>Set as reference</button>
              </div>}
            </div>
          ))}
        </div>
      )}

      {prefs.recents.length > 0 && <>
        <h2>Recently accessed</h2>
        <div className="row">{prefs.recents.map(c => <button key={c.tz + c.city} className="btn small" onClick={() => add(c)}>+ {c.city}</button>)}</div>
      </>}

      <h2>Popular cities</h2>
      <div className="row">{CITIES.filter(c => c.pop > 5e6).slice(0, 14).map(c =>
        <button key={c.tz + c.city} className="btn small" onClick={() => add(c)}>{c.city}</button>)}</div>
    </div>
  );
}
import { offsetMinAt } from '../lib/tz.js';
const offsetOf = (tz, now) => offsetMinAt(tz, now);
