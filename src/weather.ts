import { useCallback, useEffect, useState } from 'react';

export type WeatherIcon = 'sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';

export interface Weather {
  temp: number;
  feelsLike: number;
  high: number;
  low: number;
  condition: string;
  icon: WeatherIcon;
  wet: boolean;
  hours: { time: string; temp: number; icon: WeatherIcon }[];
  fetchedAt: number;
}

// WMO weather codes, as used by Open-Meteo.
function describe(code: number): { condition: string; icon: WeatherIcon; wet: boolean } {
  if (code === 0) return { condition: 'Clear', icon: 'sun', wet: false };
  if (code === 1) return { condition: 'Mostly Clear', icon: 'sun', wet: false };
  if (code === 2) return { condition: 'Partly Cloudy', icon: 'partly', wet: false };
  if (code === 3) return { condition: 'Overcast', icon: 'cloud', wet: false };
  if (code === 45 || code === 48) return { condition: 'Fog', icon: 'fog', wet: false };
  if (code >= 51 && code <= 57) return { condition: 'Drizzle', icon: 'rain', wet: true };
  if (code >= 61 && code <= 67) return { condition: 'Rain', icon: 'rain', wet: true };
  if (code >= 71 && code <= 77) return { condition: 'Snow', icon: 'snow', wet: true };
  if (code >= 80 && code <= 82) return { condition: 'Showers', icon: 'rain', wet: true };
  if (code === 85 || code === 86) return { condition: 'Snow Showers', icon: 'snow', wet: true };
  if (code >= 95) return { condition: 'Thunderstorms', icon: 'storm', wet: true };
  return { condition: 'Cloudy', icon: 'cloud', wet: false };
}

function hourLabel(h: number) {
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 === 0 ? 12 : h % 12}${suffix}`;
}

const CACHE_KEY = 'outfit.weather';
const COORDS_KEY = 'outfit.coords';
const FRESH_MS = 30 * 60 * 1000;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function getPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('No geolocation'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject,
      { maximumAge: 60 * 60 * 1000, timeout: 10000, enableHighAccuracy: false },
    );
  });
}

async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: 'temperature_2m,apparent_temperature,weather_code',
    hourly: 'temperature_2m,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min',
    temperature_unit: 'fahrenheit',
    timezone: 'auto',
    forecast_days: '1',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Weather ${res.status}`);
  const j = await res.json();
  const now = describe(j.current.weather_code);
  // Hourly strip: 7AM–4PM local, per the design.
  const hours: Weather['hours'] = [];
  (j.hourly.time as string[]).forEach((t, i) => {
    const h = Number(t.slice(11, 13));
    if (h >= 7 && h <= 16) {
      hours.push({ time: hourLabel(h), temp: Math.round(j.hourly.temperature_2m[i]), icon: describe(j.hourly.weather_code[i]).icon });
    }
  });
  const wetLater = (j.hourly.weather_code as number[]).some((c, i) => {
    const h = Number((j.hourly.time[i] as string).slice(11, 13));
    return h >= 7 && h <= 20 && describe(c).wet;
  });
  return {
    temp: Math.round(j.current.temperature_2m),
    feelsLike: Math.round(j.current.apparent_temperature),
    high: Math.round(j.daily.temperature_2m_max[0]),
    low: Math.round(j.daily.temperature_2m_min[0]),
    condition: now.condition,
    icon: now.icon,
    wet: now.wet || wetLater,
    hours,
    fetchedAt: Date.now(),
  };
}

type State = { status: 'loading' | 'ok' | 'error'; weather: Weather | null; error?: string };

export function useWeather() {
  const [state, setState] = useState<State>(() => {
    const cached = readJson<Weather>(CACHE_KEY);
    return { status: cached ? 'ok' : 'loading', weather: cached };
  });

  const refresh = useCallback(async (force = false) => {
    const cached = readJson<Weather>(CACHE_KEY);
    const sameDay = cached && new Date(cached.fetchedAt).toDateString() === new Date().toDateString();
    if (!force && cached && sameDay && Date.now() - cached.fetchedAt < FRESH_MS) return;
    try {
      let coords = readJson<{ lat: number; lon: number }>(COORDS_KEY);
      try {
        coords = await getPosition();
        writeJson(COORDS_KEY, coords);
      } catch (e) {
        if (!coords) throw new Error('Location is off — allow it to see the forecast.');
      }
      const w = await fetchWeather(coords!.lat, coords!.lon);
      writeJson(CACHE_KEY, w);
      setState({ status: 'ok', weather: w });
    } catch (e) {
      setState((s) => ({
        status: s.weather && sameDay ? 'ok' : 'error',
        weather: sameDay ? s.weather : null,
        error: e instanceof Error ? e.message : 'Weather unavailable',
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  return { ...state, refresh };
}
