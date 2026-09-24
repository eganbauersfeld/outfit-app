import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as db from './db';
import { dayProfile } from './engine/day';
import { todayKey } from './dates';
import { originalPhotoKey, type ClothingItem, type Feedback, type WearLogEntry } from './types';
import { readCachedWeather } from './weather';

// ---------- Closet + wear log ----------

interface Store {
  ready: boolean;
  items: ClothingItem[];
  logs: WearLogEntry[];
  feedback: Feedback[];
  itemsById: Map<string, ClothingItem>;
  /** photo: new display photo (null removes it). original: the untouched photo, kept when `photo` is a studio cutout. */
  saveItem: (item: ClothingItem, photo?: Blob | null, original?: Blob) => Promise<void>;
  removeItem: (item: ClothingItem) => Promise<void>;
  toggleLogged: (date: string, itemId: string) => Promise<void>;
  logOutfit: (date: string, itemIds: string[]) => Promise<void>;
  react: (itemIds: string[], verdict: Feedback['verdict']) => Promise<void>;
  reload: () => Promise<void>;
}

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [logs, setLogs] = useState<WearLogEntry[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);

  const reload = useCallback(async () => {
    const data = await db.loadAll();
    setItems(data.items.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)));
    setLogs(data.logs);
    setFeedback(data.feedback);
    setReady(true);
  }, []);

  useEffect(() => {
    reload();
    // Ask iOS/Chrome not to evict IndexedDB under storage pressure.
    navigator.storage?.persist?.().catch(() => {});
  }, [reload]);

  const saveItem = useCallback(async (item: ClothingItem, photo?: Blob | null, original?: Blob) => {
    let next = item;
    const dropOld = async () => {
      const old = items.find((p) => p.id === item.id)?.photoId;
      if (old) {
        await db.deletePhoto(old);
        await db.deletePhoto(originalPhotoKey(old));
      }
    };
    if (photo) {
      const photoId = `photo-${item.id}-${Date.now()}`;
      await db.putPhoto(photoId, photo);
      if (original) await db.putPhoto(originalPhotoKey(photoId), original);
      await dropOld();
      next = { ...item, photoId };
    } else if (photo === null) {
      await dropOld();
      next = { ...item, photoId: undefined, photoCutout: undefined };
    }
    await db.putItem(next);
    setItems((prev) => {
      const i = prev.findIndex((p) => p.id === next.id);
      if (i === -1) return [next, ...prev];
      const copy = prev.slice();
      copy[i] = next;
      return copy;
    });
  }, [items]);

  // Deleting an item keeps past wear logs intact; stats simply skip ids that no longer resolve.
  const removeItem = useCallback(async (item: ClothingItem) => {
    await db.deleteItem(item);
    setItems((prev) => prev.filter((p) => p.id !== item.id));
  }, []);

  // One manual entry per day, keyed by date.
  const toggleLogged = useCallback(
    async (date: string, itemId: string) => {
      const id = `log-${date}`;
      const existing = logs.find((l) => l.id === id);
      const itemIds = existing?.itemIds.includes(itemId)
        ? existing.itemIds.filter((x) => x !== itemId)
        : [...(existing?.itemIds ?? []), itemId];
      if (itemIds.length === 0) {
        await db.deleteLog(id);
        setLogs((prev) => prev.filter((l) => l.id !== id));
        return;
      }
      const entry: WearLogEntry = { id, date, itemIds, source: existing?.source ?? 'manual', weather: existing?.weather ?? weatherStamp(date) };
      await db.putLog(entry);
      setLogs((prev) => [...prev.filter((l) => l.id !== id), entry]);
    },
    [logs],
  );

  // "Wear this" from Ideas: the day's log becomes exactly this outfit.
  const logOutfit = useCallback(async (date: string, itemIds: string[]) => {
    const entry: WearLogEntry = { id: `log-${date}`, date, itemIds, source: 'suggested', weather: weatherStamp(date) };
    await db.putLog(entry);
    setLogs((prev) => [...prev.filter((l) => l.id !== entry.id), entry]);
  }, []);

  // 👍 / "not for me" on a suggested outfit — the stylist learns pairings from these.
  const react = useCallback(async (itemIds: string[], verdict: Feedback['verdict']) => {
    const f: Feedback = { id: `fb-${Date.now()}`, itemIds, verdict, date: todayKey() };
    await db.putFeedback(f);
    setFeedback((prev) => [...prev, f]);
  }, []);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const value = useMemo(
    () => ({ ready, items, logs, feedback, itemsById, saveItem, removeItem, toggleLogged, logOutfit, react, reload }),
    [ready, items, logs, feedback, itemsById, saveItem, removeItem, toggleLogged, logOutfit, react, reload],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

/** Today's feels-like range, stamped on a log so the stylist can learn what he wears at what temperature. */
function weatherStamp(date: string): WearLogEntry['weather'] {
  if (date !== todayKey()) return undefined;
  const w = readCachedWeather();
  if (!w) return undefined;
  const d = dayProfile(w);
  return { feelsMin: d.coldFeels, feelsMax: d.warmFeels };
}

export function useStore() {
  const s = useContext(StoreCtx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

// ---------- App-wide settings (theme, accent, closet columns) ----------

export type Theme = 'light' | 'dark';
export type ThemePref = Theme | 'system';
export type Accent = 'yellow' | 'red' | 'ink';
const ACCENTS: Accent[] = ['yellow', 'red', 'ink'];

interface Settings {
  theme: Theme;
  themePref: ThemePref;
  setThemePref: (t: ThemePref) => void;
  accent: Accent;
  setAccent: (a: Accent) => void;
  columns: 3 | 4;
  setColumns: (c: 3 | 4) => void;
}

const SettingsCtx = createContext<Settings | null>(null);

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: setting just won't persist */
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [themePref, setThemePrefState] = useState<ThemePref>(() => {
    const saved = read('outfit.theme');
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const theme: Theme = themePref === 'system' ? (systemDark ? 'dark' : 'light') : themePref;
  const [accent, setAccentState] = useState<Accent>(() => {
    const saved = read('outfit.accent') as Accent;
    return ACCENTS.includes(saved) ? saved : 'yellow';
  });
  const [columns, setColumnsState] = useState<3 | 4>(() => (read('outfit.columns') === '4' ? 4 : 3));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0F0F0E' : '#E7E6E2');
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  const value = useMemo<Settings>(
    () => ({
      theme,
      themePref,
      setThemePref: (t) => {
        write('outfit.theme', t);
        setThemePrefState(t);
      },
      accent,
      setAccent: (a) => {
        write('outfit.accent', a);
        setAccentState(a);
      },
      columns,
      setColumns: (c) => {
        write('outfit.columns', String(c));
        setColumnsState(c);
      },
    }),
    [theme, themePref, accent, columns],
  );
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const s = useContext(SettingsCtx);
  if (!s) throw new Error('useSettings outside SettingsProvider');
  return s;
}
