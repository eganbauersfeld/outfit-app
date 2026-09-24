import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { makeCutout } from './cutout';
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
  studio: StudioStatus;
  /** Queue every ordinary photo in the closet for a studio cleanup. */
  cleanUpCloset: () => Promise<void>;
}

export interface StudioStatus {
  /** Photos still waiting (including the one being worked on). */
  pending: number;
  /** Name of the piece being processed right now. */
  working: string | null;
  /** Photos this session where no clear garment was found (kept as they were). */
  failed: number;
  /** The model couldn't load (usually offline); the queue retries in a minute. */
  stalled: boolean;
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

  // ---------- Studio-photo queue ----------
  // Pieces flagged photoPending get their photo cut out one at a time, while the app is open and on
  // screen (iOS pauses home-screen apps in the background). The flag is stored with the piece, so a
  // queue interrupted by closing the app picks up again next time.
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const [working, setWorking] = useState<string | null>(null);
  const [failed, setFailed] = useState(0);
  const [stalledUntil, setStalledUntil] = useState(0);
  const [tick, setTick] = useState(0);
  const running = useRef(false);
  const latest = useRef({ items, saveItem });
  latest.current = { items, saveItem };

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible');
    const onOnline = () => setStalledUntil(0);
    document.addEventListener('visibilitychange', onVis);
    addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('online', onOnline);
    };
  }, []);

  useEffect(() => {
    if (!ready || !visible || running.current || Date.now() < stalledUntil) return;
    const next = items.find((i) => i.photoPending && i.photoId);
    if (!next) return;
    running.current = true;
    setWorking(next.name);
    (async () => {
      try {
        const original = await db.getPhoto(next.photoId!);
        const cut = original ? await makeCutout(original) : null;
        // Only apply the result if the piece still has the photo we started with.
        const now = latest.current.items.find((i) => i.id === next.id);
        if (now && now.photoId === next.photoId) {
          if (cut && original) await latest.current.saveItem({ ...now, photoPending: false, photoCutout: true, studioFailed: false }, cut, original);
          else {
            await latest.current.saveItem({ ...now, photoPending: false, studioFailed: true });
            setFailed((f) => f + 1);
          }
        }
        setStalledUntil(0);
      } catch {
        // The model didn't load (offline, or no space). Leave the piece queued and try again later.
        setStalledUntil(Date.now() + 60_000);
        setTimeout(() => setTick((t) => t + 1), 61_000);
      } finally {
        running.current = false;
        setWorking(null);
      }
    })();
  }, [items, ready, visible, stalledUntil, tick]);

  const cleanUpCloset = useCallback(async () => {
    const todo = latest.current.items.filter((i) => i.photoId && !i.photoCutout && !i.photoPending);
    for (const i of todo) await db.putItem({ ...i, photoPending: true, studioFailed: false });
    setItems((prev) => prev.map((i) => (todo.some((t) => t.id === i.id) ? { ...i, photoPending: true, studioFailed: false } : i)));
    setFailed(0);
    setStalledUntil(0);
  }, []);

  const studio: StudioStatus = useMemo(
    () => ({ pending: items.filter((i) => i.photoPending && i.photoId).length, working, failed, stalled: stalledUntil > Date.now() }),
    [items, working, failed, stalledUntil],
  );

  const value = useMemo(
    () => ({ ready, items, logs, feedback, itemsById, saveItem, removeItem, toggleLogged, logOutfit, react, reload, studio, cleanUpCloset }),
    [ready, items, logs, feedback, itemsById, saveItem, removeItem, toggleLogged, logOutfit, react, reload, studio, cleanUpCloset],
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
  /** Queue new photos for a studio cleanup automatically. */
  autoStudio: boolean;
  setAutoStudio: (on: boolean) => void;
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
  const [autoStudio, setAutoStudioState] = useState(() => read('outfit.autoStudio') !== 'off');

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
      autoStudio,
      setAutoStudio: (on) => {
        write('outfit.autoStudio', on ? 'on' : 'off');
        setAutoStudioState(on);
      },
    }),
    [theme, themePref, accent, columns, autoStudio],
  );
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const s = useContext(SettingsCtx);
  if (!s) throw new Error('useSettings outside SettingsProvider');
  return s;
}
