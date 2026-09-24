import { useEffect, useRef, useState } from 'react';
import { hasTransparentBackground } from '../cutout';
import { getPhoto } from '../db';
import { useSettings, useStore } from '../store';
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
  const { items, saveItem, removeItem, studio } = useStore();
  const { autoStudio } = useSettings();
  const [draft, setDraft] = useState<ClothingItem>(() => item ?? blank(defaultCategory));
  // `src` is a photo to save (undefined = unchanged, null = removed). `srcIsNew` marks a freshly
  // picked photo (queued for a studio cleanup) as opposed to a restored original (kept as is).
  const [src, setSrc] = useState<Blob | null | undefined>(undefined);
  const [srcIsNew, setSrcIsNew] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isPreset = COLOR_PRESETS.some((c) => c.name === draft.color.name && c.hex === draft.color.hex);
  // The queue may finish this piece while the editor is open; show (and keep) its latest photo.
  const live = items.find((i) => i.id === draft.id);
  const photoId = live?.photoId ?? draft.photoId;
  const cutout = live ? live.photoCutout : draft.photoCutout;
  const pending = (live?.photoPending || draft.photoPending) && !cutout;
  const beingWorkedOn = pending && studio.working === (live ?? draft).name;

  useEffect(() => {
    if (!src) return setPreview(null);
    const u = URL.createObjectURL(src);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [src]);

  async function restoreOriginal() {
    if (!photoId) return;
    const blob = await getPhoto(originalPhotoKey(photoId));
    if (!blob) return setError('The original isn’t stored for this photo.');
    setSrc(blob);
    setSrcIsNew(false);
  }

  const set = <K extends keyof ClothingItem>(key: K, value: ClothingItem[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setSrc(await resizeImage(file));
      setSrcIsNew(true);
      setError(null);
    } catch {
      setError('Couldn’t read that photo.');
    }
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
      if (src === null) await saveItem({ ...next, photoCutout: undefined, photoPending: undefined, studioFailed: undefined }, null);
      // A new photo saves right away; the studio version swaps in when the queue gets to it.
      else if (src) await saveItem({ ...next, photoCutout: false, photoPending: srcIsNew && autoStudio, studioFailed: false }, src);
      // Photo untouched: keep whatever the queue has done to it in the meantime.
      else await saveItem({ ...next, photoId, photoCutout: cutout, photoPending: pending, studioFailed: live?.studioFailed && !draft.photoPending });
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

  const photoNote =
    src && srcIsNew
      ? autoStudio
        ? 'Saves right away — the studio version swaps in a few seconds later.'
        : 'Auto studio cleanup is off (Settings). Use Clean up closet when you like.'
      : src === undefined && beingWorkedOn
        ? 'Cleaning up this photo now…'
        : src === undefined && pending
          ? 'Queued for a studio cleanup.'
          : src === undefined && live?.studioFailed
            ? 'Couldn’t pick out the piece in this photo — a plainer background helps.'
            : null;

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
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: photoNote || error ? 8 : 18 }}>
        <button type="button" className="photo-well" style={{ width: 132, background: src === undefined && cutout ? STUDIO : undefined }} aria-label="Add photo" onClick={() => fileRef.current?.click()}>
          {preview ? <img src={preview} alt="" /> : src === null ? <ItemPhoto /> : <ItemPhoto photoId={photoId} cutout={cutout} />}
          {src === undefined && beingWorkedOn && (
            <span style={{ position: 'absolute', inset: 0, background: 'rgba(17,17,17,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="spinner" aria-hidden />
            </span>
          )}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <button type="button" className="text-btn" style={{ textAlign: 'left' }} onClick={() => fileRef.current?.click()}>
            {photoId || preview ? 'Change photo' : 'Add photo'}
          </button>
          {src === undefined && photoId && !cutout && !pending && (
            <button
              type="button"
              className="text-btn"
              style={{ textAlign: 'left' }}
              onClick={() => setDraft((d) => ({ ...d, photoPending: true, studioFailed: false }))}
            >
              Make studio photo
            </button>
          )}
          {src === undefined && photoId && cutout && (
            <button type="button" className="text-btn muted" style={{ textAlign: 'left' }} onClick={restoreOriginal}>
              Restore original
            </button>
          )}
          {(photoId || preview) && src !== null && (
            <button type="button" className="text-btn muted" style={{ textAlign: 'left' }} onClick={() => setSrc(null)}>
              Remove photo
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
      </div>
      {error && <p style={{ color: '#c62f3c', fontWeight: 600, fontSize: 12, margin: '0 0 16px', lineHeight: 1.4 }}>{error}</p>}
      {!error && photoNote && (
        <p className="muted" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 16px', lineHeight: 1.4 }}>
          {photoNote}
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


      {error && <p style={{ color: '#c62f3c', fontWeight: 600, fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
      <button type="button" className="primary-btn center" disabled={busy} onClick={save}>
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
