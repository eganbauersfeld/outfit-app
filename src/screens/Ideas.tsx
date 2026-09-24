import { useEffect, useMemo, useState } from 'react';
import { AiError, aiCombos, getApiKey } from '../ai';
import { textOn } from '../color';
import { idx, openSettings, SettingsButton, usePhotoUrl } from '../components/Common';
import { WeatherGlyph } from '../components/Icons';
import { todayKey } from '../dates';
import { rankSlot, ruleCombos, SLOT_ORDER, starterFor, type Combo } from '../ideas';
import { useStore } from '../store';
import type { ClothingItem } from '../types';
import { useWeather } from '../weather';

// The key feature: start him off with a weather-shaped nudge, then — only if he wants —
// build real outfits from his closet, shown as pictures he can tweak piece by piece.

const SAVED = 'outfit.ideas';
type Saved = { date: string; combos: Combo[]; note?: string };

function loadSaved(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(SAVED) ?? 'null') as Saved | null;
    return s && s.date === todayKey() ? s : null;
  } catch {
    return null;
  }
}
function save(s: Saved | null) {
  try {
    if (s) localStorage.setItem(SAVED, JSON.stringify(s));
    else localStorage.removeItem(SAVED);
  } catch {
    /* ignore */
  }
}

export function Ideas() {
  const { items, logs, itemsById, logOutfit } = useStore();
  const { weather } = useWeather();
  const starter = starterFor(weather);
  const [saved, setSaved] = useState<Saved | null>(loadSaved);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<string[] | null>(null);
  const hasKey = !!getApiKey();

  useEffect(() => save(saved), [saved]);

  async function build() {
    setBusy(true);
    setMissing(null);
    const key = getApiKey();
    let note: string | undefined;
    if (key) {
      try {
        const combos = await aiCombos(key, items, logs, weather, starter);
        setSaved({ date: todayKey(), combos });
        setBusy(false);
        return;
      } catch (e) {
        note = `${e instanceof AiError ? e.message : 'Claude didn’t answer.'} Showing rule-based picks instead.`;
      }
    }
    const r = ruleCombos(items, logs, starter);
    if ('missing' in r) setMissing(r.missing);
    else setSaved({ date: todayKey(), combos: r.combos, note });
    setBusy(false);
  }

  const swap = (comboIndex: number, itemId: string) => {
    if (!saved) return;
    const item = itemsById.get(itemId);
    if (!item) return;
    const ranked = rankSlot(item.category, items, logs, starter);
    if (ranked.length < 2) return;
    const next = ranked[(ranked.findIndex((i) => i.id === itemId) + 1) % ranked.length];
    const combos = saved.combos.map((c, n) => (n === comboIndex ? { ...c, itemIds: c.itemIds.map((id) => (id === itemId ? next.id : id)) } : c));
    setSaved({ ...saved, combos });
  };

  const todaysLog = logs.find((l) => l.date === todayKey());

  return (
    <>
      <header className="screen-header">
        <h1 className="display screen-title">Ideas</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: -10, paddingBottom: 4 }}>
          {weather && (
            <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <WeatherGlyph icon={weather.icon} size={16} />
              {weather.temp}°
            </span>
          )}
          <SettingsButton />
        </div>
      </header>

      {/* 01 — the starter */}
      <section className="rule-t" style={{ margin: '0 20px', padding: '12px 0 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="label">01 — Start with</span>
          <span className="label muted">A nudge, not a rule</span>
        </div>
        {starter ? (
          <>
            <p className="grot" style={{ fontSize: 34, margin: '14px 0 0', lineHeight: 0.95 }}>
              {starter.line}
            </p>
            <p className="label muted" style={{ margin: '10px 0 0' }}>
              {starter.why}
              {starter.shades ? ' · bring shades' : ''}
            </p>
          </>
        ) : (
          <p className="grot muted" style={{ fontSize: 26, margin: '14px 0 0' }}>
            Waiting on the forecast…
          </p>
        )}
      </section>

      {/* 02 — combos, only on request */}
      <section className="rule-t" style={{ margin: '0 20px', padding: '12px 0 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span className="label">02 — From your closet</span>
          <span className="label muted">{hasKey ? 'Claude' : 'Rules'}</span>
        </div>
        <button type="button" className="primary-btn" disabled={busy} onClick={build}>
          <span>{busy ? (hasKey ? 'Asking Claude…' : 'Building…') : saved ? 'Try three more' : 'Show me combos'}</span>
          <span style={{ color: 'var(--accent)' }}>{busy ? '' : saved ? '↻' : '→'}</span>
        </button>
        {!hasKey && (
          <p className="muted" style={{ fontSize: 12, fontWeight: 600, margin: '8px 0 0', lineHeight: 1.4 }}>
            Picks come from simple rules.{' '}
            <button type="button" onClick={openSettings} style={{ textDecoration: 'underline', textUnderlineOffset: 3, color: 'var(--ink)' }}>
              Add a Claude API key
            </button>{' '}
            for smarter ones.
          </p>
        )}
        {saved?.note && <p style={{ fontSize: 12, fontWeight: 600, margin: '8px 0 0', color: 'var(--muted)' }}>{saved.note}</p>}
        {missing && (
          <p style={{ fontSize: 14, fontWeight: 600, margin: '12px 0 0' }}>
            Add {missing.join(' and ')} to your{' '}
            <button type="button" onClick={() => (location.hash = 'closet')} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>
              closet
            </button>{' '}
            first — combos only use your own clothes.
          </p>
        )}
      </section>

      {saved?.combos.map((c, n) => (
        <OutfitCard
          key={c.key + n}
          index={n}
          combo={c}
          itemsById={itemsById}
          busy={busy}
          worn={!!todaysLog && todaysLog.itemIds.length === c.itemIds.length && c.itemIds.every((id) => todaysLog.itemIds.includes(id))}
          onSwap={(id) => swap(n, id)}
          onWear={async () => {
            if (todaysLog?.itemIds.length && !confirm('Replace what you already logged today with this outfit?')) return;
            await logOutfit(todayKey(), c.itemIds);
          }}
        />
      ))}
      <div style={{ height: 28 }} />
    </>
  );
}

function OutfitCard({
  index,
  combo,
  itemsById,
  busy,
  worn,
  onSwap,
  onWear,
}: {
  index: number;
  combo: Combo;
  itemsById: Map<string, ClothingItem>;
  busy: boolean;
  worn: boolean;
  onSwap: (itemId: string) => void;
  onWear: () => void;
}) {
  const pieces = useMemo(
    () =>
      combo.itemIds
        .map((id) => itemsById.get(id))
        .filter((i): i is ClothingItem => !!i)
        .sort((a, b) => SLOT_ORDER.indexOf(a.category) - SLOT_ORDER.indexOf(b.category)),
    [combo.itemIds, itemsById],
  );
  // Flat-lay: top + bottom large, everything else in a row beneath.
  const main = pieces.filter((i) => i.category === 'Top' || i.category === 'Bottom');
  const rest = pieces.filter((i) => i.category !== 'Top' && i.category !== 'Bottom');

  return (
    <article style={{ marginTop: 28, opacity: busy ? 0.4 : 1, transition: 'opacity 150ms' }}>
      <div className="rule-b" style={{ margin: '0 20px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span className="index">No. {idx(index)}</span>
          <span className="display-italic" style={{ fontSize: 26, lineHeight: 1, textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {combo.title}
          </span>
        </span>
        <span className="label muted">Tap a piece to swap</span>
      </div>

      <div className="hairgrid" style={{ gridTemplateColumns: `repeat(${Math.max(main.length, 1)}, 1fr)`, borderTop: 'none' }}>
        {main.map((i) => (
          <PieceTile key={i.id} item={i} big onSwap={() => onSwap(i.id)} />
        ))}
      </div>
      {rest.length > 0 && (
        <div className="hairgrid" style={{ gridTemplateColumns: `repeat(${rest.length}, 1fr)`, gridAutoRows: 112, borderTop: 'none' }}>
          {rest.map((i) => (
            <PieceTile key={i.id} item={i} onSwap={() => onSwap(i.id)} />
          ))}
        </div>
      )}

      <div style={{ margin: '10px 20px 0', display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center' }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, lineHeight: 1.3, letterSpacing: '-0.02em' }}>{combo.why}</p>
        <button
          type="button"
          className={worn ? 'primary-btn outline center' : 'primary-btn center'}
          style={{ width: 'auto', minHeight: 40, padding: '0 14px', fontSize: 11 }}
          disabled={worn}
          onClick={onWear}
        >
          {worn ? 'Logged ✓' : 'Wear this'}
        </button>
      </div>
    </article>
  );
}

function PieceTile({ item, big, onSwap }: { item: ClothingItem; big?: boolean; onSwap: () => void }) {
  const url = usePhotoUrl(item.photoId);
  const fg = url ? '#FFFFFF' : textOn(item.color.hex);
  return (
    <button type="button" onClick={onSwap} aria-label={`${item.name} — tap to swap`} style={{ position: 'relative', aspectRatio: big ? '1' : undefined, height: big ? undefined : '100%', overflow: 'hidden', background: url ? '#111' : item.color.hex, color: fg, display: 'block', minWidth: 0 }}>
      {url && (
        <>
          <img src={url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55))' }} />
        </>
      )}
      <span className="tag" style={{ position: 'absolute', top: 7, left: 8, opacity: 0.8 }}>
        {item.category === 'Sunglasses' ? 'Shades' : item.category}
      </span>
      <span style={{ position: 'absolute', top: 5, right: 8, fontSize: 13, opacity: 0.7 }} aria-hidden>
        ↻
      </span>
      <span className="grot" style={{ position: 'absolute', left: 8, right: 8, bottom: 8, textAlign: 'left', fontSize: big ? 17 : 12, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.name}
      </span>
    </button>
  );
}
