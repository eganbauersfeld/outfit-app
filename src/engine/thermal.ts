import type { DayProfile } from './day';
import type { Garment } from './garment';

// How warm an outfit needs to be, hour by hour, and how well a given outfit tracks that.
// Units are clo-like (see garment.ts). The curve assumes walking around a campus/city,
// not sitting still — so it's lighter than office-comfort tables.

// Calibrated on "effective" warmth, where bare legs count about half as much as the torso:
// walking keeps legs warm, and a long sleeve + shorts on a 53°→70° day is a real outfit.
const CURVE: [number, number][] = [
  [95, 0.12],
  [88, 0.14],
  [80, 0.16],
  [74, 0.18],
  [70, 0.21],
  [66, 0.25],
  [60, 0.32],
  [55, 0.41],
  [50, 0.52],
  [45, 0.64],
  [40, 0.82],
  [32, 1.05],
  [20, 1.32],
  [5, 1.62],
];

/** The middle of the day counts most; a brisk walk at 8AM or a cool evening is tolerable. */
const hourWeight = (h: number) => (h < 10 ? 0.55 : h > 18 ? 0.7 : 1);

/** Legs tolerate cold far better than the torso. */
export const LEG_WEIGHT = 0.5;
export const effectiveWarmth = (g: Garment) => (g.item.category === 'Bottom' ? g.warmth * LEG_WEIGHT : g.warmth);

/** Warmth needed at a feels-like °F, shifted by his learned offset (positive = he runs cold). */
export function targetWarmth(feels: number, offset = 0): number {
  let t: number;
  if (feels >= CURVE[0][0]) t = CURVE[0][1];
  else if (feels <= CURVE[CURVE.length - 1][0]) t = CURVE[CURVE.length - 1][1];
  else {
    t = CURVE[CURVE.length - 1][1];
    for (let k = 0; k < CURVE.length - 1; k++) {
      const [f1, c1] = CURVE[k];
      const [f2, c2] = CURVE[k + 1];
      if (feels <= f1 && feels >= f2) {
        t = c2 + ((feels - f2) / (f1 - f2)) * (c1 - c2);
        break;
      }
    }
  }
  return Math.max(0.1, t + offset);
}

export interface ThermalResult {
  /** 0 (miserable) … 1 (comfortable all day) */
  score: number;
  base: number; // without the outer layer
  full: number; // with it
  /** Hours the layer should be on. */
  layerHours: number[];
  worst: { hour: number; kind: 'cold' | 'hot'; by: number } | null;
}

/** Wind strips warmth from anything not windproof; the feels-like figure covers the rest. */
function effective(pieces: Garment[], windMph: number) {
  const outer = pieces.find((g) => g.item.category === 'Outerwear');
  const loss = windMph >= 15 && !(outer && outer.windproof) ? 0.9 : 1;
  return pieces.reduce((s, g) => s + effectiveWarmth(g), 0) * loss;
}

export function thermal(pieces: Garment[], day: DayProfile, offset = 0): ThermalResult {
  const outer = pieces.find((g) => g.item.category === 'Outerwear');
  const inner = pieces.filter((g) => g !== outer);
  let penalty = 0;
  let weights = 0;
  const layerHours: number[] = [];
  let worst: ThermalResult['worst'] = null;

  for (const h of day.hours) {
    const need = targetWarmth(h.feels, offset);
    const without = effective(inner, h.wind);
    const withLayer = outer ? effective(pieces, h.wind) : without;
    // He puts the layer on whenever it gets him closer to comfortable — and in rain it's on regardless.
    const errNo = without - need;
    const errYes = withLayer - need;
    const raining = h.precip >= 50 || h.icon === 'rain' || h.icon === 'storm' || h.icon === 'snow';
    const useLayer = !!outer && (raining || Math.abs(errYes) < Math.abs(errNo));
    if (useLayer) layerHours.push(h.hour);
    const err = useLayer ? errYes : errNo;
    // Being cold is worse than being a little warm; both grow faster than linearly.
    const tol = 0.03 + need * 0.06;
    const over = Math.max(0, Math.abs(err) - tol);
    // Scale by need so a 0.05 miss matters more on a hot day than a cold one — but not so much
    // that big cold-weather misses shrink to nothing.
    const hourPenalty = (err < 0 ? 1.35 : 1) * (over / Math.min(Math.max(need, 0.2), 0.45)) ** 1.4;
    penalty += hourPenalty * hourWeight(h.hour);
    weights += hourWeight(h.hour);
    if (over > 0 && (!worst || over > worst.by)) worst = { hour: h.hour, kind: err < 0 ? 'cold' : 'hot', by: Math.round(over * 100) / 100 };
  }

  const mean = penalty / Math.max(weights, 1);
  return {
    score: Math.max(0, 1 - mean * 1.6),
    base: Math.round(inner.reduce((s, g) => s + effectiveWarmth(g), 0) * 100) / 100,
    full: Math.round(pieces.reduce((s, g) => s + effectiveWarmth(g), 0) * 100) / 100,
    layerHours,
    worst,
  };
}
