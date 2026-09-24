import { addDays, daysBetween, todayKey } from './dates';
import { lastWorn } from './stats';
import { lengthOf, sleeveOf, type BottomLength, type Category, type ClothingItem, type Sleeve, type WearLogEntry } from './types';
import type { Weather } from './weather';

// Two levels of help, lightest first:
//  1. A starter — a weather-shaped nudge in plain garment terms ("Long-sleeve top + shorts").
//     It never names a specific piece; he picks his own.
//  2. Combos — only when he asks: real outfits from his closet (AI when a key is set, rules otherwise).

// ---------- Starter ----------

export type Layer = 'light' | 'warm' | 'rain' | null;

export interface Starter {
  top: Sleeve;
  bottom: BottomLength;
  layer: Layer;
  shades: boolean;
  line: string;
  why: string;
}

export function starterFor(w: Weather | null): Starter | null {
  if (!w) return null;
  const temps = w.hours.map((h) => h.temp);
  const morning = temps[0] ?? w.low;
  const peak = temps.length ? Math.max(...temps) : w.high;
  const peakHour = w.hours.find((h) => h.temp === peak)?.time ?? '';

  const bottom: BottomLength = peak >= 68 && morning >= 50 && !(w.wet && peak < 75) ? 'shorts' : 'long';
  // In-between days (cool start, warm afternoon) are long sleeves you can push up.
  const top: Sleeve = peak >= 78 ? 'short' : peak < 62 ? 'long' : morning <= 58 ? 'long' : 'short';
  const layer: Layer = peak < 50 ? 'warm' : w.wet ? 'rain' : morning < 52 || peak < 62 ? 'light' : null;
  const shades = !w.wet && (w.icon === 'sun' || w.icon === 'partly');

  const topWord = top === 'long' ? 'Long-sleeve top' : 'Short-sleeve top';
  const bottomWord = bottom === 'shorts' ? 'shorts' : 'pants';
  const layerWord = layer === 'warm' ? ' + warm coat' : layer === 'rain' ? ' + rain shell' : layer === 'light' ? ' + light layer' : '';
  const trend = peak - morning >= 6 ? `${morning}° at 7AM → ${peak}° by ${peakHour}` : `${Math.min(morning, peak)}–${peak}° all day`;
  const sky = w.wet ? 'rain likely' : shades ? 'sunny' : w.condition.toLowerCase();

  return { top, bottom, layer, shades, line: `${topWord} + ${bottomWord}${layerWord}`, why: `${trend} · ${sky}` };
}

// ---------- Combos ----------

export interface Combo {
  key: string;
  itemIds: string[];
  title: string;
  why: string;
  source: 'ai' | 'rules';
}

export const SLOT_ORDER: Category[] = ['Top', 'Bottom', 'Outerwear', 'Shoes', 'Sunglasses', 'Misc'];

export function comboKey(ids: string[]) {
  return [...ids].sort().join('|');
}

/** Everyday pieces only — house-only / sports-only never get suggested. */
export function eligible(items: ClothingItem[]) {
  return items.filter((i) => i.contexts.length === 0 || i.contexts.includes('everyday'));
}

export function daysSince(item: ClothingItem, last: Map<string, string>, today = todayKey()) {
  return daysBetween(last.get(item.id) ?? item.dateAdded.slice(0, 10), today);
}

/** Does this piece fit the starter? Used to rank candidates, never to hide the rest. */
function fitsStarter(i: ClothingItem, s: Starter | null) {
  if (!s) return true;
  if (i.category === 'Top') return sleeveOf(i) === s.top || (s.top === 'short' && sleeveOf(i) === 'sleeveless');
  if (i.category === 'Bottom') return lengthOf(i) === s.bottom;
  return true;
}

/** Candidates for one slot, best first. */
export function rankSlot(category: Category, items: ClothingItem[], logs: WearLogEntry[], s: Starter | null): ClothingItem[] {
  const last = lastWorn(logs);
  const pool = eligible(items).filter((i) => i.category === category);
  const score = (i: ClothingItem) => Math.min(daysSince(i, last), 30) + (i.isSafeBet ? 6 : 0) + (i.isFavorite ? 3 : 0) + (fitsStarter(i, s) ? 40 : 0);
  return pool.sort((a, b) => score(b) - score(a));
}

function pickWeighted<T>(list: T[], weight: (t: T) => number): T {
  const total = list.reduce((s, t) => s + weight(t), 0);
  let r = Math.random() * total;
  for (const t of list) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return list[list.length - 1];
}

export type RulesResult = { combos: Combo[] } | { missing: string[] };

/** Three combos with different characters: the fresh one, the safe bet, the wildcard. */
export function ruleCombos(items: ClothingItem[], logs: WearLogEntry[], s: Starter | null): RulesResult {
  const pool = eligible(items);
  const by = (c: Category) => pool.filter((i) => i.category === c);
  const missing = (['Top', 'Bottom'] as Category[]).filter((c) => by(c).length === 0).map((c) => (c === 'Top' ? 'a top' : 'a bottom'));
  if (missing.length) return { missing };

  const today = todayKey();
  const last = lastWorn(logs);
  const recent = new Set(logs.filter((l) => l.date >= addDays(today, -30)).map((l) => comboKey(l.itemIds)));
  const fits = (list: ClothingItem[]) => {
    const good = list.filter((i) => fitsStarter(i, s));
    return good.length ? good : list;
  };

  const strategies: { title: string; weight: (i: ClothingItem) => number; ignoreStarter?: boolean }[] = [
    { title: 'The fresh one', weight: (i) => Math.min(daysSince(i, last), 45) ** 1.5 + 1 },
    { title: 'The safe bet', weight: (i) => (i.isSafeBet ? 30 : 0) + (i.isFavorite ? 12 : 0) + 2 },
    { title: 'The wildcard', weight: () => 1, ignoreStarter: true },
  ];

  const combos: Combo[] = [];
  const seen = new Set<string>();
  for (const st of strategies) {
    for (let attempt = 0; attempt < 25; attempt++) {
      const slot = (c: Category) => (st.ignoreStarter ? by(c) : fits(by(c)));
      const top = pickWeighted(slot('Top'), st.weight);
      const bottoms = slot('Bottom');
      const contrast = bottoms.filter((b) => b.color.name !== top.color.name);
      const bottom = pickWeighted(contrast.length ? contrast : bottoms, st.weight);
      const shoes = by('Shoes').length ? pickWeighted(by('Shoes'), st.weight) : null;
      const outer = s?.layer && by('Outerwear').length ? pickWeighted(by('Outerwear'), st.weight) : null;
      const shades = s?.shades && by('Sunglasses').length ? pickWeighted(by('Sunglasses'), st.weight) : null;
      const set = [top, bottom, outer, shoes, shades].filter((i): i is ClothingItem => !!i);
      const key = comboKey(set.map((i) => i.id));
      if (seen.has(key) || (recent.has(key) && attempt < 20)) continue;
      seen.add(key);
      combos.push({ key, itemIds: set.map((i) => i.id), title: st.title, why: whyFor(st.title, set, last, s), source: 'rules' });
      break;
    }
  }
  // A small closet can make strategies collide; fill the gap with any distinct outfit.
  for (let attempt = 0; combos.length < 3 && attempt < 40; attempt++) {
    const any = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)];
    const set = [any(by('Top')), any(by('Bottom')), by('Shoes').length ? any(by('Shoes')) : null].filter((i): i is ClothingItem => !!i);
    const key = comboKey(set.map((i) => i.id));
    if (seen.has(key)) continue;
    seen.add(key);
    combos.push({ key, itemIds: set.map((i) => i.id), title: 'Another angle', why: whyFor('', set, last, s), source: 'rules' });
  }
  return { combos };
}

function whyFor(title: string, set: ClothingItem[], last: Map<string, string>, s: Starter | null): string {
  const stale = [...set].sort((a, b) => daysSince(b, last) - daysSince(a, last))[0];
  const staleDays = daysSince(stale, last);
  const top = set.find((i) => i.category === 'Top');
  const bottom = set.find((i) => i.category === 'Bottom');
  const pair = top && bottom ? `${top.color.name.toLowerCase()} against ${bottom.color.name.toLowerCase()}` : '';

  if (title === 'The fresh one') {
    return staleDays >= 7 ? `${stale.name} last came out ${staleDays} days ago.` : `Everything here has had a few days off — ${pair}.`;
  }
  if (title === 'The safe bet') {
    const safe = set.filter((i) => i.isSafeBet || i.isFavorite).length;
    return safe >= 2 ? `${safe} of your go-tos — no thinking required.` : `The dependable read on today: ${pair}.`;
  }
  if (title === 'The wildcard') {
    if (s && top && !fitsStarter(top, s)) return `Breaks the starter on purpose — ${sleeveOf(top)} sleeves anyway.`;
    if (s && bottom && !fitsStarter(bottom, s)) return `Ignores the starter: ${lengthOf(bottom) === 'shorts' ? 'shorts' : 'pants'} anyway.`;
    return `Same weather, different mood: ${pair}.`;
  }
  if (top && s) return `${sleeveOf(top) === 'long' ? 'Long sleeves for the cool start' : 'Short sleeves for the warm part'}; ${pair}.`;
  return pair ? `${pair[0].toUpperCase()}${pair.slice(1)}.` : 'Built from what you’ve worn least lately.';
}
