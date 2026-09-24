import { todayKey } from '../dates';
import { lengthOf, type Category, type ClothingItem, type Feedback, type WearLogEntry } from '../types';
import type { Weather } from '../weather';
import { colorHarmony, type ColorResult } from './color';
import { dayProfile, hourLabel, type DayProfile } from './day';
import { garment, type Garment } from './garment';
import { buildTaste, setKey, type Taste } from './taste';
import { thermal, type ThermalResult } from './thermal';

// The stylist: scores every sensible outfit his closet can make for today, then picks three
// that are good *and* different from each other, and says why in plain words.

export interface Meters {
  weather: number; // 0 … 1
  color: number;
  fresh: number;
  you: number | null; // null until there's enough history to say
}

export interface Suggestion {
  key: string;
  itemIds: string[];
  title: string;
  why: string;
  meters: Meters;
  character: 'best' | 'rediscover' | 'color' | 'easy' | 'alt';
}

export interface SuggestInput {
  items: ClothingItem[];
  logs: WearLogEntry[];
  feedback: Feedback[];
  weather: Weather | null;
  /** Build every outfit around this piece. */
  anchorId?: string;
  /** Outfit keys already shown this session — "try three more" skips them. */
  exclude?: Set<string>;
  /** 0 = deterministic; ~0.15 adds variety between runs. */
  jitter?: number;
  today?: string;
  random?: () => number;
}

export interface SuggestResult {
  combos: Suggestion[];
  missing?: string[];
  /** Closet gaps or caveats worth telling him about. */
  notes: string[];
}

export function eligible(items: ClothingItem[]) {
  return items.filter((i) => i.contexts.length === 0 || i.contexts.includes('everyday'));
}

/** A mild, all-day-68° stand-in when there's no forecast. */
function neutralDay(): DayProfile {
  const hours = Array.from({ length: 13 }, (_, k) => ({ hour: 8 + k, temp: 68, feels: 68, precip: 0, wind: 4, uv: 3, icon: 'partly' as const }));
  return { hours, coldFeels: 68, warmFeels: 68, coldHour: 8, warmHour: 14, swing: 0, rainChance: 0, rainHour: null, snow: false, windy: false, windMax: 4, sunny: false, uvMax: 3 };
}

interface Scored {
  ids: string[];
  key: string;
  pieces: Garment[];
  total: number;
  weather: number;
  color: ColorResult;
  thermal: ThermalResult;
  fresh: number;
  you: { score: number; reason: string | null };
  weatherNotes: string[];
  tasteNotes: string[];
}

// Novelty mostly lives in the "bring back" pick; the best pick is about today and his taste.
const W = { weather: 3.0, color: 1.6, style: 0.8, fresh: 0.3, you: 1.2, repeat: 1.4, tempFit: 0.5, recentSet: 0.7 };

function gauss(rand: () => number) {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function scoreOutfit(pieces: Garment[], day: DayProfile, taste: Taste, hasForecast: boolean): Scored {
  const ids = pieces.map((g) => g.item.id);
  const by = (c: Category) => pieces.find((g) => g.item.category === c);
  const top = by('Top')!;
  const bottom = by('Bottom')!;
  const outer = by('Outerwear');
  const shoes = by('Shoes');
  const shades = by('Sunglasses');
  const weatherNotes: string[] = [];
  const tasteNotes: string[] = [];

  // --- Weather: thermal comfort across the day, then rain / wind / sun specifics.
  const th = thermal(pieces, day, taste.warmthOffset);
  let weather = th.score;
  const rainWeight = day.rainChance >= 50 ? 1 : day.rainChance >= 30 ? 0.5 : 0;
  if (rainWeight) {
    const g = outer;
    if (g?.waterproof) {
      weather += 0.22 * rainWeight;
      weatherNotes.push(`${g.item.name.toLowerCase()} for ${rainPhrase(day)}`);
    } else if (!outer) weather -= 0.18 * rainWeight;
    if (shoes?.delicateInWet) weather -= 0.4 * rainWeight;
    if (shoes?.boots) {
      weather += 0.08 * rainWeight;
      weatherNotes.push('boots for wet ground');
    }
  }
  if (day.snow) {
    if (shoes?.boots) weather += 0.2;
    if (shoes?.openToe || shoes?.delicateInWet) weather -= 0.4;
  }
  if (shoes?.openToe && day.coldFeels < 60) weather -= 0.3;
  // Bare legs below ~50° and long sleeves in real heat are things people notice, whatever the math says.
  if (lengthOf(bottom.item) === 'shorts') weather -= shortsChill(day);
  if (day.warmFeels >= 82 && top.warmth >= 0.14 && top.item.material !== 'Linen') weather -= 0.25;
  if (day.warmFeels >= 85 && lengthOf(bottom.item) === 'long' && bottom.warmth >= 0.2) weather -= 0.1;
  if (outer && th.layerHours.length === 0) {
    weather -= 0.35; // carrying a layer he'll never put on
  } else if (outer && th.layerHours.length <= 2 && !rainWeight) {
    weather -= 0.08; // hauling a jacket around for an hour or two
  }
  if (outer && th.layerHours.length && hasForecast) {
    const on = th.layerHours;
    const all = on.length === day.hours.length;
    if (all) weatherNotes.push(`the ${outer.item.name.toLowerCase()} stays on all day`);
    else {
      const offAt = day.hours.find((h) => !on.includes(h.hour) && h.hour > on[0]);
      if (on[0] === day.hours[0].hour && offAt) weatherNotes.push(`${outer.item.name.toLowerCase()} for the ${day.coldFeels}° start, off by ${hourLabel(offAt.hour)}`);
      else weatherNotes.push(`${outer.item.name.toLowerCase()} for when it drops to ${day.coldFeels}° after ${hourLabel(on[0])}`);
    }
  }
  if (shades && day.sunny) {
    weather += 0.06;
  }
  if (hasForecast && !outer && th.score > 0.85 && day.swing >= 10) {
    weatherNotes.push(`light enough for ${day.warmFeels}° at ${hourLabel(day.warmHour)}, fine for the ${day.coldFeels}° start`);
  }
  if (hasForecast && top.item.category === 'Top' && lengthOf(bottom.item) === 'shorts' && top.warmth >= 0.14 && day.swing >= 8 && th.score > 0.7) {
    weatherNotes.push('long sleeves for the cool morning, shorts for the warm afternoon');
  }
  if (th.worst && th.worst.by > 0.12) {
    weatherNotes.push(th.worst.kind === 'cold' ? `a bit cold around ${hourLabel(th.worst.hour)}` : `might run warm around ${hourLabel(th.worst.hour)}`);
  }
  // Coats come off indoors: in the cold, what's under the layer has to hold up on its own.
  if (day.warmFeels < 55 && top.warmth < 0.2) weather -= (0.2 - top.warmth) * (day.warmFeels < 45 ? 3.5 : 2.5);
  if (shoes?.boots && day.coldFeels < 40) weather += 0.06;
  if (lengthOf(bottom.item) === 'shorts' && day.rainChance >= 55 && day.warmFeels < 72) weather -= 0.25;
  const weatherRaw = weather;
  weather = Math.max(0, Math.min(1, weather));

  // --- Color.
  const color = colorHarmony(pieces);

  // --- Style coherence: formality shouldn't span from gym to blazer.
  const forms = pieces.filter((g) => g.item.category !== 'Sunglasses' && g.item.category !== 'Misc').map((g) => g.formality);
  const spread = Math.max(...forms) - Math.min(...forms);
  let style = 1 - Math.max(0, spread - 1.2) * 0.45;
  if (outer && outer.warmth >= 0.6 && lengthOf(bottom.item) === 'shorts') style -= 0.4;
  if (shoes?.boots && lengthOf(bottom.item) === 'shorts') style -= 0.35;
  if (shoes?.openToe && lengthOf(bottom.item) === 'long' && bottom.item.material !== 'Linen') style -= 0.25;
  if (shoes?.openToe && top.warmth >= 0.15) style -= 0.2;

  // --- History: rotation, freshness, what he actually pairs, temperature habits.
  const repeat = pieces.reduce((s, g) => s + taste.repeatPenalty(g.item), 0);
  const core = [top, bottom];
  const fresh = (core.reduce((s, g) => s + taste.freshness(g.item), 0) + pieces.filter((g) => !core.includes(g)).reduce((s, g) => s + 0.5 * taste.freshness(g.item), 0)) / (core.length + 0.5 * (pieces.length - core.length));
  const you = taste.pairing(ids);
  if (you.reason) tasteNotes.push(you.reason);
  let tempFit = 0;
  for (const g of pieces) {
    const m = taste.tempMismatch(g.item, day.coldFeels, day.warmFeels);
    tempFit += m.penalty;
    if (m.reason && m.penalty > 0.3) tasteNotes.push(m.reason);
  }
  const key = setKey(ids);
  const prefs = pieces.reduce((s, g) => s + (g.item.isFavorite ? 0.05 : 0) + (g.item.isSafeBet ? 0.03 : 0), 0);

  // He likes shorts once the afternoon is properly warm (his own "long sleeve + shorts" days).
  // Learned from his warm days once there are enough of them.
  const shortsDay = day.warmFeels >= 68 && day.coldFeels >= 50 && day.rainChance < 55;
  const shortsWhenWarm = lengthOf(bottom.item) === 'shorts' && shortsDay ? (taste.shortsRate === null ? 0.12 : (taste.shortsRate - 0.35) * 0.6) : 0;

  const total =
    W.weather * weatherRaw +
    shortsWhenWarm +
    W.color * color.score +
    W.style * style +
    W.fresh * fresh +
    W.you * you.score -
    W.repeat * repeat -
    W.tempFit * tempFit -
    (taste.recentSets.has(key) ? W.recentSet : 0) +
    prefs;

  return { ids, key, pieces, total, weather, color, thermal: th, fresh, you, weatherNotes, tasteNotes };
}

const CORE: Category[] = ['Top', 'Bottom', 'Outerwear', 'Shoes'];

/** Shorts want a morning that isn't cold and an afternoon that's actually warm. */
function shortsChill(day: DayProfile) {
  return Math.min(0.6, Math.max(0, 52 - day.coldFeels) * 0.04 + Math.max(0, 66 - day.warmFeels) * 0.03);
}

/** Share of the main pieces two outfits have in common (sunglasses and accessories don't count). */
function overlap(a: Scored, b: Scored) {
  const main = (s: Scored) => s.pieces.filter((g) => CORE.includes(g.item.category)).map((g) => g.item.id);
  const am = main(a);
  const bm = main(b);
  // Divide by the smaller outfit so tacking on an extra piece can't make two outfits look "different".
  return am.filter((id) => bm.includes(id)).length / Math.min(am.length, bm.length);
}

const slot = (s: Scored, c: Category) => s.pieces.find((g) => g.item.category === c)?.item.id;

function rainPhrase(day: DayProfile) {
  const wetHours = day.hours.filter((h) => h.precip >= 50).length;
  if (wetHours >= day.hours.length * 0.7) return `all-day rain (${day.rainChance}%)`;
  return `the ${day.rainChance}% rain${day.rainHour !== null ? ` from ${hourLabel(day.rainHour)}` : ''}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const an = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
/** "red flannel", not "red red flannel". */
export const describe = (i: ClothingItem) => {
  const n = i.name.toLowerCase();
  const c = i.color.name.toLowerCase();
  return n.includes(c) ? n : `${c} ${n}`;
};

export function suggest(input: SuggestInput): SuggestResult {
  const today = input.today ?? todayKey();
  const rand = input.random ?? Math.random;
  const pool = eligible(input.items);
  const by = (c: Category) => pool.filter((i) => i.category === c);
  const missing = (['Top', 'Bottom'] as Category[]).filter((c) => by(c).length === 0).map((c) => (c === 'Top' ? 'a top' : 'a bottom'));
  if (missing.length) return { combos: [], missing, notes: [] };

  const taste = buildTaste(input.items, input.logs, input.feedback, today);
  const hasForecast = !!input.weather;
  const day = input.weather ? dayProfile(input.weather) : neutralDay();
  const anchor = input.anchorId ? pool.find((i) => i.id === input.anchorId) : undefined;

  // Per-slot candidates, pruned by rotation so the search stays fast on a big closet.
  const prune = (c: Category, k: number) => {
    if (anchor && anchor.category === c) return [anchor];
    return by(c)
      .map((i) => ({ i, s: taste.freshness(i) - 1.5 * taste.repeatPenalty(i) + (i.isFavorite ? 0.1 : 0) + rand() * 0.05 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, k)
      .map((x) => x.i);
  };
  const tops = prune('Top', 18);
  const bottoms = prune('Bottom', 12);
  const shoesOpts: (ClothingItem | null)[] = by('Shoes').length ? prune('Shoes', 8) : [null];
  const outerOpts: (ClothingItem | null)[] = [null, ...prune('Outerwear', 7)];
  if (anchor?.category === 'Outerwear') outerOpts.splice(0, outerOpts.length, anchor);
  const shadesOpts: (ClothingItem | null)[] = day.sunny || anchor?.category === 'Sunglasses' ? [...(anchor?.category === 'Sunglasses' ? [] : [null]), ...prune('Sunglasses', 3)] : [null];
  const warmMisc = day.coldFeels < 40 ? by('Misc').filter((i) => garment(i).warmth > 0).slice(0, 3) : [];
  const miscOpts: (ClothingItem | null)[] = anchor?.category === 'Misc' ? [anchor] : [null, ...warmMisc];

  const scored: Scored[] = [];
  for (const t of tops)
    for (const b of bottoms)
      for (const sh of shoesOpts)
        for (const o of outerOpts)
          for (const sg of shadesOpts)
            for (const m of miscOpts) {
              const items = [t, b, o, sh, sg, m].filter((i): i is ClothingItem => !!i);
              const key = setKey(items.map((i) => i.id));
              if (taste.rejected.has(key) || input.exclude?.has(key)) continue;
              const s = scoreOutfit(items.map(garment), day, taste, hasForecast);
              if (input.jitter) s.total += gauss(rand) * input.jitter;
              scored.push(s);
            }
  scored.sort((a, b) => b.total - a.total);

  const notes = closetNotes(pool, day, hasForecast, scored[0]);
  if (!scored.length) return { combos: [], notes };

  // --- Pick three with different characters, each meaningfully different from the others.
  const picked: { s: Scored; character: Suggestion['character'] }[] = [];
  // Strict: at most half the main pieces shared and a different top. Relaxed (small closets):
  // still a different top or a different bottom.
  const distinct = (s: Scored, strict: boolean) =>
    picked.every(({ s: p }) =>
      strict
        ? overlap(s, p) <= 0.5 && slot(s, 'Top') !== slot(p, 'Top')
        : overlap(s, p) <= 0.75 && (slot(s, 'Top') !== slot(p, 'Top') || slot(s, 'Bottom') !== slot(p, 'Bottom')),
    );
  const top = scored[0];
  picked.push({ s: top, character: 'best' });
  const tryPick = (character: Suggestion['character'], value: (s: Scored) => number, ok: (s: Scored) => boolean, strict: boolean) => {
    let best: Scored | null = null;
    let bestV = -Infinity;
    for (const s of scored.slice(0, 4000)) {
      if (!ok(s) || !distinct(s, strict)) continue;
      const v = value(s);
      if (v > bestV) {
        bestV = v;
        best = s;
      }
    }
    if (best) picked.push({ s: best, character });
    return !!best;
  };
  const floor = top.total - 1.2; // alternatives must still be good outfits…
  const weatherFloor = top.weather - 0.12; // …and never noticeably worse for the weather
  // "Bring back": one neglected hero piece (tops first) that today's weather actually suits.
  const rank: Partial<Record<Category, number>> = { Top: 0, Outerwear: 1, Bottom: 2 };
  const neglected = taste.hasHistory
    ? pool
        .filter((i) => i.category in rank && taste.daysSince(i) >= 14 && !top.ids.includes(i.id))
        .sort((a, b) => rank[a.category]! - rank[b.category]! || taste.daysSince(b) - taste.daysSince(a))
    : [];
  const hero = neglected.find((i) => scored.slice(0, 4000).some((s) => s.ids.includes(i.id) && s.total >= floor && s.weather >= weatherFloor));
  const colorful = (s: Scored) => !!s.color.statement && s.color.score >= 0.75;
  const safeCount = (s: Scored) => s.pieces.filter((g) => g.item.isSafeBet || g.item.isFavorite).length;
  const characters: [Suggestion['character'], (s: Scored) => number, (s: Scored) => boolean][] = [
    ['rediscover', (s) => s.total, (s) => !!hero && s.ids.includes(hero.id) && s.total >= floor && s.weather >= weatherFloor],
    ['color', (s) => s.total + 0.8 * s.color.score, (s) => s.total >= floor && s.weather >= weatherFloor && colorful(s)],
    ['easy', (s) => s.total + 0.3 * safeCount(s), (s) => s.total >= floor - 0.3 && s.weather >= weatherFloor && safeCount(s) >= 2],
    ['alt', (s) => s.total, (s) => s.weather >= weatherFloor],
    ['alt', (s) => s.total, () => true],
  ];
  // Every character gets a strict (clearly different) try before any relaxed one.
  for (const strict of [true, false])
    for (const [character, value, ok] of characters) {
      if (picked.length >= 3) break;
      if (character !== 'alt' && picked.some((p) => p.character === character)) continue;
      tryPick(character, value, ok, strict);
    }

  const said = new Set<string>();
  const combos = picked.map(({ s, character }) => explain(s, character, taste, hasForecast, said));
  return { combos, notes };
}

function explain(s: Scored, character: Suggestion['character'], taste: Taste, hasForecast: boolean, said: Set<string>): Suggestion {
  const byCat = (c: Category) => s.pieces.find((g) => g.item.category === c)?.item;
  const stalest = s.pieces
    .filter((g) => g.item.category === 'Top' || g.item.category === 'Outerwear' || g.item.category === 'Bottom')
    .sort((a, b) => (character === 'rediscover' ? taste.daysSince(b.item) - taste.daysSince(a.item) : 0))[0].item;
  const staleDays = taste.daysSince(stalest);

  const title =
    character === 'best'
      ? hasForecast
        ? 'Best for today'
        : 'Best bet'
      : character === 'rediscover'
        ? `Bring back the ${stalest.name.toLowerCase()}`
        : character === 'color'
          ? `${cap(an(s.color.statement!.item.color.name))} ${s.color.statement!.item.color.name.toLowerCase()} moment`
          : character === 'easy'
            ? 'Zero-thought option'
            : 'Another angle';

  const parts: string[] = [];
  // Lead with something this card hasn't said yet; the forecast line only needs saying once.
  const weatherNote = s.weatherNotes.find((n) => n && !said.has(n.replace(/\d+/g, '#')));
  if (weatherNote) {
    parts.push(weatherNote);
    said.add(weatherNote.replace(/\d+/g, '#'));
  }
  if (character === 'rediscover' && staleDays >= 14) parts.push(taste.everWorn(stalest) ? `last out ${staleDays} days ago` : `you haven’t logged the ${stalest.name.toLowerCase()} yet`);
  else if (s.tasteNotes[0]) parts.push(s.tasteNotes[0]);
  const colorNote = s.color.notes.find((n) => !said.has(n));
  if (parts.length < 2 && colorNote) {
    parts.push(colorNote);
    said.add(colorNote);
  }
  if (parts.length < 2 && character === 'easy') parts.push('all go-to pieces');
  if (!parts.length) parts.push(`${byCat('Top')!.name.toLowerCase()} with ${byCat('Bottom')!.name.toLowerCase()}`);
  const why = parts.slice(0, 2).map(cap).join('. ') + '.';

  return {
    key: s.key,
    itemIds: s.ids,
    title,
    why,
    meters: {
      weather: s.weather,
      color: s.color.score,
      fresh: s.fresh,
      you: taste.hasHistory ? (s.you.score + 1) / 2 : null,
    },
    character,
  };
}

function closetNotes(pool: ClothingItem[], day: DayProfile, hasForecast: boolean, best: Scored | undefined): string[] {
  if (!hasForecast) return ['No forecast yet — picks assume a mild day.'];
  const notes: string[] = [];
  const gs = pool.map(garment);
  if (day.rainChance >= 50 && !gs.some((g) => g.waterproof)) notes.push(`${day.rainChance}% rain and nothing waterproof in your closet — a shell would earn its keep.`);
  if (day.coldFeels < 45 && !gs.some((g) => g.item.category === 'Outerwear' && g.warmth >= 0.6)) notes.push(`Feels like ${day.coldFeels}° and no real coat in your closet.`);
  if (day.warmFeels >= 78 && !pool.some((i) => i.category === 'Bottom' && lengthOf(i) === 'shorts')) notes.push(`${day.warmFeels}° this afternoon and no shorts in your closet.`);
  if (best && best.weather < 0.5) notes.push('Your closet is thin for this weather — these are the closest fits.');
  return notes;
}

// ---------- The starter: a nudge in plain garment words, never specific pieces ----------

export interface Starter {
  line: string;
  why: string;
  extras: string[];
}

/** A stand-in garment for the starter's generic outfits. */
function generic(category: Category, name: string, warmth: number, extra: Partial<Garment> = {}): Garment {
  const item = { id: `generic-${name}`, name, category, color: { name: 'Gray', hex: '#888888' }, styleType: 'Plain', dateAdded: '', isFavorite: false, isSafeBet: false, isThrifted: false, contexts: ['everyday'], length: name === 'shorts' ? 'shorts' : 'long' } as ClothingItem;
  return { item, warmth, formality: 1, waterproof: false, windproof: category === 'Outerwear', delicateInWet: false, boots: false, openToe: false, heavy: warmth >= 0.45, ...extra };
}

export function starter(w: Weather | null, items: ClothingItem[], logs: WearLogEntry[], feedback: Feedback[] = []): Starter | null {
  if (!w) return null;
  const day = dayProfile(w);
  const taste = buildTaste(items, logs, feedback);
  const offset = taste.warmthOffset;
  const pool = eligible(items);
  const ownsShorts = pool.some((i) => i.category === 'Bottom' && lengthOf(i) === 'shorts') || !pool.some((i) => i.category === 'Bottom');
  const wet = day.rainChance >= 55;

  // Try every generic outfit against the same hour-by-hour model the combos use.
  const tops = [generic('Top', 'Short-sleeve top', 0.09), generic('Top', 'Long-sleeve top', 0.15), generic('Top', 'Sweater or hoodie', 0.33)];
  const bottoms = [generic('Bottom', 'pants', 0.25), ...(ownsShorts ? [generic('Bottom', 'shorts', 0.07)] : [])];
  const layers: (Garment | null)[] = wet
    ? [generic('Outerwear', 'rain shell', 0.18, { waterproof: true }), generic('Outerwear', 'waterproof jacket', 0.34, { waterproof: true }), generic('Outerwear', 'warm waterproof coat', 0.8, { waterproof: true })]
    : [null, generic('Outerwear', 'light layer', 0.2), generic('Outerwear', 'jacket', 0.34), generic('Outerwear', 'warm coat', 0.7), generic('Outerwear', 'heavy coat', 0.95)];
  const shoes = generic('Shoes', 'shoes', 0.03);

  let best: { score: number; top: Garment; bottom: Garment; layer: Garment | null; th: ThermalResult } | null = null;
  for (const top of tops)
    for (const bottom of bottoms)
      for (const layer of layers) {
        const set = [top, bottom, shoes, ...(layer ? [layer] : [])];
        const th = thermal(set, day, offset);
        if (layer && th.layerHours.length === 0) continue;
        let score = th.score;
        const shorts = bottom.item.name === 'shorts';
        if (shorts) score -= shortsChill(day);
        if (shorts && wet && day.warmFeels < 72) score -= 0.25;
        if (shorts && day.warmFeels >= 68 && day.coldFeels >= 50 && !wet) score += taste.shortsRate === null ? 0.04 : (taste.shortsRate - 0.35) * 0.2;
        if (day.warmFeels >= 82 && top.warmth >= 0.14) score -= 0.25;
        if (day.warmFeels < 55 && top.warmth < 0.2) score -= (0.2 - top.warmth) * 2.5; // what's under the coat indoors
        // Less to carry wins a close call.
        score -= (layer ? 0.025 : 0) + (top.warmth > 0.3 ? 0.01 : 0);
        if (!best || score > best.score) best = { score, top, bottom, layer, th };
      }
  const b = best!;
  const line = `${b.top.item.name} + ${b.bottom.item.name}${b.layer ? ` + ${b.layer.item.name}` : ''}`;

  const whyParts: string[] = [];
  if (day.swing < 6) whyParts.push(`Feels ${day.coldFeels}–${day.warmFeels}° all day`);
  else if (day.coldHour < day.warmHour) whyParts.push(`Feels ${day.coldFeels}° at ${hourLabel(day.coldHour)} → ${day.warmFeels}° by ${hourLabel(day.warmHour)}`);
  else whyParts.push(`Feels ${day.warmFeels}° by ${hourLabel(day.warmHour)}, down to ${day.coldFeels}° by ${hourLabel(day.coldHour)}`);
  if (day.rainChance >= 30) whyParts.push(rainPhrase(day));
  if (day.windy) whyParts.push(`gusty to ${day.windMax} mph`);
  if (b.layer && !wet && b.th.layerHours.length < day.hours.length) {
    const on = b.th.layerHours;
    const off = day.hours.find((h) => h.hour > on[0] && !on.includes(h.hour));
    if (on[0] === day.hours[0].hour && off) whyParts.push(`layer off by ${hourLabel(off.hour)}`);
    else whyParts.push(`layer on from ${hourLabel(on[0])}`);
  }
  const extras: string[] = [];
  if (day.sunny && day.uvMax >= 3) extras.push('shades');
  if (wet || day.snow) extras.push('shoes that can get wet');
  return { line, why: whyParts.join(' · '), extras };
}

/** Replacements for one piece, best first, judged as whole outfits with everything else kept. */
export function rankSwaps(input: SuggestInput, ids: string[], itemId: string): string[] {
  const pool = eligible(input.items);
  const byId = new Map(input.items.map((i) => [i.id, i]));
  const current = byId.get(itemId);
  if (!current) return [];
  const taste = buildTaste(input.items, input.logs, input.feedback, input.today ?? todayKey());
  const day = input.weather ? dayProfile(input.weather) : neutralDay();
  const rest = ids.filter((id) => id !== itemId).map((id) => byId.get(id)).filter((i): i is ClothingItem => !!i);
  return pool
    .filter((i) => i.category === current.category && i.id !== itemId)
    .map((i) => ({ id: i.id, s: scoreOutfit([...rest, i].map(garment), day, taste, !!input.weather).total }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id);
}
