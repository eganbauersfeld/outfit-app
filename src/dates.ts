/** Local-time YYYY-MM-DD. */
export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86400000);
}

export function shortLabel(key: string): string {
  return fromKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function dayOfYear(d = new Date()): number {
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
}

/** Monday of the week containing `key`. */
export function weekStart(key: string): string {
  const d = fromKey(key);
  const offset = (d.getDay() + 6) % 7;
  return addDays(key, -offset);
}
