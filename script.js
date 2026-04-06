/* ═══════════════════════════════════════════════════════════
   AETHER WEATHER DASHBOARD — script.js
   OpenWeatherMap API integration + dynamic UI + Chart.js
════════════════════════════════════════════════════════════ */

// ─── CONFIG ─────────────────────────────────────────────────
const API_KEY  = '1742791734d7d940441731301d45ee24';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const GEO_URL  = 'https://api.openweathermap.org/geo/1.0';

// ─── DOM REFS ────────────────────────────────────────────────
const searchInput   = document.getElementById('searchInput');
const searchBtn     = document.getElementById('searchBtn');
const dashboard     = document.getElementById('dashboard');
const emptyState    = document.getElementById('emptyState');
const skeletonScreen= document.getElementById('skeletonScreen');
const toast         = document.getElementById('toast');
const toastMsg      = document.getElementById('toastMsg');
const currentDate   = document.getElementById('currentDate');

// Data display elements
const cityNameEl    = document.getElementById('cityName');
const countryCodeEl = document.getElementById('countryCode');
const temperatureEl = document.getElementById('temperature');
const feelsLikeEl   = document.getElementById('feelsLike');
const weatherDescEl = document.getElementById('weatherDescription');
const humidityEl    = document.getElementById('humidity');
const humidityBarEl = document.getElementById('humidityBar');
const windSpeedEl   = document.getElementById('windSpeed');
const windDirEl     = document.getElementById('windDir');
const uvIndexEl     = document.getElementById('uvIndex');
const uvLabelEl     = document.getElementById('uvLabel');
const pressureEl    = document.getElementById('pressure');
const pressureIndEl = document.getElementById('pressureIndicator');
const sunriseEl     = document.getElementById('sunrise');
const sunsetEl      = document.getElementById('sunset');
const weatherIconEl = document.getElementById('weatherIconContainer');
const forecastStrip = document.getElementById('forecastStrip');
const hourlyStrip   = document.getElementById('hourlyStrip');

// Chart instances — stored so we can destroy/re-init on re-search
let tempChartInstance     = null;
let humidityChartInstance = null;

// ─── INIT ────────────────────────────────────────────────────
(function init() {
  // Display current date in header
  currentDate.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  // Search on Enter key
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') triggerSearch();
  });

  // Search on button click
  searchBtn.addEventListener('click', triggerSearch);
})();

// ─── TRIGGER SEARCH ──────────────────────────────────────────
function triggerSearch() {
  const city = searchInput.value.trim();
  if (!city) return shakeInput();
  fetchWeather(city);
}

// Shake animation if input empty
function shakeInput() {
  const bar = document.querySelector('.search-bar');
  bar.style.animation = 'none';
  bar.offsetHeight; // reflow
  bar.style.animation = 'shakeX 0.4s ease';
  setTimeout(() => bar.style.animation = '', 400);
}

// ─── SKELETON / LOADING STATE ────────────────────────────────
// Show skeleton while data is loading
function showSkeleton() {
  emptyState.style.display = 'none';
  dashboard.style.display  = 'none';
  skeletonScreen.classList.add('visible');
  // Show spinner in button
  searchBtn.innerHTML = '<span class="spinner"></span>';
  searchBtn.disabled = true;
}

// Hide skeleton when data arrives
function hideSkeleton() {
  skeletonScreen.classList.remove('visible');
  searchBtn.innerHTML = '<span>GO</span>';
  searchBtn.disabled = false;
}

// ─── MAIN FETCH ORCHESTRATOR ─────────────────────────────────
async function fetchWeather(city) {
  showSkeleton();
  try {
    // Step 1: Geocode city name → lat/lon (more reliable than name-based queries)
    const geoRes = await fetch(
      `${GEO_URL}/direct?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`
    );
    const geoData = await geoRes.json();

    if (!geoData.length) {
      hideSkeleton();
      showToast(`"${city}" not found. Try another city name.`);
      return;
    }

    const { lat, lon, name, country } = geoData[0];

    // Step 2: Fetch current weather + 5-day / 3-hour forecast in parallel
    const [currentRes, forecastRes] = await Promise.all([
      fetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`),
      fetch(`${BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`)
    ]);

    if (!currentRes.ok || !forecastRes.ok) throw new Error('API error');

    const current  = await currentRes.json();
    const forecast = await forecastRes.json();

    hideSkeleton();
    renderDashboard(current, forecast, name, country);

  } catch (err) {
    hideSkeleton();
    showToast('Something went wrong. Please try again.');
    console.error(err);
  }
}

// ─── RENDER DASHBOARD ────────────────────────────────────────
function renderDashboard(current, forecast, name, country) {
  // Show the dashboard panel
  dashboard.style.display = 'flex';
  emptyState.style.display = 'none';

  // Apply dynamic theme based on weather condition
  applyWeatherTheme(current.weather[0]);

  // Current weather card
  cityNameEl.textContent    = name;
  countryCodeEl.textContent = country;
  temperatureEl.textContent = Math.round(current.main.temp);
  feelsLikeEl.textContent   = `${Math.round(current.main.feels_like)}°C`;
  weatherDescEl.textContent = current.weather[0].description;
  humidityEl.textContent    = `${current.main.humidity}%`;
  windSpeedEl.textContent   = `${Math.round(current.wind.speed * 3.6)} km/h`;
  windDirEl.textContent     = degreesToDir(current.wind.deg);
  pressureEl.textContent    = `${current.main.pressure} hPa`;
  pressureIndEl.textContent = getPressureLabel(current.main.pressure);
  sunriseEl.textContent     = formatTime(current.sys.sunrise, current.timezone);
  sunsetEl.textContent      = formatTime(current.sys.sunset, current.timezone);

  // Humidity bar (animated fill via CSS transition)
  setTimeout(() => { humidityBarEl.style.width = `${current.main.humidity}%`; }, 100);

  // UV index (OpenWeatherMap free tier doesn't have UV in current weather,
  // so we estimate from cloudiness + time of day as a graceful fallback)
  const uvEst = estimateUV(current.clouds.all, current.weather[0].id);
  uvIndexEl.textContent = uvEst;
  uvLabelEl.textContent = getUVLabel(uvEst);

  // Animated weather icon
  weatherIconEl.innerHTML = buildWeatherIcon(current.weather[0].id);

  // 5-day forecast (one entry per day — pick noon-ish reading)
  renderForecastStrip(forecast.list);

  // Hourly (next 24h = 8 entries at 3h intervals)
  renderHourlyStrip(forecast.list.slice(0, 8));

  // Charts
  renderCharts(forecast.list.slice(0, 8));
}

// ─── WEATHER THEME (dynamic background colours) ──────────────
/*
  Maps OWM condition IDs to colour palettes:
  2xx Thunderstorm → deep violet/storm
  3xx Drizzle      → slate blue
  5xx Rain         → teal/cyan
  6xx Snow         → ice blue/white
  7xx Atmosphere   → warm amber/beige
  800 Clear        → golden amber
  80x Clouds       → muted blue-grey
*/
const THEMES = {
  thunderstorm: { accent:'#c792ea', rgb:'199,146,234', o1:'#2d1050', o2:'#1a0840', o3:'#0f0628' },
  drizzle:      { accent:'#89b4fa', rgb:'137,180,250', o1:'#0d2a4a', o2:'#071830', o3:'#050e1e' },
  rain:         { accent:'#5bc4f5', rgb:'91,196,245',  o1:'#0a2a4a', o2:'#052038', o3:'#031420' },
  snow:         { accent:'#cdd6f4', rgb:'205,214,244', o1:'#1e2a4a', o2:'#1a2040', o3:'#10162a' },
  atmosphere:   { accent:'#fab387', rgb:'250,179,135', o1:'#3a1e0a', o2:'#281404', o3:'#160a02' },
  clear:        { accent:'#f9e2af', rgb:'249,226,175', o1:'#3a2a00', o2:'#28180a', o3:'#1a0e04' },
  clouds:       { accent:'#94a3b8', rgb:'148,163,184', o1:'#1a2030', o2:'#0f1520', o3:'#080e18' },
};

function applyWeatherTheme(weatherObj) {
  const id = weatherObj.id;
  let key = 'clouds';
  if (id >= 200 && id < 300) key = 'thunderstorm';
  else if (id >= 300 && id < 400) key = 'drizzle';
  else if (id >= 500 && id < 600) key = 'rain';
  else if (id >= 600 && id < 700) key = 'snow';
  else if (id >= 700 && id < 800) key = 'atmosphere';
  else if (id === 800) key = 'clear';

  const t = THEMES[key];
  const root = document.documentElement;
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent-rgb', t.rgb);
  root.style.setProperty('--accent-dim', `rgba(${t.rgb},0.15)`);
  root.style.setProperty('--orb1', t.o1);
  root.style.setProperty('--orb2', t.o2);
  root.style.setProperty('--orb3', t.o3);
}

// ─── ANIMATED SVG WEATHER ICONS ──────────────────────────────
// Pure SVG/CSS animations — no external icon library needed
function buildWeatherIcon(id) {
  if (id === 800) return iconSun();
  if (id >= 801 && id <= 803) return iconPartlyCloudy();
  if (id === 804) return iconCloud();
  if (id >= 200 && id < 300) return iconStorm();
  if ((id >= 300 && id < 400) || (id >= 500 && id < 600)) return iconRain();
  if (id >= 600 && id < 700) return iconSnow();
  if (id >= 700 && id < 800) return iconMist();
  return iconCloud();
}

function iconSun() {
  return `<svg class="icon-sun" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" width="120" height="120">
    <g class="sun-rays" transform-origin="60 60">
      ${Array.from({length:8},(_,i)=>{
        const a = i*45, r=`rotate(${a},60,60)`;
        return `<line x1="60" y1="8" x2="60" y2="22" stroke="#f9e2af" stroke-width="3.5" stroke-linecap="round" transform="${r}" opacity="0.8"/>`;
      }).join('')}
    </g>
    <circle class="sun-core" cx="60" cy="60" r="26" fill="#f9e2af" opacity="0.95"/>
    <circle cx="60" cy="60" r="22" fill="#ffd060"/>
  </svg>`;
}

function iconPartlyCloudy() {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" width="120" height="120">
    <g transform="translate(-10,0)">
      ${Array.from({length:6},(_,i)=>{
        const a=i*60, r=`rotate(${a},44,44)`;
        return `<line x1="44" y1="12" x2="44" y2="22" stroke="#f9e2af" stroke-width="3" stroke-linecap="round" transform="${r}" opacity="0.7"/>`;
      }).join('')}
      <circle cx="44" cy="44" r="18" fill="#ffd060" opacity="0.9"/>
    </g>
    <g class="cloud-body">
      <ellipse cx="72" cy="72" rx="30" ry="18" fill="#cdd6f4" opacity="0.9"/>
      <circle cx="58" cy="66" r="16" fill="#cdd6f4" opacity="0.9"/>
      <circle cx="76" cy="62" r="14" fill="#cdd6f4"/>
    </g>
  </svg>`;
}

function iconCloud() {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" width="120" height="120">
    <g class="cloud-body">
      <ellipse cx="60" cy="72" rx="36" ry="22" fill="#94a3b8"/>
      <circle cx="44" cy="62" r="20" fill="#94a3b8"/>
      <circle cx="66" cy="56" r="18" fill="#b0bec5"/>
      <ellipse cx="60" cy="72" rx="34" ry="20" fill="#b0bec5"/>
    </g>
  </svg>`;
}

function iconRain() {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" width="120" height="120">
    <g class="cloud-body">
      <ellipse cx="60" cy="54" rx="34" ry="20" fill="#89b4fa"/>
      <circle cx="44" cy="46" r="18" fill="#89b4fa"/>
      <circle cx="64" cy="42" r="16" fill="#9dc5fb"/>
      <ellipse cx="60" cy="54" rx="32" ry="18" fill="#9dc5fb"/>
    </g>
    <line class="drop" x1="44" y1="74" x2="40" y2="88" stroke="#5bc4f5" stroke-width="3" stroke-linecap="round"/>
    <line class="drop" x1="60" y1="78" x2="56" y2="92" stroke="#5bc4f5" stroke-width="3" stroke-linecap="round"/>
    <line class="drop" x1="76" y1="74" x2="72" y2="88" stroke="#5bc4f5" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}

function iconStorm() {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" width="120" height="120">
    <g class="cloud-body">
      <ellipse cx="60" cy="48" rx="36" ry="22" fill="#4a4a6a"/>
      <circle cx="42" cy="40" r="20" fill="#4a4a6a"/>
      <circle cx="64" cy="36" r="18" fill="#5a5a7a"/>
      <ellipse cx="60" cy="48" rx="34" ry="20" fill="#5a5a7a"/>
    </g>
    <polygon class="lightning"
      points="64,66 52,82 60,82 56,98 72,76 63,76"
      fill="#ffd700" stroke="#fff" stroke-width="0.5"/>
  </svg>`;
}

function iconSnow() {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" width="120" height="120">
    <g class="cloud-body">
      <ellipse cx="60" cy="50" rx="34" ry="20" fill="#cdd6f4"/>
      <circle cx="44" cy="42" r="18" fill="#cdd6f4"/>
      <circle cx="64" cy="38" r="16" fill="#dce8fc"/>
      <ellipse cx="60" cy="50" rx="32" ry="18" fill="#dce8fc"/>
    </g>
    <text class="snowflake" x="38" y="82" font-size="16" fill="#cdd6f4" text-anchor="middle">❄</text>
    <text class="snowflake" x="60" y="88" font-size="16" fill="#cdd6f4" text-anchor="middle">❄</text>
    <text class="snowflake" x="82" y="82" font-size="16" fill="#cdd6f4" text-anchor="middle">❄</text>
  </svg>`;
}

function iconMist() {
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" width="120" height="120">
    <line class="mist-line" x1="20" y1="45" x2="100" y2="45" stroke="#fab387" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
    <line class="mist-line" x1="30" y1="60" x2="90"  y2="60" stroke="#fab387" stroke-width="5" stroke-linecap="round" opacity="0.5"/>
    <line class="mist-line" x1="15" y1="75" x2="105" y2="75" stroke="#fab387" stroke-width="5" stroke-linecap="round" opacity="0.6"/>
  </svg>`;
}

// ─── FORECAST STRIP ───────────────────────────────────────────
// OWM forecast returns 3h intervals; pick one per day (closest to noon)
function renderForecastStrip(list) {
  forecastStrip.innerHTML = '';
  const days = {};

  list.forEach(entry => {
    const date = new Date(entry.dt * 1000);
    const dayKey = date.toDateString();
    const hour = date.getHours();
    // Keep the entry closest to noon per day
    if (!days[dayKey] || Math.abs(hour - 12) < Math.abs(new Date(days[dayKey].dt*1000).getHours() - 12)) {
      days[dayKey] = entry;
    }
  });

  // Build max 5 day cards
  const entries = Object.values(days).slice(0, 5);

  entries.forEach((entry, i) => {
    const date   = new Date(entry.dt * 1000);
    const dayLabel = i === 0 ? 'Today' : date.toLocaleDateString('en-US',{weekday:'short'});
    const hi     = Math.round(entry.main.temp_max);
    const lo     = Math.round(entry.main.temp_min);
    const desc   = entry.weather[0].description;
    const emoji  = conditionEmoji(entry.weather[0].id);

    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.style.setProperty('--card-delay', `${i * 0.06}s`);
    card.innerHTML = `
      <span class="forecast-day">${dayLabel}</span>
      <span class="forecast-icon">${emoji}</span>
      <span class="forecast-high">${hi}°</span>
      <span class="forecast-low">${lo}°</span>
      <span class="forecast-desc">${desc}</span>
    `;
    forecastStrip.appendChild(card);
  });
}

// ─── HOURLY STRIP ─────────────────────────────────────────────
function renderHourlyStrip(list) {
  hourlyStrip.innerHTML = '';
  list.forEach((entry, i) => {
    const date  = new Date(entry.dt * 1000);
    const time  = date.toLocaleTimeString('en-US',{hour:'numeric',hour12:true});
    const temp  = Math.round(entry.main.temp);
    const emoji = conditionEmoji(entry.weather[0].id);
    const pop   = Math.round((entry.pop || 0) * 100); // probability of precipitation

    const card = document.createElement('div');
    card.className = 'hourly-card';
    card.style.setProperty('--card-delay', `${i * 0.04}s`);
    card.innerHTML = `
      <span class="hourly-time">${time}</span>
      <span class="hourly-icon">${emoji}</span>
      <span class="hourly-temp">${temp}°</span>
      ${pop > 0 ? `<span class="hourly-rain">💧${pop}%</span>` : ''}
    `;
    hourlyStrip.appendChild(card);
  });
}

// ─── CHARTS ──────────────────────────────────────────────────
// Destroy previous instances before re-rendering (avoids canvas conflicts)
function renderCharts(list) {
  const labels  = list.map(e => {
    const d = new Date(e.dt * 1000);
    return d.toLocaleTimeString('en-US',{hour:'numeric',hour12:true});
  });
  const temps   = list.map(e => Math.round(e.main.temp));
  const humids  = list.map(e => e.main.humidity);

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();

  // Shared chart defaults for a cohesive look
  const sharedOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(12,18,32,0.95)',
        borderColor: `rgba(${accentRgb},0.3)`,
        borderWidth: 1,
        titleColor: '#f0f4ff',
        bodyColor: accent,
        titleFont: { family: 'Syne', size: 11, weight: '700' },
        bodyFont:  { family: 'Syne', size: 13, weight: '700' },
        padding: 12,
        cornerRadius: 10,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
        ticks: { color: '#445577', font: { family: 'Syne', size: 10, weight: '600' } },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
        ticks: { color: '#445577', font: { family: 'Syne', size: 10, weight: '600' } },
      },
    },
    animation: {
      duration: 1200,
      easing: 'easeOutQuart',
    },
  };

  // ── Temperature Chart
  if (tempChartInstance) tempChartInstance.destroy();
  const tCtx = document.getElementById('tempChart').getContext('2d');

  // Gradient fill under temp line
  const tGradient = tCtx.createLinearGradient(0, 0, 0, 200);
  tGradient.addColorStop(0, `rgba(${accentRgb},0.35)`);
  tGradient.addColorStop(1, `rgba(${accentRgb},0)`);

  tempChartInstance = new Chart(tCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: temps,
        borderColor: accent,
        borderWidth: 2.5,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: accent,
        pointBorderColor: 'var(--bg-deep)',
        pointBorderWidth: 2,
        fill: true,
        backgroundColor: tGradient,
        tension: 0.4,
      }],
    },
    options: {
      ...sharedOptions,
      plugins: {
        ...sharedOptions.plugins,
        tooltip: {
          ...sharedOptions.plugins.tooltip,
          callbacks: { label: ctx => ` ${ctx.parsed.y}°C` },
        },
      },
      scales: {
        ...sharedOptions.scales,
        y: { ...sharedOptions.scales.y, ticks: { ...sharedOptions.scales.y.ticks, callback: v => `${v}°` } },
      },
    },
  });

  // ── Humidity Chart (bar)
  if (humidityChartInstance) humidityChartInstance.destroy();
  const hCtx = document.getElementById('humidityChart').getContext('2d');

  const hGradient = hCtx.createLinearGradient(0, 0, 0, 200);
  hGradient.addColorStop(0, `rgba(${accentRgb},0.7)`);
  hGradient.addColorStop(1, `rgba(${accentRgb},0.1)`);

  humidityChartInstance = new Chart(hCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: humids,
        backgroundColor: hGradient,
        borderColor: `rgba(${accentRgb},0.8)`,
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      ...sharedOptions,
      plugins: {
        ...sharedOptions.plugins,
        tooltip: {
          ...sharedOptions.plugins.tooltip,
          callbacks: { label: ctx => ` ${ctx.parsed.y}%` },
        },
      },
      scales: {
        ...sharedOptions.scales,
        y: {
          ...sharedOptions.scales.y,
          min: 0, max: 100,
          ticks: { ...sharedOptions.scales.y.ticks, callback: v => `${v}%` },
        },
      },
    },
  });
}

// ─── TOAST NOTIFICATION ───────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  toastMsg.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
}

// ─── HELPER UTILITIES ─────────────────────────────────────────

// Convert wind degrees to compass direction string
function degreesToDir(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

// Format unix timestamp → local time string with timezone offset
function formatTime(unixTs, tzOffsetSec) {
  const d = new Date((unixTs + tzOffsetSec) * 1000);
  return d.toUTCString().slice(-12,-7); // "HH:MM" from UTC string
}

// Simple UV estimate since free OWM tier lacks UV endpoint
function estimateUV(cloudiness, weatherId) {
  const hour = new Date().getHours();
  if (hour < 6 || hour > 20) return 0;
  let base = Math.round((1 - cloudiness / 100) * 10);
  if (weatherId >= 200 && weatherId < 700) base = Math.max(0, base - 3);
  return Math.min(11, Math.max(0, base));
}

function getUVLabel(uv) {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}

function getPressureLabel(hpa) {
  if (hpa < 1000) return '↓ Low pressure';
  if (hpa > 1020) return '↑ High pressure';
  return '→ Normal';
}

// Map OWM condition ID to descriptive emoji for forecast cards
function conditionEmoji(id) {
  if (id === 800) return '☀️';
  if (id === 801) return '🌤️';
  if (id === 802) return '⛅';
  if (id >= 803 && id <= 804) return '☁️';
  if (id >= 200 && id < 300) return '⛈️';
  if (id >= 300 && id < 400) return '🌦️';
  if (id >= 500 && id < 600) return '🌧️';
  if (id >= 600 && id < 700) return '❄️';
  if (id >= 700 && id < 800) return '🌫️';
  return '🌡️';
}

// ─── SHAKE KEYFRAME (injected dynamically for the search bar) ─
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shakeX {
    0%,100%{transform:translateX(0)}
    20%{transform:translateX(-8px)}
    40%{transform:translateX(8px)}
    60%{transform:translateX(-5px)}
    80%{transform:translateX(5px)}
  }
`;
document.head.appendChild(shakeStyle);
