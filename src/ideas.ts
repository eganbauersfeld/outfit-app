import { daysSinceWorn, lastWorn } from './stats';
import type { ClothingItem, WearLogEntry } from './types';
import type { Weather } from './weather';

// Short idea lines, not a prescribed outfit. Built from his own closet when possible.

function pickWeighted<T>(list: T[], weight: (t: T) => number): T | undefined {
  const total = list.reduce((s, t) => s + weight(t), 0);
  let r = Math.random() * total;
  for (const t of list) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return list[list.length - 1];
}

function genericIdeas(w: Weather | null): string[] {
  const high = w?.high ?? 70;
  if (w?.wet) return ['Jeans + a hoodie, shell on top', 'Something dark that hides the rain', 'Boots or shoes you don’t mind soaking'];
  if (high >= 80) return ['Shorts + tee, keep it light', 'Loose button-up, sleeves rolled', 'Sunglasses — it’s bright out'];
  if (high < 60) return ['Jeans + sweater, jacket on top', 'Hoodie under a heavier layer', 'Warm socks, closed shoes'];
  return ['Shorts + tee, light layer for the walk over', 'Joggers + hoodie, easy laundry-day fit', 'Chinos + button-up, dress it up a touch'];
}

export function generateIdeas(items: ClothingItem[], logs: WearLogEntry[], w: Weather | null): string[] {
  // Only everyday pieces are fair game; house-only / sports-only stay out of suggestions.
  const eligible = items.filter((i) => i.contexts.length === 0 || i.contexts.includes('everyday'));
  const tops = eligible.filter((i) => i.category === 'Top');
  const bottoms = eligible.filter((i) => i.category === 'Bottom');
  if (tops.length === 0 || bottoms.length === 0) return genericIdeas(w);

  const outer = eligible.filter((i) => i.category === 'Outerwear');
  const last = lastWorn(logs);
  const layer = w ? w.high < 65 || w.wet || w.low < 52 : false;
  // Favor pieces he hasn't reached for lately; safe bets get a small bump.
  const weight = (i: ClothingItem) => Math.min(daysSinceWorn(i, last), 30) + 3 + (i.isSafeBet ? 6 : 0);

  const ideas: string[] = [];
  const usedTops = new Set<string>();
  for (let attempt = 0; attempt < 12 && ideas.length < 2; attempt++) {
    const top = pickWeighted(tops.filter((t) => !usedTops.has(t.id)), weight) ?? tops[0];
    usedTops.add(top.id);
    // Prefer a bottom in a different color so the combo has some contrast.
    const pool = bottoms.filter((b) => b.color.name !== top.color.name);
    const bottom = pickWeighted(pool.length ? pool : bottoms, weight)!;
    let line = `${top.name} + ${bottom.name}`;
    if (layer && outer.length) line += `, ${pickWeighted(outer, weight)!.name} over it`;
    ideas.push(line);
    if (usedTops.size === tops.length) break;
  }

  // Third line: resurface something that's been sitting.
  const forgotten = eligible
    .filter((i) => daysSinceWorn(i, last) >= 21 && (i.category !== 'Outerwear' || layer))
    .sort((a, b) => daysSinceWorn(b, last) - daysSinceWorn(a, last));
  if (forgotten.length) {
    const f = forgotten[Math.floor(Math.random() * Math.min(3, forgotten.length))];
    const weeks = Math.floor(daysSinceWorn(f, last) / 7);
    ideas.push(`${f.name} hasn’t been out in ${weeks} weeks — bring it back?`);
  } else if (w?.wet) {
    ideas.push('Rain on the way — shoes you don’t mind soaking');
  }

  return ideas.slice(0, 3);
}
