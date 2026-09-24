import { useMemo, useState } from 'react';
import { ItemPhoto, ThemeToggle } from '../components/Common';
import { PlusIcon, StarIcon } from '../components/Icons';
import { ItemForm } from '../components/ItemForm';
import { daysSinceWorn, lastWorn } from '../stats';
import { useSettings, useStore } from '../store';
import { CATEGORIES, CATEGORY_PLURAL, type Category, type ClothingItem } from '../types';

type Filter = 'favorites' | 'safe' | 'stale';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'favorites', label: 'Favorites' },
  { value: 'safe', label: 'Safe bets' },
  { value: 'stale', label: 'Haven’t worn in a while' },
];
const STALE_DAYS = 30;

export function Closet() {
  const { ready, items, logs } = useStore();
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

  const small = columns === 4;

  return (
    <>
      <header className="screen-header groove" style={{ alignItems: 'center' }}>
        <div>
          <h1 className="serif screen-title emboss" style={{ margin: 0 }}>
            Closet
          </h1>
          <div className="screen-sub">
            {items.length} {items.length === 1 ? 'piece' : 'pieces'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ThemeToggle />
          <button type="button" className="square-btn" aria-label="Add item" onClick={() => setEditing('new')}>
            <PlusIcon />
          </button>
        </div>
      </header>

      <nav className="hscroll" style={{ padding: '10px 24px 0', gap: 16 }} aria-label="Categories">
        {(['All', ...CATEGORIES] as const).map((c) => {
          const on = cat === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => setCat(c)}
              style={{ flexShrink: 0, padding: '8px 0 0', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: on ? 'var(--ink)' : 'var(--muted)' }}
            >
              <span style={{ display: 'block', paddingBottom: 4, borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}` }}>{c === 'All' ? 'All' : CATEGORY_PLURAL[c]}</span>
            </button>
          );
        })}
      </nav>

      <div className="hscroll" style={{ padding: '12px 24px 0', gap: 8 }}>
        {FILTERS.map((f) => (
          <button key={f.value} type="button" className="chip" aria-pressed={filters.has(f.value)} onClick={() => toggleFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {ready && items.length === 0 ? (
        <div className="empty" style={{ paddingTop: 48 }}>
          Your closet is empty.
          <br />
          Tap + to add your first piece.
        </div>
      ) : ready && visible.length === 0 ? (
        <div className="empty">Nothing matches.</div>
      ) : null}

      <div style={{ padding: '18px 24px 24px', display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: small ? 10 : 12 }}>
        {visible.map((item) => (
          <button key={item.id} type="button" onClick={() => setEditing(item)} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <div className="photo-well">
              <ItemPhoto photoId={item.photoId} iconSize={small ? 18 : 24} />
              {item.isFavorite && (
                <span style={{ position: 'absolute', top: 5, right: 5, color: 'var(--accent)', display: 'flex', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}>
                  <StarIcon filled size={small ? 10 : 12} />
                </span>
              )}
            </div>
            <span style={{ fontWeight: 600, fontSize: small ? 11 : 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <span className="tag light">
                <span className="swatch" style={{ background: item.color.hex }} />
                {item.color.name}
              </span>
              {!small && <span className="tag dark">{item.styleType}</span>}
            </div>
          </button>
        ))}
      </div>

      {editing && <ItemForm item={editing === 'new' ? undefined : editing} defaultCategory={cat === 'All' ? 'Top' : cat} onClose={() => setEditing(null)} />}
    </>
  );
}
