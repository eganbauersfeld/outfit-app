import { useMemo, useState } from 'react';
import { Artwork } from '../components/Artwork';
import { SettingsButton } from '../components/Common';
import { DayView } from '../components/DayView';
import { fromKey, shortLabel, todayKey } from '../dates';
import { galleryWeeks, wornFits, type WornFit } from '../stats';
import { useStore } from '../store';
import { fitName } from '../types';

// Laid out like a record-label discography: accent band up top, full-bleed square sleeves below.
// Until daily fit photos exist, each day's sleeve is built from the pieces worn that day.
export function Gallery() {
  const { logs, itemsById } = useStore();
  // date -> that day's fits, first to last.
  const worn = useMemo(() => {
    const map = new Map<string, WornFit[]>();
    for (const f of wornFits(logs, itemsById)) map.set(f.date, [...(map.get(f.date) ?? []), f]);
    return map;
  }, [logs, itemsById]);
  const weeks = galleryWeeks(6);
  const today = todayKey();
  const fits = weeks.flatMap((w) => w.days).reduce((n, d) => n + (worn.get(d)?.length ?? 0), 0);
  const [viewing, setViewing] = useState<string | null>(null);
  // Logged days, newest first — the order the day view swipes through.
  const loggedDays = weeks.flatMap((w) => w.days).filter((d) => worn.get(d)?.length);

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
                <Sleeve key={d} date={d} fits={worn.get(d) ?? []} isToday={d === today} onOpen={() => setViewing(d)} />
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
      {viewing && <DayView dates={loggedDays} date={viewing} onDate={setViewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function Sleeve({ date, fits, isToday, onOpen }: { date: string; fits: WornFit[]; isToday: boolean; onOpen: () => void }) {
  const weekday = fromKey(date).toLocaleDateString('en-US', { weekday: 'short' });
  const label = shortLabel(date);
  // The sleeve shows the day's first fit; the others are a tap away in the day view.
  const items = fits[0]?.items ?? [];

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
    <button type="button" onClick={onOpen} aria-label={`${weekday} ${label}: ${fits.map((f, n) => `${fitName(f, n)}: ${f.items.map((i) => i.name).join(', ')}`).join('; ')}`} style={{ aspectRatio: '1', position: 'relative', overflow: 'hidden', display: 'block', background: '#111' }}>
      <Artwork items={items} />
      {fits.length > 1 && (
        <span className="label" style={{ position: 'absolute', top: 6, right: 6, background: 'var(--accent)', color: 'var(--on-accent)', padding: '3px 7px', borderRadius: 999, fontSize: 8 }}>
          {fits.length} fits
        </span>
      )}
      {/* Title band along the bottom, like a sleeve's printed strip */}
      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#111', color: '#f2f0ea', padding: '5px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="display-bold" style={{ fontSize: 13, textTransform: 'uppercase' }}>
          {label}
        </span>
        <span className="label" style={{ fontSize: 8, opacity: 0.6 }}>
          {weekday}
        </span>
      </span>
    </button>
  );
}
