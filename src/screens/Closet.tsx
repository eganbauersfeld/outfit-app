import { useMemo, useState } from 'react';
import { PieceImage, SettingsButton, useLook } from '../components/Common';
import { PlusIcon } from '../components/Icons';
import { ItemForm } from '../components/ItemForm';
import { daysSinceWorn, lastWorn } from '../stats';
import { useSettings, useStore } from '../store';
import { CATEGORIES, CATEGORY_PLURAL, type Category, type ClothingItem, type Side } from '../types';

type Filter = 'favorites' | 'safe' | 'stale';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'favorites', label: 'Favorites' },
  { value: 'safe', label: 'Safe bets' },
  { value: 'stale', label: 'Haven’t worn in a while' },
];
const STALE_DAYS = 30;

export function Closet() {
  const { ready, items, logs, studio } = useStore();
  const { columns } = useSettings();
  const [cat, setCat] = useState<Category | 'All'>('All');
  const [filters, setFilters] = useState<Set<Filter>>(new Set());
  const [editing, setEditing] = useState<ClothingItem | 'new' | null>(null);
  const last = useMemo(() => lastWorn(logs), [logs]);

  const visible = items.filter(
    (i) =>
      (cat === 'All' || i.category === cat) &&
      (!filters.has('favorites') || i.isFavorite) &&
      (!filters.has('safe') || i.isSafeBet) &&
      (!filters.has('stale') || daysSinceWorn(i, last) >= STALE_DAYS),
  );

  const toggleFilter = (f: Filter) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  return (
    <>
      <header className="screen-header">
        <h1 className="display screen-title">
          Closet
          <sup className="label" style={{ fontFamily: 'var(--sans)', fontSize: 11, verticalAlign: 'top', marginLeft: 6, letterSpacing: '0.08em' }}>
            {String(items.length).padStart(2, '0')}
          </sup>
        </h1>
        <div style={{ display: 'flex', marginRight: -10, paddingBottom: 4 }}>
          <SettingsButton />
          <button type="button" className="icon-btn" aria-label="Add item" onClick={() => setEditing('new')} style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
            <PlusIcon size={18} />
          </button>
        </div>
      </header>

      {studio.pending > 0 && (
        <div className="label rule-t" style={{ margin: '0 20px', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 8 }} role="status">
          <span className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5, borderColor: 'var(--rule-soft)', borderTopColor: 'var(--ink)' }} aria-hidden />
          {studio.stalled ? 'Studio photos paused — waiting for a connection' : `Making studio photos · ${studio.pending} left`}
        </div>
      )}
      <nav className="hscroll rule-t" style={{ margin: '0 20px', gap: 18 }} aria-label="Categories">
        {(['All', ...CATEGORIES] as const).map((c) => {
          const on = cat === c;
          return (
            <button key={c} type="button" aria-pressed={on} onClick={() => setCat(c)} style={{ flexShrink: 0, padding: '10px 0 8px', fontWeight: on ? 800 : 600, fontSize: 14, letterSpacing: '-0.02em', color: on ? 'var(--ink)' : 'var(--muted)', boxShadow: on ? 'inset 0 -2px 0 var(--ink)' : 'none' }}>
              {c === 'All' ? 'All' : CATEGORY_PLURAL[c]}
            </button>
          );
        })}
      </nav>

      <div className="hscroll rule-t" style={{ padding: '10px 20px 14px', gap: 6 }}>
        {FILTERS.map((f) => (
          <button key={f.value} type="button" className="chip" aria-pressed={filters.has(f.value)} onClick={() => toggleFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {ready && items.length === 0 ? (
        <div className="rule-t" style={{ padding: '32px 20px' }}>
          <div className="display" style={{ fontSize: 44 }}>
            Empty.
          </div>
          <p className="muted" style={{ fontWeight: 600, fontSize: 14, margin: '12px 0 18px', maxWidth: 260 }}>
            Add the pieces you actually wear. A photo helps, but the color alone works.
          </p>
          <button type="button" className="primary-btn" onClick={() => setEditing('new')}>
            <span>Add first piece</span>
            <span>+</span>
          </button>
        </div>
      ) : ready && visible.length === 0 ? (
        <div className="empty rule-t">Nothing matches.</div>
      ) : null}

      {visible.length > 0 && (
        <div className="hairgrid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {visible.map((item) => (
            <Tile key={item.id} item={item} small={columns === 4} onClick={() => setEditing(item)} />
          ))}
        </div>
      )}
      <div style={{ height: 24 }} />

      {editing && <ItemForm item={editing === 'new' ? undefined : editing} defaultCategory={cat === 'All' ? 'Top' : cat} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Photo if there is one; otherwise the piece's own color, with its name set on it like a record sleeve. */
function Tile({ item, small, onClick }: { item: ClothingItem; small: boolean; onClick: () => void }) {
  const [side, setSide] = useState<Side>('front');
  const shown: Side = item.back ? side : 'front';
  const { bg, fg } = useLook(item, shown);
  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <button type="button" onClick={onClick} aria-label={item.name} style={{ position: 'relative', aspectRatio: '1', width: '100%', overflow: 'hidden', background: bg, color: fg, display: 'block' }}>
        <PieceImage item={item} label shade="both" side={shown} />
        <span style={{ position: 'absolute', top: 7, left: 8, right: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span className="tag" style={{ opacity: 0.8 }}>
            {small ? item.color.name.slice(0, 3) : item.color.name}
          </span>
          <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {((item.photoPending && !item.photoCutout) || item.back?.pending) && (
              <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5, borderColor: 'rgba(127,127,127,0.35)', borderTopColor: 'currentColor' }} aria-label="Making studio photo" />
            )}
            {item.isFavorite && <span style={{ width: 7, height: 7, background: 'var(--accent)', boxShadow: '0 0 0 1px rgba(0,0,0,0.25)' }} aria-label="Favorite" />}
          </span>
        </span>
        <span style={{ position: 'absolute', left: 8, right: item.back ? 30 : 8, bottom: 7, textAlign: 'left' }}>
          <span className="grot" style={{ display: 'block', fontSize: small ? 12 : 15, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.name}
          </span>
          {!small && (
            <span className="tag" style={{ marginTop: 4, opacity: 0.75 }}>
              {shown === 'back' ? 'Back' : item.styleType}
              {shown === 'front' && item.isThrifted ? ' · Thrifted' : ''}
            </span>
          )}
        </span>
      </button>
      {item.back && (
        // Sits beside the tile's button (not inside it) so flipping doesn't open the editor.
        <button
          type="button"
          onClick={() => setSide(shown === 'front' ? 'back' : 'front')}
          aria-label={shown === 'front' ? `Show the back of ${item.name}` : `Show the front of ${item.name}`}
          aria-pressed={shown === 'back'}
          style={{ position: 'absolute', right: 0, bottom: 0, width: 34, height: 34, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 6, color: fg }}
        >
          <FlipBadge back={shown === 'back'} />
        </button>
      )}
    </div>
  );
}

/** Two stacked squares; the front one is filled on the side being shown. */
function FlipBadge({ back }: { back: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}>
      <rect x="1.5" y="4.5" width="10" height="12" rx="1" fill={back ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="1.4" />
      <rect x="6.5" y="1.5" width="10" height="12" rx="1" fill={back ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
