export type Category = 'Top' | 'Bottom' | 'Outerwear' | 'Shoes' | 'Sunglasses' | 'Misc';
export const CATEGORIES: Category[] = ['Top', 'Bottom', 'Outerwear', 'Shoes', 'Sunglasses', 'Misc'];

/** Plural labels for the closet tabs / breakdowns. */
export const CATEGORY_PLURAL: Record<Category, string> = {
  Top: 'Tops',
  Bottom: 'Bottoms',
  Outerwear: 'Outerwear',
  Shoes: 'Shoes',
  Sunglasses: 'Sunglasses',
  Misc: 'Misc.',
};

export type StyleType = 'Graphic' | 'Plain';
export type WearContext = 'everyday' | 'house-only' | 'sports';

export interface ClothingItem {
  id: string;
  name: string;
  category: Category;
  color: { name: string; hex: string };
  styleType: StyleType;
  /** Key into the `photos` store (the spec's photoUrl — blobs live in IndexedDB). */
  photoId?: string;
  /** The photo is a studio cutout (transparent PNG drawn on the studio backdrop); the untouched
   *  original is kept under originalPhotoKey(photoId). */
  photoCutout?: boolean;
  /** Waiting in the studio-photo queue (processed while the app is open). */
  photoPending?: boolean;
  /** The studio cleanup couldn't find a clear garment in this photo; don't retry it automatically. */
  studioFailed?: boolean;
  dateAdded: string;
  isFavorite: boolean;
  isSafeBet: boolean;
  isThrifted: boolean;
  contexts: WearContext[];
  /** Tops only. Older items may lack it; see sleeveOf(). */
  sleeve?: Sleeve;
  /** Bottoms only. Older items may lack it; see lengthOf(). */
  length?: BottomLength;
  material?: Material;
}

export const originalPhotoKey = (photoId: string) => `orig-${photoId}`;

export type Sleeve = 'short' | 'long' | 'sleeveless';
export type BottomLength = 'shorts' | 'long';
export type Material = 'Cotton' | 'Linen' | 'Denim' | 'Wool' | 'Knit' | 'Fleece' | 'Flannel' | 'Synthetic' | 'Leather' | 'Silk';
export const MATERIALS: Material[] = ['Cotton', 'Linen', 'Denim', 'Wool', 'Knit', 'Fleece', 'Flannel', 'Synthetic', 'Leather', 'Silk'];

// Items added before these fields existed get a best guess from their name.
export function sleeveOf(item: ClothingItem): Sleeve {
  if (item.sleeve) return item.sleeve;
  const n = item.name.toLowerCase();
  if (/tank|sleeveless|vest/.test(n)) return 'sleeveless';
  if (/long.?sleeve|\bls\b|flannel|oxford|button|shirt jacket|sweater|hoodie|crewneck|cardigan|turtleneck|henley|rugby/.test(n)) return 'long';
  return 'short';
}

export function lengthOf(item: ClothingItem): BottomLength {
  if (item.length) return item.length;
  return /short/.test(item.name.toLowerCase()) ? 'shorts' : 'long';
}

export interface WearLogEntry {
  id: string;
  itemIds: string[];
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  source: 'manual' | 'suggested';
  /** Feels-like range during the day it was worn, stamped when logged (lets the engine learn his comfort). */
  weather?: { feelsMin: number; feelsMax: number };
  /** A day can have several fits ("Day", "Night out"…). Each entry is one fit. */
  label?: string;
  /** Orders a day's fits; older single-fit entries lack it and count as the first. */
  createdAt?: number;
}

/** A day's fits, first to last. */
export function fitsOn(logs: WearLogEntry[], date: string): WearLogEntry[] {
  return logs.filter((l) => l.date === date).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

/** What to call a fit when it has no name. */
export const fitName = (fit: Pick<WearLogEntry, 'label'>, index: number) => fit.label || (index === 0 ? 'Day' : `Fit ${index + 1}`);

/** A reaction to a suggested outfit; the engine learns which pairings he likes. */
export interface Feedback {
  id: string;
  itemIds: string[];
  verdict: 'like' | 'dislike';
  date: string;
}

export const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Cream', hex: '#EFE6D2' },
  { name: 'Gray', hex: '#9B9B93' },
  { name: 'Black', hex: '#111111' },
  { name: 'Navy', hex: '#1F2F4F' },
  { name: 'Blue', hex: '#3A6EA5' },
  { name: 'Green', hex: '#4C8C5C' },
  { name: 'Olive', hex: '#6B6B3A' },
  { name: 'Tan', hex: '#C9A574' },
  { name: 'Brown', hex: '#7A5230' },
  { name: 'Red', hex: '#C0392B' },
  { name: 'Burgundy', hex: '#6D1F2B' },
  { name: 'Pink', hex: '#E8A0B4' },
  { name: 'Purple', hex: '#8E7CC3' },
  { name: 'Yellow', hex: '#E6C84B' },
  { name: 'Orange', hex: '#E07B39' },
  { name: 'Gold', hex: '#D4AF37' },
];
