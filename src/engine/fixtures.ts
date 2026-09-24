// Test fixtures: a realistic closet and forecast builders. Not imported by the app.
import type { ClothingItem, Material, WearLogEntry } from '../types';
import type { HourDetail, Weather, WeatherIcon } from '../weather';

type Spec = [id: string, name: string, cat: ClothingItem['category'], color: string, hex: string, extra?: Partial<ClothingItem>];

const specs: Spec[] = [
  ['t-white', 'White Tee', 'Top', 'White', '#FFFFFF', { sleeve: 'short', material: 'Cotton', isSafeBet: true }],
  ['t-black', 'Black Tee', 'Top', 'Black', '#111111', { sleeve: 'short', material: 'Cotton' }],
  ['t-band', 'Band Tee', 'Top', 'Black', '#161616', { sleeve: 'short', styleType: 'Graphic' }],
  ['t-rust', 'Rust Tee', 'Top', 'Orange', '#B5562B', { sleeve: 'short' }],
  ['t-ls-gray', 'Gray Long Sleeve', 'Top', 'Gray', '#8E8E88', { sleeve: 'long', material: 'Cotton' }],
  ['t-oxford', 'Oxford Shirt', 'Top', 'Blue', '#9DB7D5', { sleeve: 'long', material: 'Cotton', isFavorite: true }],
  ['t-flannel', 'Red Flannel', 'Top', 'Red', '#A3312B', { sleeve: 'long', material: 'Flannel' }],
  ['t-sweater', 'Navy Wool Sweater', 'Top', 'Navy', '#1F2F4F', { sleeve: 'long', material: 'Wool' }],
  ['t-hoodie', 'Gray Hoodie', 'Top', 'Gray', '#9B9B93', { sleeve: 'long', material: 'Fleece' }],
  ['t-linen', 'Linen Shirt', 'Top', 'Cream', '#EFE6D2', { sleeve: 'short', material: 'Linen' }],
  ['t-graphic2', 'Graphic Tee', 'Top', 'Green', '#4C8C5C', { sleeve: 'short', styleType: 'Graphic' }],
  ['b-jeans', 'Blue Jeans', 'Bottom', 'Blue', '#3A5F8A', { length: 'long', material: 'Denim', isSafeBet: true }],
  ['b-black', 'Black Jeans', 'Bottom', 'Black', '#151515', { length: 'long', material: 'Denim' }],
  ['b-chinos', 'Khaki Chinos', 'Bottom', 'Khaki', '#C3B091', { length: 'long', material: 'Cotton' }],
  ['b-shorts', 'Chino Shorts', 'Bottom', 'Tan', '#C9A574', { length: 'shorts', material: 'Cotton' }],
  ['b-shorts2', 'Navy Shorts', 'Bottom', 'Navy', '#243554', { length: 'shorts' }],
  ['b-gym', 'Gym Shorts', 'Bottom', 'Black', '#111111', { length: 'shorts', contexts: ['sports'] }],
  ['b-sweats', 'Gray Sweatpants', 'Bottom', 'Gray', '#8C8C8C', { length: 'long', contexts: ['house-only'] }],
  ['o-denim', 'Denim Jacket', 'Outerwear', 'Blue', '#4A6C94', { material: 'Denim' }],
  ['o-shell', 'Olive Rain Shell', 'Outerwear', 'Olive', '#6B6B3A', { material: 'Synthetic' }],
  ['o-coat', 'Wool Overcoat', 'Outerwear', 'Charcoal', '#3A3A3A', { material: 'Wool' }],
  ['o-puffer', 'Black Puffer', 'Outerwear', 'Black', '#121212' ],
  ['o-fleece', 'Fleece Jacket', 'Outerwear', 'Cream', '#E9E3D5', { material: 'Fleece' }],
  ['s-white', 'White Sneakers', 'Shoes', 'White', '#FFFFFF', { isSafeBet: true }],
  ['s-boots', 'Brown Boots', 'Shoes', 'Brown', '#6B4226', { material: 'Leather' }],
  ['s-black', 'Black Sneakers', 'Shoes', 'Black', '#161616' ],
  ['s-sandals', 'Sandals', 'Shoes', 'Tan', '#B8946A' ],
  ['g-aviators', 'Aviators', 'Sunglasses', 'Gold', '#D4AF37' ],
  ['m-beanie', 'Black Beanie', 'Misc', 'Black', '#111111' ],
];

export function closet(): ClothingItem[] {
  return specs.map(([id, name, category, colorName, hex, extra]) => ({
    id,
    name,
    category,
    color: { name: colorName, hex },
    styleType: 'Plain',
    dateAdded: '2026-06-01T12:00:00.000Z',
    isFavorite: false,
    isSafeBet: false,
    isThrifted: false,
    contexts: ['everyday'],
    ...extra,
  }));
}

export const TODAY = '2026-09-24';

/** A forecast whose feels-like follows a smooth curve from `morning` (8AM) to `peak` (3PM) and back a little by 8PM. */
export function forecast(opts: { morning: number; peak: number; evening?: number; precip?: number | ((h: number) => number); wind?: number; icon?: WeatherIcon; uv?: number }): Weather {
  const evening = opts.evening ?? opts.peak - 6;
  const day: HourDetail[] = [];
  for (let hour = 0; hour < 24; hour++) {
    let feels: number;
    if (hour <= 8) feels = opts.morning - (8 - hour) * 0.5;
    else if (hour <= 15) feels = opts.morning + ((hour - 8) / 7) * (opts.peak - opts.morning);
    else feels = opts.peak + ((hour - 15) / 5) * (evening - opts.peak);
    const precip = typeof opts.precip === 'function' ? opts.precip(hour) : (opts.precip ?? 0);
    const icon: WeatherIcon = precip >= 50 ? 'rain' : (opts.icon ?? 'partly');
    day.push({ hour, temp: Math.round(feels + 2), feels: Math.round(feels), precip, wind: opts.wind ?? 5, uv: hour >= 9 && hour <= 17 ? (opts.uv ?? 5) : 0, icon });
  }
  const temps = day.filter((d) => d.hour >= 7 && d.hour <= 16);
  return {
    temp: Math.round(opts.morning + 2),
    feelsLike: opts.morning,
    high: Math.max(...day.map((d) => d.temp)),
    low: Math.min(...day.map((d) => d.temp)),
    condition: 'Test',
    icon: opts.icon ?? 'partly',
    wet: day.some((d) => d.precip >= 50),
    hours: temps.map((d) => ({ time: `${d.hour % 12 || 12}${d.hour < 12 ? 'AM' : 'PM'}`, temp: d.temp, icon: d.icon })),
    day,
    fetchedAt: Date.parse(`${TODAY}T08:00:00`),
  };
}

export function log(date: string, itemIds: string[], weather?: WearLogEntry['weather']): WearLogEntry {
  return { id: `log-${date}`, date, itemIds, source: 'manual', weather };
}

export function mat(m: Material) {
  return m;
}

/** Deterministic PRNG so tests don't flake. */
export function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}
