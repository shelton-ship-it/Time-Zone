import React, { Suspense, lazy } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { usePrefs, effectiveTheme, setPrefs } from './lib/prefs.js';
import Home from './pages/Home.jsx';

const WorldClock = lazy(() => import('./pages/WorldClock.jsx'));
const Converter = lazy(() => import('./pages/Converter.jsx'));
const MeetingPlanner = lazy(() => import('./pages/MeetingPlanner.jsx'));
const WeatherPage = lazy(() => import('./pages/WeatherPage.jsx'));
const Calculators = lazy(() => import('./pages/Calculators.jsx'));
const Timers = lazy(() => import('./pages/Timers.jsx'));
const Developer = lazy(() => import('./pages/Developer.jsx'));
const Timezones = lazy(() => import('./pages/Timezones.jsx'));
const WorldMap = lazy(() => import('./pages/WorldMap.jsx'));
const Travel = lazy(() => import('./pages/Travel.jsx'));
const Astronomy = lazy(() => import('./pages/Astronomy.jsx'));
const Widgets = lazy(() => import('./pages/Widgets.jsx'));
const ApiDocs = lazy(() => import('./pages/ApiDocs.jsx'));
const CityPage = lazy(() => import('./pages/CityPage.jsx'));
const WidgetEmbed = lazy(() => import('./embed/WidgetEmbed.jsx'));

const NAV = [
  ['Core', [['/', 'Home', '🏠'], ['/world-clock', 'World Clock', '🕒'], ['/converter', 'Timezone Converter', '⇄'], ['/meeting-planner', 'Meeting Planner', '🤝']]],
  ['Environment', [['/weather', 'Weather', '⛅'], ['/astronomy', 'Astronomy', '🌙'], ['/world-map', 'World Map', '🗺️'], ['/timezones', 'Timezone Explorer', '🌐']]],
  ['Tools', [['/calculators', 'Calculators', '🧮'], ['/timers', 'Timers & Productivity', '⏱️'], ['/travel', 'Travel Planner', '✈️'], ['/developer', 'Developer Tools', '</>']]],
  ['Integrate', [['/widgets', 'Widgets', '🧩'], ['/api', 'API & Docs', '📚']]],
];

export default function App() {
  const [prefs, update] = usePrefs();
  const theme = effectiveTheme(prefs.theme);
  React.useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const location = useLocation();
  const embedMode = location.pathname.startsWith('/embed');

  if (embedMode) {
    return <Suspense fallback={null}><Routes>
      <Route path="/embed/clock" element={<WidgetEmbed />} />
    </Routes></Suspense>;
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <nav className="sidebar" aria-label="Primary">
        <div className="brand"><span className="logo">◷</span> Stive Timezone</div>
        {NAV.map(([group, items]) => (
          <React.Fragment key={group}>
            <div className="nav-group">{group}</div>
            {items.map(([to, label, icon]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
                <span aria-hidden="true">{icon}</span>{label}
              </NavLink>
            ))}
          </React.Fragment>
        ))}
        <div className="nav-group">Preferences</div>
        <div style={{ padding: '4px 10px', display: 'grid', gap: 8 }}>
          <button className="btn small" onClick={() => update({ theme: theme === 'dark' ? 'light' : 'dark' })} aria-pressed={theme === 'dark'}>
            {theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}
          </button>
          <button className="btn small" onClick={() => update({ hour12: !prefs.hour12 })} aria-pressed={prefs.hour12}>
            {prefs.hour12 ? '12-hour' : '24-hour'} format
          </button>
        </div>
      </nav>
      <main className="main" id="main">
        <Suspense fallback={<div className="grid g3"><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 120 }} /></div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/world-clock" element={<WorldClock />} />
            <Route path="/converter" element={<Converter />} />
            <Route path="/meeting-planner" element={<MeetingPlanner />} />
            <Route path="/weather" element={<WeatherPage />} />
            <Route path="/calculators" element={<Calculators />} />
            <Route path="/timers" element={<Timers />} />
            <Route path="/developer" element={<Developer />} />
            <Route path="/timezones" element={<Timezones />} />
            <Route path="/world-map" element={<WorldMap />} />
            <Route path="/travel" element={<Travel />} />
            <Route path="/astronomy" element={<Astronomy />} />
            <Route path="/widgets" element={<Widgets />} />
            <Route path="/api" element={<ApiDocs />} />
            <Route path="/timezone/:citySlug" element={<CityPage />} />
            <Route path="*" element={<div className="card"><h2>Page not found</h2><p className="dim">The address doesn’t match any tool. Use the navigation on the left.</p></div>} />
          </Routes>
        </Suspense>
        <footer className="footer">
          Stive Timezone — Global Time, Weather &amp; Planning Platform. IANA timezone data via your browser’s tz database ·
          Weather: WeatherAPI.com (primary) / MET Norway (fallback, attribution per provider) · Sun &amp; moon: SunCalc.
        </footer>
      </main>
    </div>
  );
}
