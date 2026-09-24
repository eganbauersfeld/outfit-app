import type { Garment } from './garment';

// Menswear-flavored color sense: neutrals (including navy, olive, tan and denim blue) go with
// anything; one statement color pops; two statements need a real relationship; three is a lot.

export interface Lab {
  L: number;
  a: number;
  b: number;
  C: number; // chroma
  h: number; // hue angle 0–360
}

export function toLab(hex: string): Lab {
  let s = hex.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s, 16) || 0;
  const lin = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = lin((n >> 16) & 255);
  const g = lin((n >> 8) & 255);
  const b = lin(n & 255);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const L = 116 * f(y) - 16;
  const A = 500 * (f(x) - f(y));
  const B = 200 * (f(y) - f(z));
  return { L, a: A, b: B, C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

const NEUTRAL_NAMES = /white|cream|ivory|ecru|beige|tan|khaki|camel|stone|sand|oat|brown|chocolate|gray|grey|charcoal|black|navy|olive|denim|indigo|taupe|mocha/;

export interface Swatch {
  lab: Lab;
  neutral: boolean;
  family: 'black' | 'white' | 'gray' | 'navy' | 'earth' | 'denim' | 'color';
}

export function swatch(name: string, hex: string, material?: string): Swatch {
  const lab = toLab(hex);
  const n = name.toLowerCase();
  let family: Swatch['family'] = 'color';
  if (/black/.test(n) || lab.L < 18) family = 'black';
  else if (/white|cream|ivory|ecru/.test(n) || (lab.L > 90 && lab.C < 12)) family = 'white';
  else if (/navy|indigo/.test(n) || (lab.L < 35 && lab.b < -12 && lab.C < 45)) family = 'navy';
  else if (material === 'Denim' || /denim/.test(n)) family = 'denim';
  else if (/gray|grey|charcoal|silver/.test(n) || lab.C < 10) family = 'gray';
  else if (/beige|tan|khaki|camel|stone|sand|oat|brown|chocolate|olive|taupe|mocha/.test(n)) family = 'earth';
  // A washed-out mid blue is denim-like and reads neutral in practice.
  const denimLike = lab.h > 230 && lab.h < 290 && lab.C < 38 && lab.L > 30 && lab.L < 65;
  const neutral = family !== 'color' || NEUTRAL_NAMES.test(n) || lab.C < 16 || denimLike;
  return { lab, neutral, family: family === 'color' && denimLike ? 'denim' : family };
}

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export interface ColorResult {
  score: number; // 0 … 1
  notes: string[]; // positives, most specific first
  flags: string[]; // problems
  statement: Garment | null; // the piece that carries the color, if one does
}

export function colorHarmony(pieces: Garment[]): ColorResult {
  const visible = pieces.filter((g) => g.item.category !== 'Sunglasses' && g.item.category !== 'Misc');
  const sw = new Map(visible.map((g) => [g, swatch(g.item.color.name, g.item.color.hex, g.item.material)]));
  const top = visible.find((g) => g.item.category === 'Top');
  const bottom = visible.find((g) => g.item.category === 'Bottom');
  const outer = visible.find((g) => g.item.category === 'Outerwear');
  const shoes = visible.find((g) => g.item.category === 'Shoes');
  let s = 0.6;
  const notes: string[] = [];
  const flags: string[] = [];

  const statements = visible.filter((g) => !sw.get(g)!.neutral);
  const clothingStatements = statements.filter((g) => g.item.category !== 'Shoes');
  if (clothingStatements.length === 0) {
    s += 0.12;
    const names = [...new Set(visible.filter((g) => g.item.category !== 'Shoes').map((g) => g.item.color.name.toLowerCase()))];
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    notes.push(names.length >= 2 ? `all neutrals — ${list}` : 'an easy all-neutral palette');
  } else if (clothingStatements.length === 1) {
    s += 0.22;
    // Name what the color sits against — more useful than "one pop of color".
    const it = clothingStatements[0].item;
    const n = it.name.toLowerCase();
    const c = it.color.name.toLowerCase();
    const label = (g: Garment) => {
      const gn = g.item.name.toLowerCase();
      const gc = g.item.color.name.toLowerCase();
      return gn.includes(gc) ? gn : `${gc} ${gn}`;
    };
    const partner = clothingStatements[0].item.category === 'Top' ? bottom : top;
    notes.push(partner ? `${label(clothingStatements[0])} with ${label(partner)}` : `the ${n.includes(c) ? n : `${c} ${n}`} carries the color`);
  } else {
    const hs = clothingStatements.map((g) => sw.get(g)!.lab.h);
    let worstGap = 0;
    let related = true;
    for (let i = 0; i < hs.length; i++)
      for (let j = i + 1; j < hs.length; j++) {
        const gap = hueGap(hs[i], hs[j]);
        worstGap = Math.max(worstGap, gap);
        if (!(gap < 35 || (gap > 150 && hs.length === 2))) related = false;
      }
    if (related && worstGap < 35) {
      s += 0.14;
      notes.push('colors from the same family');
    } else if (related) {
      s += 0.06;
      notes.push('complementary colors');
    } else {
      s -= 0.28 + 0.1 * (clothingStatements.length - 2);
      flags.push('the colors compete');
    }
  }

  if (top && bottom) {
    const a = sw.get(top)!;
    const b = sw.get(bottom)!;
    const dL = Math.abs(a.lab.L - b.lab.L);
    if (dL >= 22) {
      s += 0.1;
      notes.push(`${a.lab.L > b.lab.L ? 'light top over a darker bottom' : 'dark top over a lighter bottom'}`);
    } else if (dL < 8 && hueGap(a.lab.h, b.lab.h) < 25 && a.family !== 'black' && a.family !== 'white') {
      // Same mid-tone top and bottom reads like a uniform unless it's a deliberate neutral tonal look.
      if (a.neutral && b.neutral && a.family === 'earth') {
        s += 0.04;
        notes.push('a tonal earth-tone look');
      } else {
        s -= 0.15;
        flags.push('top and bottom are too close in color');
      }
    }
    const denimTop = a.family === 'denim' || top.item.material === 'Denim' || /denim|chambray|jean/i.test(top.item.name);
    const denimBottom = b.family === 'denim' || bottom.item.material === 'Denim' || /jean|denim/i.test(bottom.item.name);
    if (denimTop && denimBottom && dL < 25) {
      s -= 0.2;
      flags.push('denim on denim in the same wash');
    }
    if ((a.family === 'black' && b.family === 'navy') || (a.family === 'navy' && b.family === 'black')) {
      s -= 0.08;
      flags.push('black next to navy');
    }
  }

  if (outer && top) {
    const o = sw.get(outer)!;
    const t = sw.get(top)!;
    if (!o.neutral && !t.neutral && hueGap(o.lab.h, t.lab.h) > 35 && hueGap(o.lab.h, t.lab.h) < 150) {
      s -= 0.12;
      flags.push('the layer fights the top');
    }
  }

  if (shoes) {
    const sh = sw.get(shoes)!;
    if (!sh.neutral) {
      const echo = visible.some((g) => g !== shoes && !sw.get(g)!.neutral && hueGap(sw.get(g)!.lab.h, sh.lab.h) < 28);
      if (echo) {
        s += 0.08;
        notes.push('shoes pick up the color above');
      } else if (clothingStatements.length) {
        s -= 0.1;
        flags.push('loud shoes on top of a loud outfit');
      }
    }
    if (bottom && sw.get(bottom)!.family === 'black' && sh.family === 'earth' && /brown|chocolate|tan/i.test(shoes.item.color.name)) {
      s -= 0.05;
    }
  }

  const graphics = visible.filter((g) => g.item.styleType === 'Graphic');
  if (graphics.length >= 2) {
    s -= 0.25;
    flags.push('two graphic pieces');
  } else if (graphics.length === 1 && clothingStatements.some((g) => g !== graphics[0])) {
    s -= 0.06;
  }

  return { score: Math.max(0, Math.min(1, s)), notes, flags, statement: clothingStatements[0] ?? null };
}
