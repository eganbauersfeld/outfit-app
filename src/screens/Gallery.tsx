import { useMemo, useState } from 'react';
import { SettingsButton, usePhotoUrl } from '../components/Common';
import { fromKey, shortLabel, todayKey } from '../dates';
import { galleryWeeks, wornByDate } from '../stats';
import { useStore } from '../store';
import type { ClothingItem } from '../types';

// Laid out like a record-label discography: accent band up top, full-bleed square sleeves below.
// Until daily fit photos exist, each day's sleeve is built from the pieces worn that day.
export function Gallery() {
  const { logs, itemsById } = useStore();
  const worn = useMemo(() => wornByDate(logs, itemsById), [logs, itemsById]);
  const weeks = galleryWeeks(6);
  const today = todayKey();
  const fits = weeks.flatMap((w) => w.days).filter((d) => (worn.get(d)?.length ?? 0) > 0).length;
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <header style={{ background: 'var(--accent)', color: 'var(--on-accent)', padding: 'calc(22px + env(safe-area-inset-top)) 20px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="display-bold" style={{ margin: 0, fontSize: 44, textTransform: 'uppercase', letterSpacing: '-0.035em', transform: 'scaleX(0.86)', transformOrigin: 'left' }}>
          Gallery
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="label" style={{ background: '#111', color: 'var(--accent)', padding: '6px 11px', borderRadius: 999 }}>
            {fits} {fits === 1 ? 'fit' : 'fits'}
          </span>
          <SettingsButton />
        </div>
      </header>

      {weeks.map((w) => {
        const logged = w.days.filter((d) => (worn.get(d)?.length ?? 0) > 0).length;
        return (
          <section key={w.title}>
            <div className="label" style={{ background: '#111', color: '#e7e6e2', padding: '7px 20px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{w.title}</span>
              <span style={{ opacity: 0.55 }}>
                {logged}/{w.days.length} logged
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {w.days.map((d) => (
                <Sleeve key={d} date={d} items={worn.get(d) ?? []} isToday={d === today} open={open === d} onToggle={() => setOpen(open === d ? null : d)} />
              ))}
              {/* Close out the last row with blank black sleeves so the grid stays solid. */}
              {Array.from({ length: (3 - (w.days.length % 3)) % 3 }, (_, i) => (
                <div key={`fill-${i}`} aria-hidden style={{ aspectRatio: '1', background: '#0c0c0c' }} />
              ))}
            </div>
          </section>
        );
      })}
      <div style={{ height: 24 }} />
    </>
  );
}

function Sleeve({ date, items, isToday, open, onToggle }: { date: string; items: ClothingItem[]; isToday: boolean; open: boolean; onToggle: () => void }) {
  const weekday = fromKey(date).toLocaleDateString('en-US', { weekday: 'short' });
  const label = shortLabel(date);

  if (items.length === 0) {
    if (isToday) {
      return (
        <button type="button" onClick={() => (location.hash = 'today')} style={{ aspectRatio: '1', background: 'var(--accent)', color: 'var(--on-accent)', padding: 10, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span className="label">Today</span>
          <span className="display-bold" style={{ fontSize: 24, textTransform: 'uppercase' }}>
            Log it →
          </span>
        </button>
      );
    }
    // Unlogged day: a plain black sleeve with the date set in gray, like a blank label.
    return (
      <div style={{ aspectRatio: '1', background: '#141414', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.06)' }}>
        <span className="display-bold" style={{ color: '#4a4a46', fontSize: 22, textTransform: 'uppercase' }}>
          {label}
        </span>
        <span className="label" style={{ color: '#3a3a37' }}>
          {weekday}
        </span>
      </div>
    );
  }

  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`${weekday} ${label}: ${items.map((i) => i.name).join(', ')}`} style={{ aspectRatio: '1', position: 'relative', overflow: 'hidden', display: 'block', background: '#111' }}>
      <Artwork items={items} />
      {/* Title band along the bottom, like a sleeve's printed strip */}
      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#111', color: '#f2f0ea', padding: '5px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="display-bold" style={{ fontSize: 13, textTransform: 'uppercase' }}>
          {label}
        </span>
        <span className="label" style={{ fontSize: 8, opacity: 0.6 }}>
          {weekday}
        </span>
      </span>
      {open && (
        <span style={{ position: 'absolute', inset: 0, background: 'rgba(10,10,10,0.82)', color: '#f2f0ea', padding: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 6 }}>
          <span className="label" style={{ opacity: 0.6 }}>
            {weekday} · {items.length} pcs
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {items.slice(0, 5).map((i) => (
              <span key={i.id} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '-0.01em' }}>
                {i.name}
              </span>
            ))}
            {items.length > 5 && <span style={{ fontSize: 10, opacity: 0.6 }}>+{items.length - 5} more</span>}
          </span>
        </span>
      )}
    </button>
  );
}

/** The day's pieces: photos in a mosaic when there are any, otherwise their colors as bands. */
function Artwork({ items }: { items: ClothingItem[] }) {
  const withPhotos = items.filter((i) => i.photoId).slice(0, 4);
  if (withPhotos.length) {
    const cols = withPhotos.length === 1 ? 1 : 2;
    return (
      <span style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: '1fr', gap: 1, background: '#111' }}>
        {withPhotos.map((i, n) => (
          <PhotoCell key={i.id} photoId={i.photoId!} span={withPhotos.length === 3 && n === 0} />
        ))}
      </span>
    );
  }
  return (
    <span style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      {items.map((i) => (
        <span key={i.id} style={{ flex: 1, background: i.color.hex }} />
      ))}
    </span>
  );
}

function PhotoCell({ photoId, span }: { photoId: string; span: boolean }) {
  const url = usePhotoUrl(photoId);
  return (
    <span style={{ gridRow: span ? 'span 2' : undefined, background: '#1b1b1b', overflow: 'hidden' }}>
      {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
    </span>
  );
}
