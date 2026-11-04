// System info for the widgets and the Home panel's app launcher.
const os = require('os');
const fs = require('fs');
const path = require('path');

let lastCpu = os.cpus();
function cpuPercent() {
  const now = os.cpus();
  let idle = 0, total = 0;
  now.forEach((c, i) => {
    const p = lastCpu[i] || c;
    for (const k of Object.keys(c.times)) total += c.times[k] - p.times[k];
    idle += c.times.idle - p.times.idle;
  });
  lastCpu = now;
  return total > 0 ? Math.round(100 * (1 - idle / total)) : 0;
}

function stats() {
  const mem = 1 - os.freemem() / os.totalmem();
  return { cpu: cpuPercent(), mem: Math.round(mem * 100), uptime: os.uptime() };
}

// Start-menu shortcuts are the most reliable list of installed apps on Windows.
function startMenuDirs() {
  if (process.platform !== 'win32') return [];
  return [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ];
}
const SKIP = /^(uninstall|readme|help|license|website|documentation|release notes)|uninstall/i;
function listApps() {
  const seen = new Map();
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (/\.(lnk|url)$/i.test(e.name)) {
        const name = e.name.replace(/\.(lnk|url)$/i, '');
        if (!SKIP.test(name) && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), { name, path: p });
      }
    }
  };
  for (const d of startMenuDirs()) walk(d, 0);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Open-Meteo: free weather API, no key. City name -> coordinates -> current weather.
const WEATHER_CODES = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle',
  61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
const weatherCache = new Map();
async function weather(city) {
  if (!city) return null;
  const hit = weatherCache.get(city);
  if (hit && Date.now() - hit.t < 15 * 60e3) return hit.v;
  const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`)).json();
  const place = g.results?.[0];
  if (!place) throw new Error(`couldn't find “${city}”`);
  const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&timezone=auto`)).json();
  const v = { place: place.name, temp: Math.round(w.current.temperature_2m), unit: w.current_units?.temperature_2m || '°C', text: WEATHER_CODES[w.current.weather_code] || '' };
  weatherCache.set(city, { t: Date.now(), v });
  return v;
}

module.exports = { stats, listApps, weather };
