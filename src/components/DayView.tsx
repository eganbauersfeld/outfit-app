import { useEffect, useMemo, useRef, useState } from 'react';
import { fromKey, shortLabel } from '../dates';
import { fitUniqueness, wornFits, type WornFit } from '../stats';
import { useStore } from '../store';
import { CATEGORIES, fitName, type Category } from '../types';
import { Artwork } from './Artwork';
import { idx, ItemPhoto, Sheet } from './Common';
import { ItemForm } from './ItemForm';
import { LogPicker } from './LogPicker';

const CAT_LABEL: Record<Category, string> = { Top: 'Top', Bottom: 'Bottom', Outerwear: 'Outerwear', Shoes: 'Shoes', Sunglasses: 'Shades', Misc: 'Misc.' };

type Mode = { kind: 'view' } | { kind: 'edit' } | { kind: 'pick'; category: Category } | { kind: 'add'; category: Category };

/**
 * One logged day from the Gallery, big: the fit's pieces, how it felt out, how unique it was,
 * and a swipe (or ‹ ›) to the next day. Edit changes that day's fit like Today does.
 */
export function DayView({ dates, date, onDate, onClose }: { dates: string[]; date: string; onDate: (d: string) => void; onClose: () => void }) {
  const { logs, itemsById, deleteFit } = useStore();
  const all = useMemo(() => wornFits(logs, itemsById), [logs, itemsById]);
  const fits = all.filter((f) => f.date === date);
  const [fitId, setFitId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  // While editing, stay on the fit being edited even if it's emptied for a moment.
  const chosen = fits.find((f) => f.id === fitId);
  const fit = mode.kind === 'view' || !fitId ? (chosen ?? fits[0]) : chosen;
  const at = dates.indexOf(date);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = (step: number) => {
    const next = dates[at + step];
    if (!next) return;
    onDate(next);
    setFitId(null);
  };

  // Everything logged that day was removed: nothing left to look at.
  const empty = mode.kind === 'view' && fits.length === 0;
  useEffect(() => {
    if (empty) onClose();
  }, [empty, onClose]);

  useEffect(() => {
    if (mode.kind !== 'view') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const weekday = fromKey(date).toLocaleDateString('en-US', { weekday: 'long' });
  const title = `${weekday.slice(0, 3)} ${shortLabel(date)}`;
  const fitIndex = fit ? fits.indexOf(fit) : 0;
  const ref = fit ?? { id: fitId ?? `log-${date}`, date };

  if (mode.kind === 'pick')
    return (
      <LogPicker
        category={mode.category}
        label={`${CAT_LABEL[mode.category]} · ${title}`}
        fit={ref}
        onClose={() => setMode({ kind: 'edit' })}
        onAddNew={() => setMode({ kind: 'add', category: mode.category })}
      />
    );
  if (mode.kind === 'add') return <ItemForm defaultCategory={mode.category} onClose={() => setMode({ kind: 'pick', category: mode.category })} />;
  if (mode.kind === 'edit')
    return (
      <FitEditor
        fit={fit}
        title={fits.length > 1 && fit ? `${title} · ${fitName(fit, fitIndex)}` : title}
        onPick={(category) => setMode({ kind: 'pick', category })}
        onRemove={async () => {
          if (!fit || !confirm(`Remove this fit from ${title}? The pieces stay in your closet.`)) return;
          await deleteFit(fit.id);
          setFitId(null);
          setMode({ kind: 'view' });
        }}
        onClose={() => setMode({ kind: 'view' })}
      />
    );
  if (!fit) return null;

  const unique = fitUniqueness(all, all.indexOf(fit));
  const weather = logs.find((l) => l.id === fit.id)?.weather;
  const byCategory = CATEGORIES.flatMap((c) => fit.items.filter((i) => i.category === c));

  return (
    <Sheet title={title} onClose={onClose}>
      {fits.length > 1 && (
        <div role="tablist" aria-label="Fits this day" className="hscroll" style={{ gap: 16, marginTop: -8, marginBottom: 10 }}>
          {fits.map((f, n) => (
            <button key={f.id} type="button" role="tab" aria-selected={f.id === fit.id} className="label" onClick={() => setFitId(f.id)} style={{ flexShrink: 0, padding: '8px 0 6px', color: f.id === fit.id ? 'var(--ink)' : 'var(--muted)', boxShadow: f.id === fit.id ? 'inset 0 -2px 0 var(--accent)' : 'none' }}>
              {fitName(f, n)}
            </button>
          ))}
        </div>
      )}

      <div
        style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', background: '#111', touchAction: 'pan-y' }}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x;
          const dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
        }}
      >
        <Artwork items={fit.items} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, borderBottom: '1px solid var(--rule)' }}>
        <span className="label muted">
          {String(fit.items.length).padStart(2, '0')} {fit.items.length === 1 ? 'piece' : 'pieces'}
        </span>
        {dates.length > 1 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button type="button" className="icon-btn" aria-label="Newer day" disabled={at <= 0} onClick={() => go(-1)} style={{ fontSize: 20, fontWeight: 500, opacity: at <= 0 ? 0.3 : 1 }}>
              ‹
            </button>
            <span className="index" style={{ minWidth: 52, textAlign: 'center' }}>
              {idx(at)} / {String(dates.length).padStart(2, '0')}
            </span>
            <button type="button" className="icon-btn" aria-label="Older day" disabled={at >= dates.length - 1} onClick={() => go(1)} style={{ fontSize: 20, fontWeight: 500, opacity: at >= dates.length - 1 ? 0.3 : 1 }}>
              ›
            </button>
          </span>
        )}
      </div>

      {/* Two numbers, Swiss style, then the pieces */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--rule)' }}>
        <Stat value={`${unique}`} label="Unique" />
        <Stat value={weather ? `${weather.feelsMin}–${weather.feelsMax}°` : '—'} label="Felt like" left />
      </div>

      <ul style={{ listStyle: 'none', margin: '0 0 20px', padding: 0 }}>
        {byCategory.map((i) => (
          <li key={i.id} style={{ display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--rule-soft)' }}>
            <span className="photo-well" style={{ width: 48 }}>
              <ItemPhoto photoId={i.photoId} cutout={i.photoCutout} iconSize={16} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</span>
              <span className="label muted" style={{ fontSize: 9 }}>
                {i.color.name}
              </span>
            </span>
            <span className="label muted">{CAT_LABEL[i.category]}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="primary-btn"
        onClick={() => {
          setFitId(fit.id);
          setMode({ kind: 'edit' });
        }}
      >
        <span>Edit {fits.length > 1 ? 'this fit' : 'fit'}</span>
        <span>→</span>
      </button>
    </Sheet>
  );
}

function Stat({ value, label, left }: { value: string; label: string; left?: boolean }) {
  return (
    <div style={{ padding: '12px 0 10px', paddingLeft: left ? 14 : 0, borderLeft: left ? '1px solid var(--rule)' : 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="display" style={{ fontSize: 34, lineHeight: 1, whiteSpace: 'nowrap' }}>
        {value}
      </span>
      <span className="label muted">{label}</span>
    </div>
  );
}

/** A past day's fit, category by category; each row opens the same picker Today uses. */
function FitEditor({ fit, title, onPick, onRemove, onClose }: { fit: WornFit | undefined; title: string; onPick: (c: Category) => void; onRemove: () => void; onClose: () => void }) {
  return (
    <Sheet title="Edit fit" onClose={onClose}>
      <p className="label muted" style={{ margin: '-6px 0 10px' }}>
        {title}
      </p>
      <div style={{ borderTop: '1px solid var(--rule)', marginBottom: 20 }}>
        {CATEGORIES.map((c, n) => {
          const on = fit?.items.filter((i) => i.category === c) ?? [];
          return (
            <button key={c} type="button" onClick={() => onPick(c)} style={{ width: '100%', display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'baseline', padding: '13px 0', borderBottom: '1px solid var(--rule-soft)', textAlign: 'left' }}>
              <span className="index">{idx(n)}</span>
              <span style={{ minWidth: 0 }}>
                <span className="grot" style={{ display: 'block', fontSize: 17 }}>
                  {CAT_LABEL[c]}
                </span>
                {on.length > 0 && (
                  <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                    {on.map((i) => i.name).join(', ')}
                  </span>
                )}
              </span>
              <span className="label">{on.length ? 'Change' : '+ Add'}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="primary-btn center" onClick={onClose}>
        Done
      </button>
      {fit && (
        <button type="button" className="text-btn danger" style={{ display: 'block', margin: '14px auto 0' }} onClick={onRemove}>
          Remove this fit
        </button>
      )}
    </Sheet>
  );
}
