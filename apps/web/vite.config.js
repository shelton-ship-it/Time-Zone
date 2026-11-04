import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// WeatherAPI key lives ONLY server-side (process.env, never VITE_*).
export default defineConfig({
  plugins: [react(), weatherProxy()],
  server: { port: 5173 },
  build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
  test: { environment: 'jsdom', globals: true, setupFiles: ['tests/setup.js'] },
});

function weatherProxy() {
  return {
    name: 'stive-weather-proxy',
    configureServer(server) {
      server.middlewares.use(process.env.API_WEATHER_PATH || '/api/weather/current', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const key = process.env.WEATHERAPI_KEY; // server-side secret — not bundled
        if (!key) { res.end(JSON.stringify({ __proxy: 'no-key', error: 'WEATHERAPI_KEY is not configured on the server. Falling back to MET Norway.' })); return; }
        try {
          const url = new URL(req.url, 'http://localhost');
          const q = url.searchParams.get('q') || '';
          const days = Math.min(7, Number(url.searchParams.get('days')) || 7);
          const r = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&days=${days}&aqi=no&alerts=no`, { signal: AbortSignal.timeout(12000) });
          if (!r.ok) { res.end(JSON.stringify({ __proxy: 'upstream-error', status: r.status, error: `WeatherAPI HTTP ${r.status}` })); return; }
          const j = await r.json();
          res.end(JSON.stringify({ __proxy: 'ok', data: j }));
        } catch (e) {
          res.end(JSON.stringify({ __proxy: 'error', error: String(e.message || e) }));
        }
      });
    },
  };
}
