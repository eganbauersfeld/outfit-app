import { useMemo, useState } from 'react';
import { lastWorn } from '../stats';
import { useStore, type FitRef } from '../store';
import type { Category } from '../types';
import { ItemPhoto, Sheet } from './Common';
import { CheckIcon, PlusIcon } from './Icons';

/** Pick which closet pieces in one category were worn on `date`. Multi-select. */
export function LogPicker({ category, label, fit, onClose, onAddNew }: { category: Category; label: string; fit: FitRef; onClose: () => void; onAddNew: () => void }) {
  const { items, logs, toggleLogged } = useStore();
  const logged = new Set(logs.find((l) => l.id === fit.id)?.itemIds ?? []);
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
            <button key={item.id} type="button" aria-pressed={on} onClick={() => toggleLogged(fit, item.id)} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="photo-well" style={on ? { boxShadow: 'inset 0 0 0 3px var(--ink)' } : undefined}>
                <ItemPhoto photoId={item.photoId} cutout={item.photoCutout} />
                {on && (
                  <span
                    style={{ position: 'absolute', top: 0, right: 0, width: 24, height: 24, background: 'var(--ink)', color: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <CheckIcon size={13} />
                  </span>
                )}
              </div>
              <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 5, textAlign: 'left' }}>
                <span className="swatch" style={{ background: item.color.hex }} />
                {item.name}
              </span>
            </button>
          );
        })}
        <button type="button" onClick={onAddNew} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="photo-well" style={{ border: '1px dashed var(--rule)', background: 'transparent', color: 'var(--ink)' }}>
            <PlusIcon size={18} />
          </div>
          <span className="sublabel">New piece</span>
        </button>
      </div>
    </Sheet>
  );
}
