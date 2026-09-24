import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as db from './db';
import type { ClothingItem, WearLogEntry } from './types';

// ---------- Closet + wear log ----------

interface Store {
  ready: boolean;
  items: ClothingItem[];
  logs: WearLogEntry[];
  itemsById: Map<string, ClothingItem>;
  saveItem: (item: ClothingItem, photo?: Blob | null) => Promise<void>;
  removeItem: (item: ClothingItem) => Promise<void>;
  toggleLogged: (date: string, itemId: string) => Promise<void>;
  reload: () => Promise<void>;
}

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [logs, setLogs] = useState<WearLogEntry[]>([]);

  const reload = useCallback(async () => {
    const data = await db.loadAll();
    setItems(data.items.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)));
    setLogs(data.logs);
    setReady(true);
  }, []);

  useEffect(() => {
    reload();
    // Ask iOS/Chrome not to evict IndexedDB under storage pressure.
    navigator.storage?.persist?.().catch(() => {});
  }, [reload]);

  const saveItem = useCallback(async (item: ClothingItem, photo?: Blob | null) => {
    let next = item;
    if (photo) {
      const photoId = `photo-${item.id}-${Date.now()}`;
      await db.putPhoto(photoId, photo);
      if (item.photoId) await db.deletePhoto(item.photoId);
      next = { ...item, photoId };
    } else if (photo === null && item.photoId) {
      await db.deletePhoto(item.photoId);
      next = { ...item, photoId: undefined };
    }
    await db.putItem(next);
    setItems((prev) => {
      const i = prev.findIndex((p) => p.id === next.id);
      if (i === -1) return [next, ...prev];
      const copy = prev.slice();
      copy[i] = next;
      return copy;
    });
  }, []);

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
      const entry: WearLogEntry = { id, date, itemIds, source: existing?.source ?? 'manual' };
      await db.putLog(entry);
      setLogs((prev) => [...prev.filter((l) => l.id !== id), entry]);
    },
    [logs],
  );

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const value = useMemo(
    () => ({ ready, items, logs, itemsById, saveItem, removeItem, toggleLogged, reload }),
    [ready, items, logs, itemsById, saveItem, removeItem, toggleLogged, reload],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const s = useContext(StoreCtx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

// ---------- App-wide settings (theme, accent, closet columns) ----------

export type Theme = 'light' | 'dark';
export type Accent = 'yellow' | 'red' | 'ink';
const ACCENTS: Accent[] = ['yellow', 'red', 'ink'];

interface Settings {
  theme: Theme;
  toggleTheme: () => void;
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
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || 'light');
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
      toggleTheme: () =>
        setTheme((t) => {
          const next = t === 'dark' ? 'light' : 'dark';
          write('outfit.theme', next);
          return next;
        }),
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
    [theme, accent, columns],
  );
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const s = useContext(SettingsCtx);
  if (!s) throw new Error('useSettings outside SettingsProvider');
  return s;
}
