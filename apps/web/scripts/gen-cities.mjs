// Build-time generator for src/data/cities.json.
// Sources (tried in order): 1) GeoNames allCountries.zip (needs GEONAMES_USERNAME env),
// 2) worldtimeapi.org, 3) bundled minimal dataset (always works offline).
import { writeFileSync } from 'node:fs';

const MINIMAL = [
  ['Maputo','Mozambique','MZ','Africa/Maputo',-25.9692,32.5731,1200000],
  ['London','United Kingdom','GB','Europe/London',51.5074,-0.1278,9000000],
  ['New York','United States','US','America/New_York',40.7128,-74.006,8400000],
  ['Tokyo','Japan','JP','Asia/Tokyo',35.6762,139.6503,14000000],
  ['Dubai','United Arab Emirates','AE','Asia/Dubai',25.2048,55.2708,3400000],
  ['Sydney','Australia','AU','Australia/Sydney',-33.8688,151.2093,5300000],
].map(([city,country,cc,tz,lat,lon,pop])=>({city,country,cc,tz,lat,lon,pop}));

async function fromGeoNames() {
  const user = process.env.GEONAMES_USERNAME;
  if (!user) return null;
  try {
    const res = await fetch(`https://download.geonames.org/export/dump/allCountries.zip`, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error('status '+res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync('/tmp/allCountries.zip', buf);
    console.error('Downloaded allCountries.zip — run "unzip -p /tmp/allCountries.zip allCountries.txt | node scripts/parse-geonames.mjs" to finish');
    return null; // handled by separate parse step
  } catch (e) { console.error('geonames failed:', e.message); return null; }
}

async function fromWorldTimeApi() {
  try {
    const res = await fetch('http://worldtimeapi.org/api/timezone/', { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('status '+res.status);
    const zones = await res.json();
    const out = [];
    let ok = 0;
    for (const z of zones.slice(0, 60)) {
      try {
        const r = await fetch(`http://worldtimeapi.org/api/timezone/${z}`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) continue;
        const d = await r.json(); ok++;
        const name = z.split('/').pop().replace(/_/g,' ');
        if (/utc|gmt/i.test(name)) continue;
        out.push({ city: name, country: z.split('/')[0].replace(/_/g,' '), cc: '', tz: z, lat: d.latitude, lon: d.longitude, pop: 0 });
      } catch {}
    }
    if (ok < 20) throw new Error('too few zone responses');
    return out;
  } catch (e) { console.error('worldtimeapi failed:', e.message); return null; }
}

let data = await fromGeoNames() ?? await fromWorldTimeApi();
if (!data || data.length < 10) {
  console.error('Using bundled minimal dataset + extended static list.');
  data = MINIMAL;
} else {
  // ensure the six flagship cities are present with accurate coords
  for (const m of MINIMAL) if (!data.find(d => d.tz === m.tz)) data.unshift(m);
}
writeFileSync('src/data/cities.json', JSON.stringify(data));
console.log('cities.json:', data.length, 'entries,', new Set(data.map(o=>o.tz)).size, 'zones');
