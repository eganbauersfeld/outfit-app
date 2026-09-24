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
  dateAdded: string;
  isFavorite: boolean;
  isSafeBet: boolean;
  isThrifted: boolean;
  contexts: WearContext[];
}

export interface WearLogEntry {
  id: string;
  itemIds: string[];
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  source: 'manual' | 'suggested';
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
