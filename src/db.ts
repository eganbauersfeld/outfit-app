import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ClothingItem, Feedback, WearLogEntry } from './types';

interface OutfitDB extends DBSchema {
  items: { key: string; value: ClothingItem };
  logs: { key: string; value: WearLogEntry; indexes: { date: string } };
  photos: { key: string; value: Blob };
  feedback: { key: string; value: Feedback };
}

let dbPromise: Promise<IDBPDatabase<OutfitDB>> | null = null;

function db() {
  dbPromise ??= openDB<OutfitDB>('outfit', 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('items', { keyPath: 'id' });
        d.createObjectStore('logs', { keyPath: 'id' }).createIndex('date', 'date');
        d.createObjectStore('photos');
      }
      if (oldVersion < 2) d.createObjectStore('feedback', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

export async function loadAll() {
  const d = await db();
  const [items, logs, feedback] = await Promise.all([d.getAll('items'), d.getAll('logs'), d.getAll('feedback')]);
  return { items, logs, feedback };
}

export async function putItem(item: ClothingItem) {
  await (await db()).put('items', item);
}

export async function deleteItem(item: ClothingItem) {
  const d = await db();
  const tx = d.transaction(['items', 'photos'], 'readwrite');
  await tx.objectStore('items').delete(item.id);
  if (item.photoId) await tx.objectStore('photos').delete(item.photoId);
  await tx.done;
}

export async function putLog(log: WearLogEntry) {
  await (await db()).put('logs', log);
}

export async function deleteLog(id: string) {
  await (await db()).delete('logs', id);
}

export async function putFeedback(f: Feedback) {
  await (await db()).put('feedback', f);
}

export async function getPhoto(id: string) {
  return (await db()).get('photos', id);
}

export async function putPhoto(id: string, blob: Blob) {
  await (await db()).put('photos', blob, id);
}

export async function deletePhoto(id: string) {
  await (await db()).delete('photos', id);
}

// ---- Backup: everything lives on one device, so export/import is the safety net.

interface Backup {
  app: 'outfit';
  version: 1;
  exportedAt: string;
  items: ClothingItem[];
  logs: WearLogEntry[];
  feedback?: Feedback[];
  photos: Record<string, string>; // id -> data URL
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function exportBackup(): Promise<Blob> {
  const d = await db();
  const [items, logs, feedback, keys] = await Promise.all([d.getAll('items'), d.getAll('logs'), d.getAll('feedback'), d.getAllKeys('photos')]);
  const photos: Record<string, string> = {};
  for (const k of keys) {
    const blob = await d.get('photos', k);
    if (blob) photos[k] = await blobToDataUrl(blob);
  }
  const backup: Backup = { app: 'outfit', version: 1, exportedAt: new Date().toISOString(), items, logs, feedback, photos };
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

export async function importBackup(text: string) {
  const data = JSON.parse(text) as Backup;
  if (data.app !== 'outfit' || !Array.isArray(data.items) || !Array.isArray(data.logs)) {
    throw new Error('Not an Outfit backup file.');
  }
  const photoBlobs: [string, Blob][] = [];
  for (const [id, url] of Object.entries(data.photos ?? {})) {
    photoBlobs.push([id, await (await fetch(url)).blob()]);
  }
  const d = await db();
  const tx = d.transaction(['items', 'logs', 'photos', 'feedback'], 'readwrite');
  await Promise.all([tx.objectStore('items').clear(), tx.objectStore('logs').clear(), tx.objectStore('photos').clear(), tx.objectStore('feedback').clear()]);
  for (const item of data.items) await tx.objectStore('items').put(item);
  for (const log of data.logs) await tx.objectStore('logs').put(log);
  for (const f of data.feedback ?? []) await tx.objectStore('feedback').put(f);
  for (const [id, blob] of photoBlobs) await tx.objectStore('photos').put(blob, id);
  await tx.done;
}
