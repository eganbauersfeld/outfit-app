import { useEffect, useRef, useState } from 'react';
import { hasTransparentBackground, makeCutout } from '../cutout';
import { getPhoto } from '../db';
import { useStore } from '../store';
import { CATEGORIES, COLOR_PRESETS, lengthOf, MATERIALS, originalPhotoKey, sleeveOf, type BottomLength, type Category, type ClothingItem, type Sleeve, type WearContext } from '../types';
import { ItemPhoto, Sheet, STUDIO, Switch } from './Common';

/** Downscale a camera photo before it goes into IndexedDB (keeping transparency for iPhone cutouts). */
async function resizeImage(file: Blob, max = 1000): Promise<Blob> {
  const keepAlpha = await hasTransparentBackground(file).catch(() => false);
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read photo'))), keepAlpha ? 'image/png' : 'image/jpeg', 0.85),
  );
}

const CONTEXTS: { value: WearContext; label: string }[] = [
  { value: 'everyday', label: 'Everyday' },
  { value: 'house-only', label: 'House only' },
  { value: 'sports', label: 'Sports' },
];

function blank(category: Category): ClothingItem {
  return {
    id: crypto.randomUUID(),
    name: '',
    category,
    color: COLOR_PRESETS[0],
    styleType: 'Plain',
    dateAdded: new Date().toISOString(),
    isFavorite: false,
    isSafeBet: false,
    isThrifted: false,
    contexts: ['everyday'],
  };
}

export function ItemForm({ item, defaultCategory = 'Top', onClose }: { item?: ClothingItem; defaultCategory?: Category; onClose: () => void }) {
  const { saveItem, removeItem } = useStore();
  const [draft, setDraft] = useState<ClothingItem>(() => item ?? blank(defaultCategory));
  // Photo edits: `src` is the untouched photo being worked on (undefined = unchanged, null = removed);
  // `cut` is its studio cutout; `studio` picks which one gets saved.
  const [src, setSrc] = useState<Blob | null | undefined>(undefined);
  const [cut, setCut] = useState<Blob | null>(null);
  const [studio, setStudio] = useState(false);
  const [status, setStatus] = useState<{ label: string; fraction: number | null } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isPreset = COLOR_PRESETS.some((c) => c.name === draft.color.name && c.hex === draft.color.hex);

  const shown = studio && cut ? cut : src;
  useEffect(() => {
    if (!shown) return setPreview(null);
    const u = URL.createObjectURL(shown);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [shown]);

  async function runCutout(blob: Blob) {
    setCut(null);
    setError(null);
    setStatus({ label: 'Cleaning up the photo…', fraction: null });
    try {
      const result = await makeCutout(blob, (label, fraction) => setStatus({ label, fraction }));
      setCut(result);
      setStudio(!!result);
      if (!result) setError('Couldn’t pick out the piece in this photo — keeping the original. A plainer background helps.');
    } catch {
      setStudio(false);
      setError('Photo cleanup isn’t available right now (it needs a connection the first time). Keeping the original.');
    } finally {
      setStatus(null);
    }
  }

  async function cleanExisting() {
    if (!draft.photoId) return;
    const blob = await getPhoto(draft.photoId);
    if (!blob) return;
    setSrc(blob);
    await runCutout(blob);
  }

  async function restoreOriginal() {
    if (!draft.photoId) return;
    const blob = await getPhoto(originalPhotoKey(draft.photoId));
    if (!blob) return setError('The original isn’t stored for this photo.');
    setSrc(blob);
    setCut(null);
    setStudio(false);
  }

  const set = <K extends keyof ClothingItem>(key: K, value: ClothingItem[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let blob: Blob;
    try {
      blob = await resizeImage(file);
    } catch {
      return setError('Couldn’t read that photo.');
    }
    setSrc(blob);
    setStudio(false);
    await runCutout(blob);
  }

  async function save() {
    if (!draft.name.trim()) return setError('Give it a name.');
    setBusy(true);
    try {
      const next: ClothingItem = {
        ...draft,
        name: draft.name.trim(),
        // Lock in sleeves/length (including a name-based guess) and drop fields that don't apply.
        sleeve: draft.category === 'Top' ? sleeveOf(draft) : undefined,
        length: draft.category === 'Bottom' ? lengthOf(draft) : undefined,
      };
      if (src === null) await saveItem({ ...next, photoCutout: undefined }, null);
      else if (src && studio && cut) await saveItem({ ...next, photoCutout: true }, cut, src);
      else if (src) await saveItem({ ...next, photoCutout: false }, src);
      else await saveItem(next);
      onClose();
    } catch {
      setError('Couldn’t save — try again.');
      setBusy(false);
    }
  }

  async function remove() {
    if (!item || !confirm(`Remove “${item.name}” from your closet? Past logs keep their history.`)) return;
    await removeItem(item);
    onClose();
  }

  const toggleContext = (c: WearContext) =>
    set('contexts', draft.contexts.includes(c) ? draft.contexts.filter((x) => x !== c) : [...draft.contexts, c]);

  return (
    <Sheet
      title={item ? 'Edit piece' : 'New piece'}
      onClose={onClose}
      action={
        <button type="button" className="text-btn" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: status || error ? 8 : 18 }}>
        <button type="button" className="photo-well" style={{ width: 132, background: (studio && cut) || (src === undefined && draft.photoCutout) ? STUDIO : undefined }} aria-label="Add photo" onClick={() => fileRef.current?.click()}>
          {preview ? (
            studio && cut ? (
              <img src={preview} alt="" style={{ position: 'absolute', inset: '6%', width: '88%', height: '88%', objectFit: 'contain', filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.18))' }} />
            ) : (
              <img src={preview} alt="" />
            )
          ) : src === null ? (
            <ItemPhoto />
          ) : (
            <ItemPhoto photoId={draft.photoId} cutout={draft.photoCutout} />
          )}
          {status && (
            <span style={{ position: 'absolute', inset: 0, background: 'rgba(17,17,17,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="spinner" aria-hidden />
            </span>
          )}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          {cut && src && (
            <div className="seg" style={{ marginBottom: 6 }}>
              <button type="button" className="chip" aria-pressed={studio} onClick={() => setStudio(true)}>
                Studio
              </button>
              <button type="button" className="chip" aria-pressed={!studio} onClick={() => setStudio(false)}>
                Original
              </button>
            </div>
          )}
          <button type="button" className="text-btn" style={{ textAlign: 'left' }} disabled={!!status} onClick={() => fileRef.current?.click()}>
            {draft.photoId || preview ? 'Change photo' : 'Add photo'}
          </button>
          {src === undefined && draft.photoId && !draft.photoCutout && (
            <button type="button" className="text-btn" style={{ textAlign: 'left' }} disabled={!!status} onClick={cleanExisting}>
              Clean up photo
            </button>
          )}
          {src === undefined && draft.photoId && draft.photoCutout && (
            <button type="button" className="text-btn muted" style={{ textAlign: 'left' }} onClick={restoreOriginal}>
              Restore original
            </button>
          )}
          {(draft.photoId || preview) && src !== null && (
            <button
              type="button"
              className="text-btn muted"
              style={{ textAlign: 'left' }}
              disabled={!!status}
              onClick={() => {
                setSrc(null);
                setCut(null);
              }}
            >
              Remove photo
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
      </div>
      {error && src !== undefined && !status && <p style={{ color: '#c62f3c', fontWeight: 600, fontSize: 12, margin: '0 0 16px', lineHeight: 1.4 }}>{error}</p>}
      {status && (
        <p className="muted" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 16px' }}>
          {status.label}
          {status.fraction !== null ? ` ${Math.round(status.fraction * 100)}%` : ''}
        </p>
      )}

      <label className="field">
        <span className="sublabel">Name</span>
        <input className="input" value={draft.name} placeholder="e.g. White Tee" onChange={(e) => set('name', e.target.value)} />
      </label>

      <div className="field">
        <span className="sublabel">Category</span>
        <div className="seg">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={draft.category === c} onClick={() => set('category', c)}>
              {c === 'Misc' ? 'Misc.' : c}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="sublabel">
          Color · <span style={{ color: 'var(--ink)' }}>{draft.color.name}</span>
        </span>
        <div className="color-grid">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c.name}
              type="button"
              className="color-dot"
              style={{ background: c.hex }}
              aria-label={c.name}
              aria-pressed={draft.color.name === c.name && draft.color.hex === c.hex}
              onClick={() => set('color', c)}
            />
          ))}
          <label
            className="color-dot pressable"
            aria-label="Custom color"
            style={{ background: isPreset ? 'conic-gradient(#d7263d,#e6c84b,#4c8c5c,#3a6ea5,#8e7cc3,#d7263d)' : draft.color.hex, boxShadow: isPreset ? undefined : 'inset 0 0 0 3px var(--paper), inset 0 0 0 5px var(--ink)', cursor: 'pointer' }}
          >
            <input
              type="color"
              value={draft.color.hex}
              style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              onChange={(e) => set('color', { name: isPreset ? 'Custom' : draft.color.name, hex: e.target.value.toUpperCase() })}
            />
          </label>
        </div>
        {!isPreset && (
          <input className="input" value={draft.color.name} aria-label="Color name" placeholder="Color name" onChange={(e) => set('color', { ...draft.color, name: e.target.value })} />
        )}
      </div>

      {draft.category === 'Top' && (
        <div className="field">
          <span className="sublabel">Sleeves</span>
          <div className="seg">
            {(
              [
                ['short', 'Short sleeve'],
                ['long', 'Long sleeve'],
                ['sleeveless', 'Sleeveless'],
              ] as [Sleeve, string][]
            ).map(([v, label]) => (
              <button key={v} type="button" className="chip" aria-pressed={sleeveOf(draft) === v} onClick={() => set('sleeve', v)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {draft.category === 'Bottom' && (
        <div className="field">
          <span className="sublabel">Length</span>
          <div className="seg">
            {(
              [
                ['shorts', 'Shorts'],
                ['long', 'Pants'],
              ] as [BottomLength, string][]
            ).map(([v, label]) => (
              <button key={v} type="button" className="chip" aria-pressed={lengthOf(draft) === v} onClick={() => set('length', v)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <span className="sublabel">Material · optional</span>
        <div className="seg">
          {MATERIALS.map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={draft.material === m} onClick={() => set('material', draft.material === m ? undefined : m)}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="sublabel">Style</span>
        <div className="seg">
          {(['Plain', 'Graphic'] as const).map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={draft.styleType === s} onClick={() => set('styleType', s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="sublabel">Worn for</span>
        <div className="seg">
          {CONTEXTS.map((c) => (
            <button key={c.value} type="button" className="chip" aria-pressed={draft.contexts.includes(c.value)} onClick={() => toggleContext(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ gap: 0 }}>
        <Switch label="Favorite" checked={draft.isFavorite} onChange={(v) => set('isFavorite', v)} />
        <Switch label="Safe bet" checked={draft.isSafeBet} onChange={(v) => set('isSafeBet', v)} />
        <Switch label="Thrifted" checked={draft.isThrifted} onChange={(v) => set('isThrifted', v)} />
      </div>

      {error && src === undefined && <p style={{ color: '#c62f3c', fontWeight: 600, fontSize: 13, margin: '0 0 12px' }}>{error}</p>}

      <button type="button" className="primary-btn center" disabled={busy || !!status} onClick={save}>
        {item ? 'Save changes' : 'Add to closet'}
      </button>
      {item && (item.contexts.length === 0 || item.contexts.includes('everyday')) && (
        <button
          type="button"
          className="primary-btn outline"
          style={{ marginTop: 8 }}
          onClick={() => {
            try {
              sessionStorage.setItem('outfit.anchor', item.id);
            } catch {
              /* ignore */
            }
            onClose();
            location.hash = 'ideas';
          }}
        >
          <span>Style this piece</span>
          <span>→</span>
        </button>
      )}
      {item && (
        <button type="button" className="text-btn danger" style={{ display: 'block', margin: '14px auto 0' }} onClick={remove}>
          Remove from closet
        </button>
      )}
    </Sheet>
  );
}
