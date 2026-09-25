import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { makeCutout } from './cutout';
import * as db from './db';
import { dayProfile } from './engine/day';
import { todayKey } from './dates';
import { fitsOn, originalPhotoKey, type ClothingItem, type Feedback, type WearLogEntry } from './types';
import { readCachedWeather } from './weather';

// Crash guard for studio photos. Before a photo is processed its piece id is written down; it's
// cleared once the photo is done. If the app dies mid-photo, the note is still there next launch:
// that photo is marked failed (never retried automatically), and after two such crashes the queue
// pauses itself until he turns it back on in Settings. So it can never crash-loop.
const ACTIVE = 'outfit.studioActive';
const CRASHES = 'outfit.studioCrashes';
const PAUSED = 'outfit.studioPaused';

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
  /** Add or remove a piece from one fit. `fit` may be a new, not-yet-saved fit ({ id, date, label }). */
  toggleLogged: (fit: FitRef, itemId: string) => Promise<void>;
  /** "Wear this" from Ideas: replace the day's first fit, or add the outfit as another fit. */
  logOutfit: (date: string, itemIds: string[], asNewFit?: boolean) => Promise<void>;
  renameFit: (id: string, label: string) => Promise<void>;
  deleteFit: (id: string) => Promise<void>;
  react: (itemIds: string[], verdict: Feedback['verdict']) => Promise<void>;
  reload: () => Promise<void>;
  studio: StudioStatus;
  /** Queue every ordinary photo in the closet for a studio cleanup. */
  cleanUpCloset: () => Promise<void>;
  /** Turn studio photos back on after the crash guard paused them. */
  resumeStudio: () => void;
}

export type FitRef = { id: string; date: string; label?: string; createdAt?: number };

/** A fresh id for another fit on `date`. */
export const newFitId = (date: string) => `log-${date}-${Date.now().toString(36)}`;

export interface StudioStatus {
  /** Photos still waiting (including the one being worked on). */
  pending: number;
  /** Name of the piece being processed right now. */
  working: string | null;
  /** Photos this session where no clear garment was found (kept as they were). */
  failed: number;
  /** The model couldn't load (usually offline); the queue retries in a minute. */
  stalled: boolean;
  /** The crash guard stopped processing (the app died mid-photo twice). */
  paused: boolean;
}

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [logs, setLogs] = useState<WearLogEntry[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [paused, setPaused] = useState(false);

  const reload = useCallback(async () => {
    const data = await db.loadAll();
    const crashedOn = read(ACTIVE);
    if (crashedOn) {
      write(ACTIVE, '');
      const crashes = Number(read(CRASHES) ?? 0) + 1;
      write(CRASHES, String(crashes));
      if (crashes >= 2) write(PAUSED, '1');
      const victim = data.items.find((i) => i.id === crashedOn);
      if (victim) {
        if (victim.photoPending) {
          victim.photoPending = false;
          victim.studioFailed = true;
        } else if (victim.back) victim.back = { ...victim.back, pending: false, failed: true };
        await db.putItem(victim);
      }
    }
    if (read(PAUSED) === '1') {
      for (const i of data.items.filter((x) => x.photoPending || x.back?.pending)) {
        i.photoPending = false;
        if (i.back) i.back = { ...i.back, pending: false };
        await db.putItem(i);
      }
      setPaused(true);
    }
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

  // Each fit is one entry. A fit with no pieces left is removed (no empty fits in the log).
  const toggleLogged = useCallback(
    async (fit: FitRef, itemId: string) => {
      const existing = logs.find((l) => l.id === fit.id);
      const itemIds = existing?.itemIds.includes(itemId)
        ? existing.itemIds.filter((x) => x !== itemId)
        : [...(existing?.itemIds ?? []), itemId];
      if (itemIds.length === 0) {
        await db.deleteLog(fit.id);
        setLogs((prev) => prev.filter((l) => l.id !== fit.id));
        return;
      }
      const entry: WearLogEntry = {
        id: fit.id,
        date: fit.date,
        itemIds,
        source: existing?.source ?? 'manual',
        weather: existing?.weather ?? weatherStamp(fit.date),
        label: existing?.label ?? fit.label,
        createdAt: existing?.createdAt ?? fit.createdAt ?? Date.now(),
      };
      await db.putLog(entry);
      setLogs((prev) => [...prev.filter((l) => l.id !== fit.id), entry]);
    },
    [logs],
  );

  const logOutfit = useCallback(
    async (date: string, itemIds: string[], asNewFit = false) => {
      const day = fitsOn(logs, date);
      const first = day[0];
      const entry: WearLogEntry =
        asNewFit || !first
          ? { id: first ? newFitId(date) : `log-${date}`, date, itemIds, source: 'suggested', weather: weatherStamp(date), createdAt: Date.now(), label: first ? `Fit ${day.length + 1}` : undefined }
          : { ...first, itemIds, source: 'suggested' };
      await db.putLog(entry);
      setLogs((prev) => [...prev.filter((l) => l.id !== entry.id), entry]);
    },
    [logs],
  );

  const renameFit = useCallback(
    async (id: string, label: string) => {
      const existing = logs.find((l) => l.id === id);
      if (!existing) return;
      const entry = { ...existing, label: label.trim() || undefined };
      await db.putLog(entry);
      setLogs((prev) => prev.map((l) => (l.id === id ? entry : l)));
    },
    [logs],
  );

  const deleteFit = useCallback(async (id: string) => {
    await db.deleteLog(id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
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
    if (paused || !ready || !visible || running.current || Date.now() < stalledUntil) return;
    const next = items.find((i) => (i.photoPending && i.photoId) || i.back?.pending);
    if (!next) return;
    // Fronts first; a piece's back photo goes through the same queue after it.
    const front = !!(next.photoPending && next.photoId);
    const srcId = front ? next.photoId! : next.back!.photoId;
    running.current = true;
    setWorking(next.name);
    write(ACTIVE, next.id);
    (async () => {
      try {
        const original = await db.getPhoto(srcId);
        const cut = original ? await makeCutout(original) : null;
        // Only apply the result if the piece still has the photo we started with.
        const now = latest.current.items.find((i) => i.id === next.id);
        if (!front) {
          if (now?.back?.photoId === srcId) {
            if (cut && original) {
              const photoId = `photo-${now.id}-back-${Date.now()}`;
              await db.putPhoto(photoId, cut);
              await db.putPhoto(originalPhotoKey(photoId), original);
              await latest.current.saveItem({ ...now, back: { photoId, cutout: true } });
              await db.deletePhoto(srcId);
            } else {
              await latest.current.saveItem({ ...now, back: { ...now.back, pending: false, failed: true } });
              setFailed((f) => f + 1);
            }
          }
        } else if (now && now.photoId === next.photoId) {
          if (cut && original) await latest.current.saveItem({ ...now, photoPending: false, photoCutout: true, studioFailed: false }, cut, original);
          else {
            await latest.current.saveItem({ ...now, photoPending: false, studioFailed: true });
            setFailed((f) => f + 1);
          }
        }
        setStalledUntil(0);
        write(CRASHES, '0');
      } catch {
        // The model didn't load (offline, or no space). Leave the piece queued and try again later.
        setStalledUntil(Date.now() + 60_000);
        setTimeout(() => setTick((t) => t + 1), 61_000);
      } finally {
        write(ACTIVE, '');
        running.current = false;
        setWorking(null);
      }
    })();
  }, [items, ready, visible, stalledUntil, tick, paused]);

  const cleanUpCloset = useCallback(async () => {
    const frontTodo = (i: ClothingItem) => !!i.photoId && !i.photoCutout && !i.photoPending;
    const backTodo = (i: ClothingItem) => !!i.back && !i.back.cutout && !i.back.pending;
    const queued = (i: ClothingItem): ClothingItem => ({
      ...i,
      ...(frontTodo(i) ? { photoPending: true, studioFailed: false } : {}),
      ...(backTodo(i) ? { back: { ...i.back!, pending: true, failed: false } } : {}),
    });
    const todo = latest.current.items.filter((i) => frontTodo(i) || backTodo(i));
    for (const i of todo) await db.putItem(queued(i));
    setItems((prev) => prev.map((i) => (todo.some((t) => t.id === i.id) ? queued(i) : i)));
    setFailed(0);
    setStalledUntil(0);
  }, []);

  const resumeStudio = useCallback(() => {
    write(PAUSED, '');
    write(CRASHES, '0');
    setPaused(false);
  }, []);

  const studio: StudioStatus = useMemo(
    () => ({ pending: items.filter((i) => i.photoPending && i.photoId).length + items.filter((i) => i.back?.pending).length, working, failed, stalled: stalledUntil > Date.now(), paused }),
    [items, working, failed, stalledUntil, paused],
  );

  const value = useMemo(
    () => ({ ready, items, logs, feedback, itemsById, saveItem, removeItem, toggleLogged, logOutfit, renameFit, deleteFit, react, reload, studio, cleanUpCloset, resumeStudio }),
    [ready, items, logs, feedback, itemsById, saveItem, removeItem, toggleLogged, logOutfit, renameFit, deleteFit, react, reload, studio, cleanUpCloset, resumeStudio],
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
