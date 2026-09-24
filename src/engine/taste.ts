import { addDays, daysBetween, todayKey } from '../dates';
import type { ClothingItem, Feedback, WearLogEntry } from '../types';
import { garment } from './garment';
import { effectiveWarmth, targetWarmth } from './thermal';

// What his history says: rotation, which pieces he actually puts together, what he's liked or
// rejected, the temperatures each piece gets worn in, and whether he runs warm or cold.

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export interface Taste {
  today: string;
  daysSince(item: ClothingItem): number;
  /** Whether he's ever logged it. */
  everWorn(item: ClothingItem): boolean;
  worn14(item: ClothingItem): number;
  /** Rotation: penalty for repeating too soon (0 = none, up to ~1). */
  repeatPenalty(item: ClothingItem): number;
  /** 0 … 1, how overdue this piece is. */
  freshness(item: ClothingItem): number;
  /** −1 … 1 from co-wear history and explicit feedback. */
  pairing(ids: string[]): { score: number; reason: string | null };
  /** Exact sets he's rejected. */
  rejected: Set<string>;
  /** Exact sets worn in the last 30 days. */
  recentSets: Set<string>;
  /** Penalty 0 … 1 when today's weather is outside what he's worn this piece in. */
  tempMismatch(item: ClothingItem, feelsMin: number, feelsMax: number): { penalty: number; reason: string | null };
  /** Learned shift to the warmth target (clo). Positive = he dresses warmer than the model. */
  warmthOffset: number;
  offsetSamples: number;
  /** Share of warm days (feels ≥ 68°) he wore shorts; null until there are enough warm days logged. */
  shortsRate: number | null;
  hasHistory: boolean;
}

export const setKey = (ids: string[]) => [...ids].sort().join('|');

export function buildTaste(items: ClothingItem[], logs: WearLogEntry[], feedback: Feedback[], today = todayKey()): Taste {
  const byId = new Map(items.map((i) => [i.id, i]));
  const last = new Map<string, string>();
  const count14 = new Map<string, number>();
  const count = new Map<string, number>();
  const pairs = new Map<string, number>();
  const temps = new Map<string, { min: number; max: number; n: number }>();
  const since14 = addDays(today, -14);
  const since30 = addDays(today, -30);
  const recentSets = new Set<string>();
  const offsets: number[] = [];
  let warmDays = 0;
  let warmShortsDays = 0;

  for (const log of logs) {
    const ids = log.itemIds.filter((id) => byId.has(id));
    if (log.date >= since30 && log.date < today) recentSets.add(setKey(ids));
    for (const id of ids) {
      if (!last.has(id) || log.date > last.get(id)!) last.set(id, log.date);
      count.set(id, (count.get(id) ?? 0) + 1);
      if (log.date >= since14) count14.set(id, (count14.get(id) ?? 0) + 1);
      if (log.weather) {
        const t = temps.get(id) ?? { min: Infinity, max: -Infinity, n: 0 };
        t.min = Math.min(t.min, log.weather.feelsMin);
        t.max = Math.max(t.max, log.weather.feelsMax);
        t.n++;
        temps.set(id, t);
      }
    }
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.set(pairKey(ids[i], ids[j]), (pairs.get(pairKey(ids[i], ids[j])) ?? 0) + 1);

    if (log.weather && log.weather.feelsMax >= 68) {
      warmDays++;
      if (ids.some((id) => byId.get(id)!.category === 'Bottom' && (byId.get(id)!.length === 'shorts' || /short/i.test(byId.get(id)!.name)))) warmShortsDays++;
    }

    // Personal comfort: compare what he actually wore to what the model would have wanted
    // at that day's warm part (inner layers) — only for complete outfits.
    if (log.weather) {
      const worn = ids.map((id) => garment(byId.get(id)!));
      if (worn.some((g) => g.item.category === 'Top') && worn.some((g) => g.item.category === 'Bottom')) {
        const inner = worn.filter((g) => g.item.category !== 'Outerwear').reduce((s, g) => s + effectiveWarmth(g), 0);
        offsets.push(inner - targetWarmth(log.weather.feelsMax));
      }
    }
  }

  const fbPairs = new Map<string, number>();
  const rejected = new Set<string>();
  for (const f of feedback) {
    const w = f.verdict === 'like' ? 1 : -1.6;
    if (f.verdict === 'dislike') rejected.add(setKey(f.itemIds));
    for (let i = 0; i < f.itemIds.length; i++)
      for (let j = i + 1; j < f.itemIds.length; j++) fbPairs.set(pairKey(f.itemIds[i], f.itemIds[j]), (fbPairs.get(pairKey(f.itemIds[i], f.itemIds[j])) ?? 0) + w);
  }

  offsets.sort((a, b) => a - b);
  const median = offsets.length ? offsets[Math.floor(offsets.length / 2)] : 0;
  // Trust the learned offset gradually; never more than ±0.18 clo (~ ±8°F).
  const trust = Math.min(1, Math.max(0, (offsets.length - 3) / 10));
  const warmthOffset = Math.max(-0.18, Math.min(0.18, median * trust));

  const daysSince = (i: ClothingItem) => daysBetween(last.get(i.id) ?? i.dateAdded.slice(0, 10), today);

  return {
    today,
    daysSince,
    everWorn: (i) => last.has(i.id),
    worn14: (i) => count14.get(i.id) ?? 0,
    repeatPenalty(i) {
      const d = last.has(i.id) ? daysBetween(last.get(i.id)!, today) : 99;
      if (d <= 0) return 0; // already logged today — that's today's outfit, not a repeat
      // People repeat jeans and shoes happily; tops much less so.
      const scale = i.category === 'Top' ? 1 : i.category === 'Bottom' ? 0.35 : i.category === 'Outerwear' || i.category === 'Shoes' ? 0.1 : 0.2;
      const byDay = d === 1 ? 1 : d === 2 ? 0.55 : d === 3 ? 0.25 : 0;
      const overuse = Math.max(0, (count14.get(i.id) ?? 0) - 5) * 0.12;
      return Math.min(1, byDay * scale + overuse * scale);
    },
    freshness(i) {
      // Three weeks off is "fresh"; beyond that it's not fresher, just forgotten.
      return Math.min(daysSince(i), 21) / 21;
    },
    pairing(ids) {
      let hist = 0;
      let fb = 0;
      let best: { n: number; a: string; b: string } | null = null;
      let liked = false;
      let disliked = false;
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const k = pairKey(ids[i], ids[j]);
          const n = pairs.get(k) ?? 0;
          const ci = count.get(ids[i]) ?? 0;
          const cj = count.get(ids[j]) ?? 0;
          const cats = [byId.get(ids[i])?.category, byId.get(ids[j])?.category];
          const core = cats.includes('Top') && cats.includes('Bottom') ? 2 : 1;
          if (n && ci && cj) hist += (core * n) / Math.sqrt(ci * cj);
          if (n >= 2 && (!best || n > best.n)) best = { n, a: ids[i], b: ids[j] };
          const f = fbPairs.get(k) ?? 0;
          fb += f;
          if (f > 0) liked = true;
          if (f < 0) disliked = true;
        }
      const npairs = Math.max(1, (ids.length * (ids.length - 1)) / 2 + 1);
      const score = Math.max(-1, Math.min(1, (hist / npairs) * 1.5 + fb / npairs));
      let reason: string | null = null;
      if (disliked) reason = null;
      else if (liked) reason = 'builds on a pairing you liked';
      else if (best) reason = `you’ve worn the ${byId.get(best.a)!.name.toLowerCase()} with the ${byId.get(best.b)!.name.toLowerCase()} ${best.n} times`;
      return { score, reason };
    },
    rejected,
    recentSets,
    tempMismatch(i, feelsMin, feelsMax) {
      const t = temps.get(i.id);
      if (!t || t.n < 3) return { penalty: 0, reason: null };
      if (feelsMax < t.min - 8) return { penalty: Math.min(1, (t.min - 8 - feelsMax) / 15), reason: `you usually wear the ${i.name.toLowerCase()} when it’s warmer` };
      if (feelsMin > t.max + 8) return { penalty: Math.min(1, (feelsMin - t.max - 8) / 15), reason: `you usually save the ${i.name.toLowerCase()} for cooler days` };
      return { penalty: 0, reason: null };
    },
    warmthOffset,
    offsetSamples: offsets.length,
    shortsRate: warmDays >= 4 ? warmShortsDays / warmDays : null,
    hasHistory: logs.length >= 5,
  };
}
