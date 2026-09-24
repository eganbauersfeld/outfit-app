import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import type { ClothingItem, Feedback } from '../types';
import { closet, forecast, log, seeded, TODAY } from './fixtures';
import { colorHarmony } from './color';
import { garment } from './garment';
import { starter, suggest, type SuggestInput } from './stylist';
import { buildTaste } from './taste';

const items = closet();
const byId = new Map(items.map((i) => [i.id, i]));
const run = (over: Partial<SuggestInput> = {}) =>
  suggest({ items, logs: [], feedback: [], weather: null, today: TODAY, random: seeded(), ...over });
const pieces = (ids: string[]) => ids.map((id) => byId.get(id)!) as ClothingItem[];
const cats = (ids: string[]) => pieces(ids).map((i) => i.category);
const find = (ids: string[], cat: ClothingItem['category']) => pieces(ids).find((i) => i.category === cat);

const HOT = forecast({ morning: 80, peak: 93, icon: 'sun', uv: 9 });
const COLD = forecast({ morning: 26, peak: 37, icon: 'cloud', uv: 1 });
const SWING = forecast({ morning: 53, peak: 70, icon: 'partly', uv: 2 });
const RAIN = forecast({ morning: 58, peak: 63, precip: 85, icon: 'rain', uv: 1 });
const MILD = forecast({ morning: 66, peak: 74, icon: 'partly', uv: 4 });

describe('weather', () => {
  it('hot day: shorts, short sleeves, no layer, shades', () => {
    const r = run({ weather: HOT });
    expect(r.combos).toHaveLength(3);
    for (const c of r.combos) {
      expect(find(c.itemIds, 'Bottom')!.length).toBe('shorts');
      expect(garment(find(c.itemIds, 'Top')!).warmth).toBeLessThanOrEqual(0.12);
      expect(cats(c.itemIds)).not.toContain('Outerwear');
    }
    expect(cats(r.combos[0].itemIds)).toContain('Sunglasses');
    expect(starter(HOT, items, [])!.line).toBe('Short-sleeve top + shorts');
  });

  it('cold day: pants, a real coat, nothing open-toed', () => {
    const r = run({ weather: COLD });
    for (const c of r.combos) {
      expect(find(c.itemIds, 'Bottom')!.length).toBe('long');
      const outer = find(c.itemIds, 'Outerwear');
      expect(outer).toBeDefined();
      // A real coat, or a fleece over a warm top — enough insulation either way.
      expect(garment(outer!).warmth).toBeGreaterThanOrEqual(0.4);
      expect(pieces(c.itemIds).map(garment).reduce((s, g) => s + (g.item.category === 'Bottom' ? g.warmth / 2 : g.warmth), 0)).toBeGreaterThanOrEqual(0.95);
      expect(find(c.itemIds, 'Shoes')!.name).not.toBe('Sandals');
    }
    expect(starter(COLD, items, [])!.line).toMatch(/warm coat/);
  });

  it('swing day (53° → 70°): long-sleeve top + shorts', () => {
    // His own go-to for a cool morning and warm afternoon (a light layer for 8AM is a fair extra).
    expect(starter(SWING, items, [])!.line).toMatch(/^Long-sleeve top \+ shorts/);
    const best = run({ weather: SWING }).combos[0];
    const top = find(best.itemIds, 'Top')!;
    const layered = cats(best.itemIds).includes('Outerwear');
    // Either long sleeves or a layer for the cool start.
    expect(garment(top).warmth >= 0.14 || layered).toBe(true);
  });

  it('rain: a waterproof layer, no white sneakers or sandals', () => {
    const r = run({ weather: RAIN });
    const best = r.combos[0];
    expect(garment(find(best.itemIds, 'Outerwear')!).waterproof).toBe(true);
    for (const c of r.combos) {
      const shoes = find(c.itemIds, 'Shoes')!;
      expect(garment(shoes).delicateInWet).toBe(false);
    }
    expect(starter(RAIN, items, [])!.line).toMatch(/rain shell|waterproof/);
    expect(best.why.toLowerCase()).toMatch(/rain|boots/);
  });

  it('no carrying a jacket on a hot day, even if it scores on color', () => {
    const r = run({ weather: HOT });
    expect(r.combos.every((c) => !cats(c.itemIds).includes('Outerwear'))).toBe(true);
  });

  it('shades only when it is sunny', () => {
    const r = run({ weather: forecast({ morning: 60, peak: 68, icon: 'cloud', uv: 1 }) });
    expect(r.combos.every((c) => !cats(c.itemIds).includes('Sunglasses'))).toBe(true);
  });
});

describe('closet rules', () => {
  it('never suggests house-only or sports-only pieces', () => {
    for (const w of [HOT, COLD, SWING, RAIN, MILD]) {
      for (const c of run({ weather: w }).combos) {
        expect(c.itemIds).not.toContain('b-gym');
        expect(c.itemIds).not.toContain('b-sweats');
      }
    }
  });

  it('never pairs two graphic pieces', () => {
    for (const w of [HOT, MILD, SWING]) {
      for (const c of run({ weather: w, jitter: 0.3 }).combos) {
        expect(pieces(c.itemIds).filter((i) => i.styleType === 'Graphic').length).toBeLessThan(2);
      }
    }
  });

  it('color logic: one pop of color beats competing colors; same-wash denim is flagged', () => {
    const calm = colorHarmony(pieces(['t-rust', 'b-chinos', 's-white']).map(garment));
    const clash = colorHarmony(pieces(['t-graphic2', 'b-chinos', 't-flannel']).map(garment));
    expect(calm.score).toBeGreaterThan(0.75);
    expect(calm.notes.join(' ')).toMatch(/rust tee with khaki chinos/);
    const denim = colorHarmony(pieces(['t-oxford', 'b-jeans', 'o-denim']).map(garment));
    const jeansJacket = colorHarmony([garment({ ...byId.get('t-oxford')!, material: 'Denim', name: 'Denim Shirt', color: { name: 'Blue', hex: '#3E6390' } }), garment(byId.get('b-jeans')!)]);
    expect(jeansJacket.flags).toContain('denim on denim in the same wash');
    expect(clash.score).toBeLessThan(calm.score);
    expect(denim.score).toBeGreaterThan(0);
  });

  it('three picks with three different tops', () => {
    const r = run({ weather: MILD });
    const tops = r.combos.map((c) => find(c.itemIds, 'Top')!.id);
    expect(new Set(tops).size).toBe(3);
  });
});

describe('history & learning', () => {
  it('does not repeat yesterday’s top', () => {
    const logs = [log(addDays(TODAY, -1), ['t-oxford', 'b-shorts', 's-white'])];
    for (const c of run({ weather: MILD, logs }).combos) expect(c.itemIds).not.toContain('t-oxford');
  });

  it('brings back something neglected', () => {
    // Everything but the flannel worn in the last two weeks.
    const logs = [];
    const worn = ['t-white', 't-black', 't-rust', 't-ls-gray', 't-oxford', 't-sweater', 't-hoodie', 't-linen', 't-band', 't-graphic2'];
    for (let d = 1; d <= 20; d++) logs.push(log(addDays(TODAY, -d), [worn[d % worn.length], d % 2 ? 'b-jeans' : 'b-chinos', 's-white']));
    const r = run({ weather: SWING, logs });
    const re = r.combos.find((c) => c.character === 'rediscover');
    expect(re).toBeDefined();
    expect(re!.title.toLowerCase()).toMatch(/bring back/);
    // The neglected flannel surfaces — as the best pick or as the one being brought back.
    expect(r.combos.slice(0, 2).some((c) => c.itemIds.includes('t-flannel'))).toBe(true);
  });

  it('a disliked outfit never comes back, and its pairs are penalised', () => {
    const first = run({ weather: MILD }).combos[0];
    const fb: Feedback[] = [{ id: 'f1', itemIds: first.itemIds, verdict: 'dislike', date: TODAY }];
    const again = run({ weather: MILD, feedback: fb });
    expect(again.combos.map((c) => c.key)).not.toContain(first.key);
  });

  it('learns that he runs cold', () => {
    // At 75° he keeps wearing a hoodie and jeans.
    const logs = [];
    for (let d = 1; d <= 14; d++) logs.push(log(addDays(TODAY, -d), ['t-hoodie', 'b-jeans', 's-white'], { feelsMin: 66, feelsMax: 75 }));
    const taste = buildTaste(items, logs, [], TODAY);
    expect(taste.warmthOffset).toBeGreaterThan(0.08);
    const neutral = starter(MILD, items, [])!.line;
    const personal = starter(MILD, items, logs)!.line;
    expect(neutral).toMatch(/shorts/);
    expect(personal).not.toBe(neutral);
  });

  it('learns he doesn’t wear shorts, even on warm days', () => {
    const logs = [];
    for (let d = 1; d <= 10; d++) logs.push(log(addDays(TODAY, -d), [d % 2 ? 't-white' : 't-black', 'b-chinos', 's-white'], { feelsMin: 64, feelsMax: 76 }));
    expect(buildTaste(items, logs, [], TODAY).shortsRate).toBe(0);
    expect(starter(MILD, items, logs)!.line).toMatch(/pants/);
    const r = run({ weather: MILD, logs });
    expect(find(r.combos[0].itemIds, 'Bottom')!.length).toBe('long');
  });

  it('knows which pieces he actually pairs', () => {
    const logs = [];
    for (let d = 3; d <= 30; d += 3) logs.push(log(addDays(TODAY, -d), ['t-black', 'b-chinos', 's-boots']));
    const taste = buildTaste(items, logs, [], TODAY);
    expect(taste.pairing(['t-black', 'b-chinos']).score).toBeGreaterThan(taste.pairing(['t-black', 'b-shorts']).score);
    expect(taste.pairing(['t-black', 'b-chinos', 's-boots']).reason).toMatch(/times/);
  });
});

describe('controls', () => {
  it('builds every outfit around an anchor piece', () => {
    const r = run({ weather: SWING, anchorId: 't-flannel' });
    expect(r.combos.length).toBeGreaterThan(0);
    for (const c of r.combos) expect(c.itemIds).toContain('t-flannel');
  });

  it('"try three more" gives new outfits', () => {
    const first = run({ weather: MILD });
    const second = run({ weather: MILD, exclude: new Set(first.combos.map((c) => c.key)) });
    for (const c of second.combos) expect(first.combos.map((x) => x.key)).not.toContain(c.key);
  });

  it('works without a forecast, and asks for tops/bottoms when missing', () => {
    const r = run();
    expect(r.combos).toHaveLength(3);
    expect(r.notes[0]).toMatch(/No forecast/);
    const empty = suggest({ items: items.filter((i) => i.category !== 'Top'), logs: [], feedback: [], weather: MILD, today: TODAY });
    expect(empty.missing).toEqual(['a top']);
  });

  it('flags closet gaps', () => {
    const noShell = items.filter((i) => i.id !== 'o-shell' && i.id !== 'o-puffer');
    const r = suggest({ items: noShell, logs: [], feedback: [], weather: RAIN, today: TODAY });
    expect(r.notes.join(' ')).toMatch(/nothing waterproof/);
  });

  it('stays fast on a big closet', () => {
    const big = [...items, ...items.map((i) => ({ ...i, id: i.id + '-2' })), ...items.map((i) => ({ ...i, id: i.id + '-3' }))];
    const t0 = performance.now();
    suggest({ items: big, logs: [], feedback: [], weather: SWING, today: TODAY });
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

it('prints small-closet and personalised output', () => {
  const small = items.filter((i) => ['t-white', 't-oxford', 't-flannel', 'b-jeans', 'b-shorts', 's-white', 'o-denim'].includes(i.id));
  const r = suggest({ items: small, logs: [], feedback: [], weather: SWING, today: TODAY, random: seeded() });
  console.log('\n=== SMALL CLOSET, SWING');
  for (const c of r.combos) console.log(`  [${c.title}] ${pieces(c.itemIds).map((i) => i.name).join(' + ')} — ${c.why}`);
  // Three weeks of habits: black tee + chinos + boots a lot, runs a little cold, liked one outfit.
  const logs = [];
  const rot = [['t-black', 'b-chinos', 's-boots'], ['t-oxford', 'b-jeans', 's-white'], ['t-white', 'b-chinos', 's-boots'], ['t-ls-gray', 'b-jeans', 's-black']];
  for (let d = 1; d <= 21; d++) logs.push(log(addDays(TODAY, -d), rot[d % rot.length], { feelsMin: 58, feelsMax: 70 }));
  const fb = [{ id: 'f', itemIds: ['t-rust', 'b-chinos', 's-boots'], verdict: 'like' as const, date: TODAY }];
  const p = suggest({ items, logs, feedback: fb, weather: MILD, today: TODAY, random: seeded() });
  console.log(`\n=== PERSONALISED, MILD (offset ${buildTaste(items, logs, fb, TODAY).warmthOffset.toFixed(2)}): ${starter(MILD, items, logs, fb)!.line}`);
  for (const c of p.combos) console.log(`  [${c.title}] ${pieces(c.itemIds).map((i) => i.name).join(' + ')} — ${c.why}  you=${c.meters.you?.toFixed(2)}`);
});

it('prints sample output for eyeballing', () => {
  for (const [name, w] of [['HOT', HOT], ['COLD', COLD], ['SWING', SWING], ['RAIN', RAIN], ['MILD', MILD]] as const) {
    const r = run({ weather: w });
    const s = starter(w, items, [])!;
    console.log(`\n=== ${name}: ${s.line} — ${s.why}${s.extras.length ? ` (+ ${s.extras.join(', ')})` : ''}`);
    for (const c of r.combos) {
      console.log(`  [${c.title}] ${pieces(c.itemIds).map((i) => i.name).join(' + ')}`);
      console.log(`     ${c.why}  (weather ${c.meters.weather.toFixed(2)}, color ${c.meters.color.toFixed(2)})`);
    }
    for (const n of r.notes) console.log(`  note: ${n}`);
  }
});
