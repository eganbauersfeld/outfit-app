import { useEffect, useMemo, useRef, useState } from 'react';
import { daysBetween, shortLabel, todayKey } from '../dates';
import { lastWorn } from '../stats';
import { useStore } from '../store';
import { lengthOf, sleeveOf, type ClothingItem, type Side } from '../types';
import { idx, PieceImage, Sheet, useLook } from './Common';

const SLEEVE: Record<string, string> = { short: 'Short sleeve', long: 'Long sleeve', sleeveless: 'Sleeveless' };
const CONTEXT: Record<string, string> = { everyday: 'Everyday', 'house-only': 'House only', sports: 'Sports' };

/**
 * Looking through the closet: one piece big, with its details, and a swipe (or ‹ ›) to the next.
 * Editing is one tap away but not in the way.
 */
export function ItemView({ items, id, onId, onEdit, onClose }: { items: ClothingItem[]; id: string; onId: (id: string) => void; onEdit: (item: ClothingItem) => void; onClose: () => void }) {
  const { logs } = useStore();
  const at = items.findIndex((i) => i.id === id);
  const item = items[at];
  const [side, setSide] = useState<Side>('front');
  const shown: Side = item?.back ? side : 'front';
  const { bg, fg, url } = useLook(item ?? items[0], shown);
  const last = useMemo(() => lastWorn(logs), [logs]);
  const days = useMemo(() => new Set(logs.filter((l) => l.itemIds.includes(id)).map((l) => l.date)).size, [logs, id]);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = (step: number) => {
    if (items.length < 2) return;
    onId(items[(at + step + items.length) % items.length].id);
    setSide('front');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!item) return null;
  const lastDate = last.get(item.id);
  const today = todayKey();
  const ago = lastDate ? daysBetween(lastDate, today) : null;
  const rows: [string, React.ReactNode][] = [
    [
      'Color',
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 12, height: 12, background: item.color.hex, boxShadow: 'inset 0 0 0 1px rgba(127,127,127,0.4)' }} />
        {item.color.name}
      </span>,
    ],
    ['Category', item.category === 'Misc' ? 'Misc.' : item.category],
    ...(item.category === 'Top' ? [['Sleeves', SLEEVE[sleeveOf(item)]] as [string, string]] : []),
    ...(item.category === 'Bottom' ? [['Length', lengthOf(item) === 'shorts' ? 'Shorts' : 'Pants'] as [string, string]] : []),
    ...(item.material ? [['Material', item.material] as [string, string]] : []),
    ['Style', item.styleType],
    ['Worn for', item.contexts.map((c) => CONTEXT[c]).join(', ') || '—'],
    ['Worn', days === 0 ? 'Not yet' : `${days} ${days === 1 ? 'day' : 'days'}`],
    ['Last worn', lastDate ? `${shortLabel(lastDate)} · ${ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`}` : '—'],
    ['Added', shortLabel(item.dateAdded.slice(0, 10))],
  ];
  const flags = [item.isFavorite && 'Favorite', item.isSafeBet && 'Safe bet', item.isThrifted && 'Thrifted'].filter(Boolean) as string[];

  return (
    <Sheet title={item.name} onClose={onClose}>
      <div
        style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', background: bg, color: fg, touchAction: 'pan-y' }}
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
        <PieceImage item={item} side={shown} />
        {!url && (
          <span className="display" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', fontSize: 44, lineHeight: 0.95 }}>
            {item.name}
          </span>
        )}
        {flags.length > 0 && (
          <span style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 4 }}>
            {flags.map((f) => (
              <span key={f} className="label" style={{ background: f === 'Favorite' ? 'var(--accent)' : '#111', color: f === 'Favorite' ? 'var(--on-accent)' : '#f2f0ea', padding: '4px 8px', borderRadius: 999, fontSize: 9 }}>
                {f}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Under the picture: front/back (when there is a back) and the way through the closet */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, borderBottom: '1px solid var(--rule)' }}>
        <span role="tablist" aria-label="Photo side" style={{ display: 'flex', gap: 16 }}>
          {item.back ? (
            (['front', 'back'] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={shown === s} className="label" onClick={() => setSide(s)} style={{ padding: '10px 0 8px', color: shown === s ? 'var(--ink)' : 'var(--muted)', boxShadow: shown === s ? 'inset 0 -2px 0 var(--accent)' : 'none' }}>
                {s === 'front' ? 'Front' : 'Back'}
              </button>
            ))
          ) : (
            <span className="label muted">{item.category === 'Misc' ? 'Misc.' : item.category}</span>
          )}
        </span>
        {items.length > 1 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button type="button" className="icon-btn" aria-label="Previous piece" onClick={() => go(-1)} style={{ fontSize: 20, fontWeight: 500 }}>
              ‹
            </button>
            <span className="index" style={{ minWidth: 52, textAlign: 'center' }}>
              {idx(at)} / {String(items.length).padStart(2, '0')}
            </span>
            <button type="button" className="icon-btn" aria-label="Next piece" onClick={() => go(1)} style={{ fontSize: 20, fontWeight: 500 }}>
              ›
            </button>
          </span>
        )}
      </div>

      <dl style={{ margin: '4px 0 20px' }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--rule-soft)', alignItems: 'baseline' }}>
            <dt className="label muted">{k}</dt>
            <dd style={{ margin: 0, fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' }}>{v}</dd>
          </div>
        ))}
      </dl>

      <button type="button" className="primary-btn" onClick={() => onEdit(item)}>
        <span>Edit piece</span>
        <span>→</span>
      </button>
      {(item.contexts.length === 0 || item.contexts.includes('everyday')) && (
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
    </Sheet>
  );
}
