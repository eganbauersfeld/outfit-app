import { lengthOf, sleeveOf, type ClothingItem, type Material } from '../types';

// Everything the engine infers about a single piece, from its category, sleeves/length,
// material and — because older items have few tags — keywords in its name.

export interface Garment {
  item: ClothingItem;
  /** Insulation in clo-like units (a T-shirt ≈ 0.09, jeans ≈ 0.25, a parka ≈ 0.9). */
  warmth: number;
  /** 0 athletic · 1 casual · 2 smart-casual · 3 dressy */
  formality: number;
  waterproof: boolean;
  windproof: boolean;
  /** Shoes that suffer in rain: white/canvas sneakers, suede, sandals. */
  delicateInWet: boolean;
  boots: boolean;
  openToe: boolean;
  heavy: boolean; // a real cold-weather piece (coat, wool sweater, fleece)
}

const has = (name: string, re: RegExp) => re.test(name.toLowerCase());

const MATERIAL_WARMTH: Record<Material, number> = {
  Linen: 0.7,
  Silk: 0.8,
  Cotton: 1,
  Synthetic: 1,
  Denim: 1.15,
  Leather: 1.3,
  Flannel: 1.35,
  Knit: 1.45,
  Wool: 1.6,
  Fleece: 1.6,
};

function materialFromName(n: string): Material | undefined {
  if (has(n, /linen/)) return 'Linen';
  if (has(n, /silk|satin/)) return 'Silk';
  if (has(n, /denim|jean/)) return 'Denim';
  if (has(n, /flannel/)) return 'Flannel';
  if (has(n, /fleece|sherpa/)) return 'Fleece';
  if (has(n, /wool|merino|cashmere|tweed/)) return 'Wool';
  if (has(n, /knit|sweater|cardigan/)) return 'Knit';
  if (has(n, /leather|suede/)) return 'Leather';
  if (has(n, /shell|rain|nylon|windbreaker|gore|puffer|down/)) return 'Synthetic';
  return undefined;
}

/** [warmth, specific] — specific means the name already implies the fabric, so no material multiplier. */
function baseWarmth(i: ClothingItem): [number, boolean] {
  const n = i.name;
  switch (i.category) {
    case 'Top': {
      if (has(n, /tank|sleeveless|muscle/)) return [0.05, false];
      if (has(n, /hoodie|sweatshirt|crewneck|pullover|quarter.?zip|fleece/)) return [0.32, true];
      if (has(n, /sweater|jumper/)) return [has(n, /cotton|linen/) ? 0.27 : 0.34, true];
      if (has(n, /cardigan|overshirt|shacket|shirt jacket/)) return [0.26, true];
      if (has(n, /turtleneck|mock/)) return [0.22, false];
      if (has(n, /flannel|rugby/)) return [0.2, true];
      const sleeve = sleeveOf(i);
      return [sleeve === 'long' ? 0.15 : sleeve === 'sleeveless' ? 0.05 : 0.09, false];
    }
    case 'Bottom': {
      if (lengthOf(i) === 'shorts') return [has(n, /swim|running|gym/) ? 0.04 : 0.07, false];
      if (has(n, /sweat|jogger|fleece/)) return [0.27, true];
      if (has(n, /cord|wool|flannel/)) return [0.3, true];
      if (has(n, /linen/)) return [0.15, true];
      return [0.24, false];
    }
    case 'Outerwear': {
      if (has(n, /parka|puffer|down|arctic|insulated/)) return [0.95, true];
      if (has(n, /coat|peacoat|overcoat|topcoat|duffle|shearling/)) return [0.7, true];
      if (has(n, /fleece|sherpa/)) return [0.42, true];
      if (has(n, /blazer|sport coat/)) return [0.3, true];
      if (has(n, /vest|gilet/)) return [0.2, true];
      if (has(n, /shell|rain|windbreaker|anorak/)) return [0.18, true];
      if (has(n, /denim|jean|trucker|chore|bomber|harrington|field/)) return [0.34, true];
      return [0.35, false];
    }
    case 'Shoes':
      if (has(n, /sandal|slide|flip/)) return [0.01, true];
      if (has(n, /boot/)) return [0.07, true];
      return [0.03, true];
    case 'Misc':
      if (has(n, /beanie|scarf|glove|toque/)) return [0.06, true];
      return [0, true];
    default:
      return [0, true];
  }
}

function formality(i: ClothingItem): number {
  const n = i.name;
  if (has(n, /gym|athletic|running|jogger|sweatpant|slide|basketball|track/)) return 0;
  if (has(n, /blazer|suit|dress shirt|trouser|slacks|loafer|derby|oxford shoe|dress shoe|brogue/)) return 3;
  if (has(n, /oxford|button|polo|chino|cardigan|knit|sweater|overshirt|trench|peacoat|overcoat|coat|boot|leather|turtleneck|corduroy|cord/)) return 2;
  if (has(n, /hoodie|sweatshirt|tee|t-shirt|tank|shorts|sneaker|trainer|cap/)) return i.styleType === 'Graphic' ? 0.8 : 1;
  if (i.category === 'Bottom' && lengthOf(i) === 'shorts') return 0.9;
  if (i.category === 'Outerwear') return 1.5;
  return i.styleType === 'Graphic' ? 0.8 : 1.2;
}

const cache = new WeakMap<ClothingItem, Garment>();

export function garment(i: ClothingItem): Garment {
  const hit = cache.get(i);
  if (hit) return hit;
  const n = i.name;
  const material = i.material ?? materialFromName(n);
  const [base, specific] = baseWarmth(i);
  const warmth = base * (material && !specific ? MATERIAL_WARMTH[material] : 1);
  const color = i.color.name.toLowerCase();
  const g: Garment = {
    item: i,
    warmth: Math.round(warmth * 100) / 100,
    formality: formality(i),
    waterproof: i.category === 'Outerwear' && (has(n, /rain|shell|gore|waterproof|anorak|mac\b|slicker|parka/) || (material === 'Synthetic' && !has(n, /fleece/))),
    windproof: i.category === 'Outerwear' && !has(n, /cardigan|vest|fleece/),
    delicateInWet: i.category === 'Shoes' && (has(n, /suede|canvas|sandal|slide|espadrille|mesh/) || (/white|cream|ivory/.test(color) && !has(n, /boot/))),
    boots: i.category === 'Shoes' && has(n, /boot/),
    openToe: i.category === 'Shoes' && has(n, /sandal|slide|flip/),
    heavy: warmth >= 0.45 || (i.category === 'Top' && warmth >= 0.3),
  };
  cache.set(i, g);
  return g;
}
