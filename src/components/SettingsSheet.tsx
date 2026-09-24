import { useRef, useState } from 'react';
import { makeCutout } from '../cutout';
import { exportBackup, getPhoto, importBackup } from '../db';
import { todayKey } from '../dates';
import { useSettings, useStore, type Accent, type ThemePref } from '../store';
import { getSavedLocation } from '../weather';
import { Sheet } from './Common';

const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: 'yellow', label: 'Yellow', swatch: '#F0B429' },
  { value: 'red', label: 'Red', swatch: '#D7263D' },
  { value: 'ink', label: 'Ink', swatch: 'var(--ink)' },
];

export function SettingsSheet({ onClose, onPickLocation }: { onClose: () => void; onPickLocation: () => void }) {
  const location = getSavedLocation();
  const { accent, setAccent, columns, setColumns, themePref, setThemePref } = useSettings();
  const { reload, items, logs, saveItem } = useStore();
  const [batch, setBatch] = useState<{ done: number; total: number; failed: number; label: string } | null>(null);
  const plain = items.filter((i) => i.photoId && !i.photoCutout);

  // Turn every ordinary photo into a studio cutout, one at a time (keeps phone memory in check).
  async function cleanAll() {
    const todo = plain.slice();
    let failed = 0;
    for (let n = 0; n < todo.length; n++) {
      const item = todo[n];
      setBatch({ done: n, total: todo.length, failed, label: item.name });
      const original = await getPhoto(item.photoId!);
      if (!original) continue;
      try {
        const cut = await makeCutout(original, (label, fraction) =>
          setBatch({ done: n, total: todo.length, failed, label: fraction !== null && label.startsWith('Downloading') ? `${label} ${Math.round(fraction * 100)}%` : item.name }),
        );
        if (cut) await saveItem({ ...item, photoCutout: true }, cut, original);
        else failed++;
      } catch {
        failed++;
        if (n === 0) break; // model didn't load (offline?) — no point trying the rest
      }
    }
    setBatch({ done: todo.length, total: todo.length, failed, label: '' });
  }
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function doExport() {
    const blob = await exportBackup();
    const name = `outfit-backup-${todayKey()}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    // iOS standalone PWAs handle the share sheet better than downloads.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Replace everything in the app with this backup?')) return;
    try {
      await importBackup(await file.text());
      await reload();
      setMsg('Backup restored.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Import failed.');
    }
  }

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="field">
        <span className="sublabel">Appearance</span>
        <div className="seg">
          {(
            [
              ['light', 'Light'],
              ['dark', 'Dark'],
              ['system', 'Match phone'],
            ] as [ThemePref, string][]
          ).map(([v, label]) => (
            <button key={v} type="button" className="chip" aria-pressed={themePref === v} onClick={() => setThemePref(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="sublabel">Accent</span>
        <div className="seg">
          {ACCENTS.map((a) => (
            <button key={a.value} type="button" className="chip" aria-pressed={accent === a.value} onClick={() => setAccent(a.value)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="swatch" style={{ background: a.swatch, width: 9, height: 9 }} />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="sublabel">Weather location</span>
        <button type="button" className="chip" onClick={onPickLocation} style={{ alignSelf: 'flex-start', minHeight: 36, display: 'flex', alignItems: 'center', color: 'var(--ink)' }}>
          {location?.source === 'manual' ? location.name : 'Current location'} · Change
        </button>
      </div>

      <div className="field">
        <span className="sublabel">Studio photos</span>
        <p className="muted" style={{ fontSize: 12, fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
          New photos are cut out and placed on the same backdrop automatically. The first time downloads a ~56 MB model; after that it works offline. Originals are kept.
        </p>
        {batch && batch.done < batch.total ? (
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
            Cleaning up {batch.done + 1} of {batch.total}… <span className="muted">{batch.label}</span>
          </p>
        ) : (
          <>
            {batch && (
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
                Done — {batch.total - batch.failed} cleaned{batch.failed ? `, ${batch.failed} kept as they were` : ''}.
              </p>
            )}
            <button type="button" className="primary-btn" disabled={!plain.length} onClick={cleanAll}>
              <span>{plain.length ? `Clean up ${plain.length} ${plain.length === 1 ? 'photo' : 'photos'}` : 'All photos are studio photos'}</span>
              <span>→</span>
            </button>
          </>
        )}
      </div>

      <div className="field">
        <span className="sublabel">Closet grid</span>
        <div className="seg">
          {([3, 4] as const).map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={columns === c} onClick={() => setColumns(c)}>
              {c} columns
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="sublabel">Backup</span>
        <p className="muted" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 4px', lineHeight: 1.5 }}>
          Everything lives on this phone only — {items.length} pieces, {logs.length} logged days. Export now and then so a reset doesn’t wipe it.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="primary-btn center" onClick={doExport}>
            Export
          </button>
          <button type="button" className="primary-btn center outline" onClick={() => fileRef.current?.click()}>
            Import
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={doImport} />
        {msg && <p style={{ fontSize: 12, fontWeight: 700, margin: '4px 0 0' }}>{msg}</p>}
      </div>
    </Sheet>
  );
}
