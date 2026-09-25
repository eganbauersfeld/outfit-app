import { useEffect, useState, type ReactNode } from 'react';
import { textOn } from '../color';
import { getPhoto } from '../db';
import type { ClothingItem, Side } from '../types';
import { GearIcon, PhotoPlaceholder } from './Icons';

// Settings and the location picker live at app level; any screen can open them.
export const openSettings = () => dispatchEvent(new Event('outfit:open-settings'));
export const openLocation = () => dispatchEvent(new Event('outfit:open-location'));

export function SettingsButton() {
  return (
    <button type="button" className="icon-btn" aria-label="Settings" onClick={openSettings}>
      <GearIcon size={17} />
    </button>
  );
}

// Object URLs are cached per photo id so re-renders don't flicker.
const urlCache = new Map<string, string>();

export function usePhotoUrl(photoId?: string) {
  const [url, setUrl] = useState(() => (photoId ? urlCache.get(photoId) : undefined));
  useEffect(() => {
    if (!photoId) return setUrl(undefined);
    const cached = urlCache.get(photoId);
    if (cached) return setUrl(cached);
    let alive = true;
    getPhoto(photoId).then((blob) => {
      if (!blob || !alive) return;
      const u = URL.createObjectURL(blob);
      urlCache.set(photoId, u);
      setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [photoId]);
  return url;
}

/** The one studio backdrop every cutout sits on, in both themes (dark clothes vanish on dark). */
export const STUDIO = '#E4E2DC';

/** How a piece should be drawn: studio cutout, ordinary photo, or its color when there's no photo. */
export function useLook(item: ClothingItem, side: Side = 'front') {
  const back = side === 'back' ? item.back : undefined;
  const url = usePhotoUrl(back ? back.photoId : item.photoId);
  if (url && (back ? back.cutout : item.photoCutout)) return { url, studio: true, bg: STUDIO, fg: '#111111' };
  if (url) return { url, studio: false, bg: '#111111', fg: '#FFFFFF' };
  return { url: undefined, studio: false, bg: item.color.hex, fg: textOn(item.color.hex) };
}

/**
 * Fills its (position: relative) parent with the piece's photo. Cutouts sit on the studio backdrop
 * with a soft shadow; `label` leaves room at the bottom for a name. Ordinary photos cover the tile,
 * with an optional shade so white text stays readable.
 */
export function PieceImage({ item, label = false, shade = 'none', side = 'front' }: { item: ClothingItem; label?: boolean; shade?: 'none' | 'bottom' | 'both'; side?: Side }) {
  const { url, studio } = useLook(item, side);
  if (!url) return null;
  if (studio)
    return (
      <span style={{ position: 'absolute', inset: 0, background: STUDIO }}>
        <img
          src={url}
          alt=""
          style={{ position: 'absolute', left: '8%', top: label ? '15%' : '6%', width: label ? '84%' : '88%', height: label ? '58%' : '88%', objectFit: 'contain', filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.18))' }}
        />
      </span>
    );
  return (
    <>
      <img src={url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      {shade !== 'none' && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            background: shade === 'both' ? 'linear-gradient(180deg, rgba(0,0,0,0.3), rgba(0,0,0,0) 26%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5))' : 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55))',
          }}
        />
      )}
    </>
  );
}

export function ItemPhoto({ photoId, cutout, iconSize = 24 }: { photoId?: string; cutout?: boolean; iconSize?: number }) {
  const url = usePhotoUrl(photoId);
  if (!url) return <PhotoPlaceholder size={iconSize} />;
  if (cutout)
    return (
      <span style={{ position: 'absolute', inset: 0, background: STUDIO }}>
        <img src={url} alt="" style={{ position: 'absolute', inset: '6%', width: '88%', height: '88%', objectFit: 'contain', filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.18))' }} />
      </span>
    );
  return <img src={url} alt="" />;
}

export function Sheet({ title, onClose, children, action }: { title: string; onClose: () => void; children: ReactNode; action?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 className="display sheet-title">{title}</h2>
          {action ?? (
            <button type="button" className="text-btn" onClick={onClose}>
              Done
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="switch-row">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
    </div>
  );
}

/** Two-digit index, Swiss style: 01, 02 … */
export const idx = (n: number) => String(n + 1).padStart(2, '0');
