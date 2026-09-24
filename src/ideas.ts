import { addDays, daysBetween, todayKey } from './dates';
import { lastWorn } from './stats';
import type { Category, ClothingItem, WearLogEntry } from './types';
import type { Weather } from './weather';

// 2–3 short combos built from his own closet — ideas, not a prescribed outfit.

export type IdeasResult = { ideas: string[] } | { missing: string[] };

/** Weighted random pick; weight = freshness. */
function pickWeighted<T>(list: T[], weight: (t: T) => number): T {
  const total = list.reduce((s, t) => s + weight(t), 0);
  let r = Math.random() * total;
  for (const t of list) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return list[list.length - 1];
}

function comboKey(ids: string[]) {
  return [...ids].sort().join('|');
}

export function generateIdeas(items: ClothingItem[], logs: WearLogEntry[], w: Weather | null): IdeasResult {
  const today = todayKey();
  // House-only / sports-only pieces never get suggested.
  const eligible = items.filter((i) => i.contexts.length === 0 || i.contexts.includes('everyday'));
  const by = (c: Category) => eligible.filter((i) => i.category === c);

  const missing = (['Top', 'Bottom'] as Category[]).filter((c) => by(c).length === 0);
  if (missing.length) return { missing: missing.map((c) => (c === 'Top' ? 'a top' : 'a bottom')) };

  // Weather rules: no outerwear above ~68°F, required below ~50°F, optional in between.
  const high = w?.high ?? 60;
  const outerwear: 'skip' | 'optional' | 'required' = high > 68 ? 'skip' : high < 50 || w?.wet ? 'required' : 'optional';
  const sunny = !!w && (w.icon === 'sun' || w.icon === 'partly') && !w.wet;

  // Freshness: days since last worn (capped), with a boost for safe bets and anything not worn in 14 days.
  const last = lastWorn(logs);
  const freshness = (i: ClothingItem) => {
    const since = daysBetween(last.get(i.id) ?? i.dateAdded.slice(0, 10), today);
    return Math.min(since, 30) + 2 + (i.isSafeBet ? 8 : 0) + (since >= 14 ? 8 : 0);
  };

  // Exact item sets logged in the last 30 days don't come back as ideas.
  const cutoff = addDays(today, -30);
  const recent = new Set(logs.filter((l) => l.date >= cutoff).map((l) => comboKey(l.itemIds)));

  const ideas: string[] = [];
  const seen = new Set<string>();
  const usedTops = new Set<string>();
  for (let attempt = 0; attempt < 40 && ideas.length < 3; attempt++) {
    const topsLeft = by('Top').filter((t) => !usedTops.has(t.id));
    const top = pickWeighted(topsLeft.length ? topsLeft : by('Top'), freshness);
    const bottoms = by('Bottom');
    // Prefer a bottom in a different color so the combo has some contrast.
    const contrast = bottoms.filter((b) => b.color.name !== top.color.name);
    const bottom = pickWeighted(contrast.length ? contrast : bottoms, freshness);
    const shoes = by('Shoes').length ? pickWeighted(by('Shoes'), freshness) : null;
    const outer =
      outerwear !== 'skip' && by('Outerwear').length && (outerwear === 'required' || Math.random() < 0.5) ? pickWeighted(by('Outerwear'), freshness) : null;
    const shades = sunny && by('Sunglasses').length && Math.random() < 0.6 ? pickWeighted(by('Sunglasses'), freshness) : null;

    const set = [top, bottom, shoes, outer, shades].filter((i): i is ClothingItem => !!i);
    const key = comboKey(set.map((i) => i.id));
    if (seen.has(key) || recent.has(key)) continue;
    seen.add(key);
    usedTops.add(top.id);

    let line = [top, bottom, shoes].filter(Boolean).map((i) => i!.name).join(' + ');
    if (outer) line += `, ${outer.name} ${outerwear === 'required' ? 'on top' : 'for the walk over'}`;
    if (shades) line += `, ${shades.name}`;
    ideas.push(line);
  }

  // A tiny closet can run out of fresh combos; a repeat beats an empty answer.
  if (ideas.length === 0) {
    const top = pickWeighted(by('Top'), freshness);
    const bottom = pickWeighted(by('Bottom'), freshness);
    ideas.push(`${top.name} + ${bottom.name}`);
  }
  return { ideas };
}
