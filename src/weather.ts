import { useCallback, useEffect, useState } from 'react';

export type WeatherIcon = 'sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';

export interface HourDetail {
  hour: number; // 0–23 local
  temp: number; // °F
  feels: number; // apparent temperature, °F
  precip: number; // precipitation probability, %
  wind: number; // mph
  uv: number;
  icon: WeatherIcon;
}

export interface Weather {
  temp: number;
  feelsLike: number;
  high: number;
  low: number;
  condition: string;
  icon: WeatherIcon;
  wet: boolean;
  hours: { time: string; temp: number; icon: WeatherIcon }[];
  /** Every hour of the day with the detail the outfit engine needs. Missing in caches from older builds. */
  day?: HourDetail[];
  fetchedAt: number;
  /** Set when the forecast is for a city he picked rather than device location. */
  place?: string;
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

// ---------- Location: device GPS, or a city he picked (which then sticks). ----------

export interface SavedLocation {
  lat: number;
  lon: number;
  name?: string;
  source: 'device' | 'manual';
}

export interface Place {
  name: string;
  region: string;
  lat: number;
  lon: number;
}

export const LOCATION_EVENT = 'outfit:location-changed';

export function getSavedLocation(): SavedLocation | null {
  const loc = readJson<SavedLocation>(COORDS_KEY);
  return loc ? { ...loc, source: loc.source ?? 'device' } : null;
}

export function setManualLocation(place: Place) {
  writeJson(COORDS_KEY, { lat: place.lat, lon: place.lon, name: place.name, source: 'manual' } satisfies SavedLocation);
  dispatchEvent(new Event(LOCATION_EVENT));
}

export function switchToDeviceLocation() {
  const loc = getSavedLocation();
  if (loc) writeJson(COORDS_KEY, { ...loc, name: undefined, source: 'device' });
  dispatchEvent(new Event(LOCATION_EVENT));
}

/** City search via Open-Meteo's keyless geocoder. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const params = new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!res.ok) throw new Error('Search failed');
  const j = await res.json();
  return (j.results ?? []).map((r: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }) => ({
    name: r.name,
    region: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

class LocationError extends Error {
  constructor(
    message: string,
    public denied = false,
  ) {
    super(message);
  }
}

function getPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new LocationError('This browser can’t share location.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) =>
        reject(
          e.code === e.PERMISSION_DENIED
            ? new LocationError('Location access is blocked.', true)
            : e.code === e.TIMEOUT
              ? new LocationError('Finding your location timed out.')
              : new LocationError('Couldn’t find your location.'),
        ),
      { maximumAge: 60 * 60 * 1000, timeout: 15000, enableHighAccuracy: false },
    );
  });
}

async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: 'temperature_2m,apparent_temperature,weather_code',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,uv_index,weather_code',
    wind_speed_unit: 'mph',
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
  const day: HourDetail[] = (j.hourly.time as string[]).map((t, i) => ({
    hour: Number(t.slice(11, 13)),
    temp: Math.round(j.hourly.temperature_2m[i]),
    feels: Math.round(j.hourly.apparent_temperature?.[i] ?? j.hourly.temperature_2m[i]),
    precip: j.hourly.precipitation_probability?.[i] ?? 0,
    wind: Math.round(j.hourly.wind_speed_10m?.[i] ?? 0),
    uv: j.hourly.uv_index?.[i] ?? 0,
    icon: describe(j.hourly.weather_code[i]).icon,
  }));
  const wetLater = day.some((d) => d.hour >= 7 && d.hour <= 20 && (d.icon === 'rain' || d.icon === 'snow' || d.icon === 'storm' || d.precip >= 50));
  return {
    temp: Math.round(j.current.temperature_2m),
    feelsLike: Math.round(j.current.apparent_temperature),
    high: Math.round(j.daily.temperature_2m_max[0]),
    low: Math.round(j.daily.temperature_2m_min[0]),
    condition: now.condition,
    icon: now.icon,
    wet: now.wet || wetLater,
    hours,
    day,
    fetchedAt: Date.now(),
  };
}

/** Today's cached forecast, if any — used to stamp wear logs with the weather they were worn in. */
export function readCachedWeather(): Weather | null {
  const w = readJson<Weather>(CACHE_KEY);
  return w && new Date(w.fetchedAt).toDateString() === new Date().toDateString() ? w : null;
}

type State = { status: 'loading' | 'ok' | 'error'; weather: Weather | null; error?: string; needsLocation?: boolean; denied?: boolean };

export function useWeather() {
  const [state, setState] = useState<State>(() => {
    const cached = readJson<Weather>(CACHE_KEY);
    return { status: cached ? 'ok' : 'loading', weather: cached };
  });

  const refresh = useCallback(async (force = false) => {
    const cached = readJson<Weather>(CACHE_KEY);
    const sameDay = cached && new Date(cached.fetchedAt).toDateString() === new Date().toDateString();
    if (!force && cached && sameDay && Date.now() - cached.fetchedAt < FRESH_MS) return;
    let locationProblem = false;
    try {
      let loc = getSavedLocation();
      // A picked city wins; otherwise ask the device, falling back to the last known spot.
      if (loc?.source !== 'manual') {
        try {
          const pos = await getPosition();
          loc = { ...pos, source: 'device' };
          writeJson(COORDS_KEY, loc);
        } catch (e) {
          if (!loc) {
            locationProblem = true;
            throw e;
          }
        }
      }
      const w = await fetchWeather(loc!.lat, loc!.lon);
      w.place = loc!.name;
      writeJson(CACHE_KEY, w);
      setState({ status: 'ok', weather: w });
    } catch (e) {
      setState((s) => ({
        status: s.weather && sameDay ? 'ok' : 'error',
        weather: sameDay ? s.weather : null,
        error: e instanceof LocationError ? e.message : 'Couldn’t reach the weather service.',
        needsLocation: locationProblem,
        denied: e instanceof LocationError && e.denied,
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    const onLocation = () => {
      setState((s) => ({ ...s, status: s.weather ? s.status : 'loading' }));
      refresh(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    addEventListener(LOCATION_EVENT, onLocation);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      removeEventListener(LOCATION_EVENT, onLocation);
    };
  }, [refresh]);

  return { ...state, refresh };
}
