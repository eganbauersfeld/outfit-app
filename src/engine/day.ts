import type { HourDetail, Weather } from '../weather';

// The part of the forecast that matters for getting dressed: the hours he's actually out.

export const WEAR_START = 8;
export const WEAR_END = 20;

export interface DayProfile {
  hours: HourDetail[]; // the wear window only
  coldFeels: number;
  warmFeels: number;
  coldHour: number;
  warmHour: number;
  swing: number; // warm − cold, °F
  rainChance: number; // max % in the window
  rainHour: number | null; // first hour it's likely (≥50%)
  snow: boolean;
  windy: boolean; // sustained ≥ 15 mph at some point
  windMax: number;
  sunny: boolean; // mostly clear/partly cloudy with real UV
  uvMax: number;
}

/** Older cached forecasts don't have per-hour detail; approximate it from the display strip. */
function fallbackHours(w: Weather): HourDetail[] {
  return w.hours.map((h) => {
    const n = Number(h.time.replace(/[AP]M/, ''));
    const hour = h.time.endsWith('PM') ? (n % 12) + 12 : n % 12;
    const wet = h.icon === 'rain' || h.icon === 'storm' || h.icon === 'snow';
    return { hour, temp: h.temp, feels: h.temp - (w.temp - w.feelsLike), precip: wet ? 70 : w.wet ? 40 : 5, wind: 5, uv: h.icon === 'sun' ? 5 : h.icon === 'partly' ? 3 : 1, icon: h.icon };
  });
}

export function hourLabel(h: number) {
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'AM' : 'PM'}`;
}

export function dayProfile(w: Weather): DayProfile {
  const all = w.day?.length ? w.day : fallbackHours(w);
  let hours = all.filter((h) => h.hour >= WEAR_START && h.hour <= WEAR_END);
  if (!hours.length) hours = all;
  const cold = hours.reduce((a, b) => (b.feels < a.feels ? b : a));
  const warm = hours.reduce((a, b) => (b.feels > a.feels ? b : a));
  const rainChance = Math.max(...hours.map((h) => h.precip));
  const rainy = hours.find((h) => h.precip >= 50 || h.icon === 'rain' || h.icon === 'storm');
  const clearHours = hours.filter((h) => h.icon === 'sun' || h.icon === 'partly').length;
  const uvMax = Math.max(...hours.map((h) => h.uv));
  const windMax = Math.max(...hours.map((h) => h.wind));
  return {
    hours,
    coldFeels: cold.feels,
    warmFeels: warm.feels,
    coldHour: cold.hour,
    warmHour: warm.hour,
    swing: warm.feels - cold.feels,
    rainChance,
    rainHour: rainy?.hour ?? null,
    snow: hours.some((h) => h.icon === 'snow'),
    windy: windMax >= 15,
    windMax,
    sunny: clearHours >= hours.length / 2 && uvMax >= 3,
    uvMax,
  };
}
