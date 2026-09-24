import { useMemo, useState } from 'react';
import { lastWorn } from '../stats';
import { useStore } from '../store';
import type { Category } from '../types';
import { ItemPhoto, Sheet } from './Common';
import { CheckIcon, PlusIcon } from './Icons';

/** Pick which closet pieces in one category were worn on `date`. Multi-select. */
export function LogPicker({ category, label, date, onClose, onAddNew }: { category: Category; label: string; date: string; onClose: () => void; onAddNew: () => void }) {
  const { items, logs, toggleLogged } = useStore();
  const logged = new Set(logs.filter((l) => l.date === date).flatMap((l) => l.itemIds));
  // Most recently worn first — the usual suspects are at the top. The order is fixed when
  // the sheet opens so tiles don't jump around as today's picks change it.
  const [order] = useState(() => {
    const last = lastWorn(logs);
    return new Map(
      items
        .filter((i) => i.category === category)
        .sort((a, b) => (last.get(b.id) ?? '').localeCompare(last.get(a.id) ?? '') || a.name.localeCompare(b.name))
        .map((i, n) => [i.id, n]),
    );
  });
  const list = useMemo(
    () => items.filter((i) => i.category === category).sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1)),
    [items, category, order],
  );

  return (
    <Sheet title={label} onClose={onClose}>
      {list.length === 0 && <div className="empty">Nothing in this category yet.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        {list.map((item) => {
          const on = logged.has(item.id);
          return (
            <button key={item.id} type="button" aria-pressed={on} onClick={() => toggleLogged(date, item.id)} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="photo-well" style={on ? { outline: '2px solid var(--accent)', outlineOffset: 2 } : undefined}>
                <ItemPhoto photoId={item.photoId} />
                {on && (
                  <span
                    style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 99, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
                  >
                    <CheckIcon size={13} />
                  </span>
                )}
              </div>
              <span style={{ fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="swatch" style={{ background: item.color.hex }} />
                {item.name}
              </span>
            </button>
          );
        })}
        <button type="button" onClick={onAddNew} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="photo-well" style={{ borderStyle: 'dashed' }}>
            <PlusIcon size={18} />
          </div>
          <span className="sublabel">New piece</span>
        </button>
      </div>
    </Sheet>
  );
}
