import { addDays, daysBetween, shortLabel, todayKey, weekStart } from './dates';
import { CATEGORIES, CATEGORY_PLURAL, type Category, type ClothingItem, type WearLogEntry } from './types';

/** date -> resolved items worn that day (merging multiple entries per date). */
export function wornByDate(logs: WearLogEntry[], itemsById: Map<string, ClothingItem>) {
  const map = new Map<string, ClothingItem[]>();
  for (const log of logs) {
    const list = map.get(log.date) ?? [];
    for (const id of log.itemIds) {
      const item = itemsById.get(id);
      if (item && !list.includes(item)) list.push(item);
    }
    map.set(log.date, list);
  }
  return map;
}

/** Consecutive days with at least one logged piece. An unlogged today doesn't break it yet. */
export function dayStreak(logs: WearLogEntry[], today = todayKey()): number {
  const days = new Set(logs.filter((l) => l.itemIds.length > 0).map((l) => l.date));
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

// ---------- Uniqueness ----------

// How much each piece defines an outfit: a different top changes the look far more than different shades.
const DEFINES: Record<Category, number> = { Top: 3, Bottom: 2, Outerwear: 1.5, Shoes: 1, Sunglasses: 0.5, Misc: 0.5 };

/** Weighted overlap of two outfits, 0 (nothing shared) … 1 (identical). */
export function outfitSimilarity(a: ClothingItem[], b: ClothingItem[]): number {
  const ids = new Set(b.map((i) => i.id));
  const w = (i: ClothingItem) => DEFINES[i.category];
  const shared = a.filter((i) => ids.has(i.id)).reduce((s, i) => s + w(i), 0);
  const union = [...a, ...b.filter((i) => !a.some((x) => x.id === i.id))].reduce((s, i) => s + w(i), 0);
  return union ? shared / union : 0;
}

/** 0–100: how different the outfit worn on `date` is from its closest match in the 60 days before. */
export function outfitUniqueness(date: string, worn: Map<string, ClothingItem[]>, windowDays = 60): number | null {
  const outfit = worn.get(date);
  if (!outfit?.length) return null;
  const from = addDays(date, -windowDays);
  let closest = 0;
  for (const [d, other] of worn) {
    if (d >= date || d < from || !other.length) continue;
    closest = Math.max(closest, outfitSimilarity(outfit, other));
  }
  return Math.round((1 - closest) * 100);
}

/** Today's uniqueness once he's logged, otherwise the average of his last 7 logged days. */
export function uniquenessScore(logs: WearLogEntry[], itemsById: Map<string, ClothingItem>, today = todayKey()): { value: number; scope: 'today' | 'week' } | null {
  const worn = wornByDate(logs, itemsById);
  const todays = outfitUniqueness(today, worn);
  if (todays !== null) return { value: todays, scope: 'today' };
  const recent = [...worn.keys()]
    .filter((d) => d < today && worn.get(d)!.length)
    .sort()
    .slice(-7)
    .map((d) => outfitUniqueness(d, worn)!);
  return recent.length ? { value: Math.round(recent.reduce((s, v) => s + v, 0) / recent.length), scope: 'week' } : null;
}

/** itemId -> most recent date worn. */
export function lastWorn(logs: WearLogEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const log of logs) {
    for (const id of log.itemIds) {
      const prev = map.get(id);
      if (!prev || log.date > prev) map.set(id, log.date);
    }
  }
  return map;
}

export function daysSinceWorn(item: ClothingItem, last: Map<string, string>, today = todayKey()): number {
  const d = last.get(item.id);
  return d ? daysBetween(d, today) : daysBetween(item.dateAdded.slice(0, 10), today);
}

// ---------- Trends ----------

export type Period = '7d' | '3mo';

interface Bucket {
  start: string;
  end: string;
}

export interface TrendData {
  pieces: number[];
  colors: number[];
  thrifted: number[];
  startLabel: string;
  endLabel: string;
  headline: string;
  deltaPct: number | null;
  up: boolean;
  colorCount: number;
  categoryCount: number;
  byColor: { name: string; hex: string; value: number }[];
  byCategory: { name: string; category: Category; value: number }[];
  hasData: boolean;
}

function buckets(period: Period, today: string): Bucket[] {
  if (period === '7d') {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i - 6);
      return { start: d, end: d };
    });
  }
  // 3 months as 13 weekly buckets ending today.
  return Array.from({ length: 13 }, (_, i) => {
    const end = addDays(today, -(12 - i) * 7);
    return { start: addDays(end, -6), end };
  });
}

export function trends(period: Period, logs: WearLogEntry[], itemsById: Map<string, ClothingItem>, today = todayKey()): TrendData {
  const worn = wornByDate(logs, itemsById);
  const bs = buckets(period, today);
  const pieces: number[] = [];
  const colors: number[] = [];
  const thrifted: number[] = [];
  const colorTotals = new Map<string, { name: string; hex: string; value: number }>();
  const catTotals = new Map<Category, number>();

  for (const b of bs) {
    let count = 0;
    let loggedDays = 0;
    let thriftCount = 0;
    const colorSet = new Set<string>();
    for (let d = b.start; d <= b.end; d = addDays(d, 1)) {
      const list = worn.get(d);
      if (!list || list.length === 0) continue;
      loggedDays++;
      for (const item of list) {
        count++;
        if (item.isThrifted) thriftCount++;
        colorSet.add(item.color.name);
        const c = colorTotals.get(item.color.name) ?? { name: item.color.name, hex: item.color.hex, value: 0 };
        c.value++;
        colorTotals.set(item.color.name, c);
        catTotals.set(item.category, (catTotals.get(item.category) ?? 0) + 1);
      }
    }
    // Weekly buckets report pieces per logged day so a missed day doesn't read as a drop.
    pieces.push(period === '7d' ? count : loggedDays ? Math.round((count / loggedDays) * 10) / 10 : 0);
    colors.push(colorSet.size);
    thrifted.push(count ? Math.round((thriftCount / count) * 100) : 0);
  }

  const first = pieces[0];
  const last = pieces[pieces.length - 1];
  const byColor = [...colorTotals.values()].sort((a, b) => b.value - a.value).slice(0, 6);
  const byCategory = CATEGORIES.map((c) => ({ name: CATEGORY_PLURAL[c], category: c, value: catTotals.get(c) ?? 0 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  return {
    pieces,
    colors,
    thrifted,
    startLabel: shortLabel(bs[0].start),
    endLabel: shortLabel(today),
    headline: String(last),
    deltaPct: first > 0 ? Math.round(((last - first) / first) * 100) : null,
    up: last >= first,
    colorCount: colorTotals.size,
    categoryCount: catTotals.size,
    byColor,
    byCategory,
    hasData: colorTotals.size > 0,
  };
}

/** Gallery week groups (Mon–Sun), newest first; the current week stops at today. */
export function galleryWeeks(count = 6, today = todayKey()) {
  const weeks: { title: string; days: string[] }[] = [];
  let start = weekStart(today);
  for (let w = 0; w < count; w++) {
    const days: string[] = [];
    const end = w === 0 ? today : addDays(start, 6);
    for (let d = end; d >= start; d = addDays(d, -1)) days.push(d);
    weeks.push({ title: w === 0 ? 'This week' : w === 1 ? 'Last week' : `Week of ${shortLabel(start)}`, days });
    start = addDays(start, -7);
  }
  return weeks;
}
