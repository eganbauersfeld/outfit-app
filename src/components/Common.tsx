import { useEffect, useState, type ReactNode } from 'react';
import { getPhoto } from '../db';
import { useSettings } from '../store';
import { MoonIcon, PhotoPlaceholder, SunIcon } from './Icons';

export function ThemeToggle() {
  const { theme, toggleTheme } = useSettings();
  return (
    <button type="button" className="round-btn" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

// Object URLs are cached per photo id so re-renders don't flicker.
const urlCache = new Map<string, string>();

export function ItemPhoto({ photoId, iconSize = 24 }: { photoId?: string; iconSize?: number }) {
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
  return url ? <img src={url} alt="" /> : <PhotoPlaceholder size={iconSize} />;
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
        <div className="sheet-grip" />
        <div className="sheet-head groove">
          <h2 className="serif sheet-title emboss" style={{ margin: 0 }}>
            {title}
          </h2>
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
