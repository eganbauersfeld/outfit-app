import { useRef, useState } from 'react';
import { exportBackup, importBackup } from '../db';
import { todayKey } from '../dates';
import { useSettings, useStore, type Accent } from '../store';
import { getSavedLocation } from '../weather';
import { Sheet } from './Common';

const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: 'red', label: 'Red', swatch: '#D7263D' },
  { value: 'ink', label: 'Ink', swatch: 'var(--ink)' },
  { value: 'green', label: 'Green', swatch: '#2E7D5B' },
];

export function SettingsSheet({ onClose, onPickLocation }: { onClose: () => void; onPickLocation: () => void }) {
  const location = getSavedLocation();
  const { accent, setAccent, columns, setColumns } = useSettings();
  const { reload, items, logs } = useStore();
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
          <button type="button" className="primary-btn" onClick={doExport}>
            Export
          </button>
          <button type="button" className="primary-btn" onClick={() => fileRef.current?.click()}>
            Import
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={doImport} />
        {msg && <p style={{ fontSize: 12, fontWeight: 700, margin: '4px 0 0' }}>{msg}</p>}
      </div>
    </Sheet>
  );
}
