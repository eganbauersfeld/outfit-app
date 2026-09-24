import { useEffect, useMemo, useState } from 'react';
import { textOn } from '../color';
import { SettingsButton, usePhotoUrl } from '../components/Common';
import { WeatherGlyph } from '../components/Icons';
import { todayKey } from '../dates';
import { rankSwaps, starter as makeStarter, suggest, type Suggestion } from '../engine/stylist';
import { useStore } from '../store';
import type { Category, ClothingItem } from '../types';
import { useWeather } from '../weather';

// The key feature: start him off with a weather-shaped nudge, then — only if he wants —
// build real outfits from his closet, shown as pictures he can tweak piece by piece.

const SAVED = 'outfit.ideas.v2';
export const ANCHOR = 'outfit.anchor';
type Saved = { date: string; combos: Suggestion[]; shown: string[]; notes: string[]; anchorId?: string };

function load(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(SAVED) ?? 'null') as Saved | null;
    return s && s.date === todayKey() ? s : null;
  } catch {
    return null;
  }
}
function persist(s: Saved | null) {
  try {
    if (s) localStorage.setItem(SAVED, JSON.stringify(s));
    else localStorage.removeItem(SAVED);
  } catch {
    /* ignore */
  }
}
function takeAnchor(): string | undefined {
  try {
    const a = sessionStorage.getItem(ANCHOR) ?? undefined;
    sessionStorage.removeItem(ANCHOR);
    return a;
  } catch {
    return undefined;
  }
}

const SLOT_ORDER: Category[] = ['Top', 'Bottom', 'Outerwear', 'Shoes', 'Sunglasses', 'Misc'];

export function Ideas() {
  const { items, logs, feedback, itemsById, logOutfit, react } = useStore();
  const { weather } = useWeather();
  const [saved, setSaved] = useState<Saved | null>(load);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [anchorId, setAnchorId] = useState<string | undefined>(() => takeAnchor() ?? load()?.anchorId);
  const starter = useMemo(() => makeStarter(weather, items, logs, feedback), [weather, items, logs, feedback]);
  const anchor = anchorId ? itemsById.get(anchorId) : undefined;

  useEffect(() => persist(saved), [saved]);

  const build = (fresh: boolean, anchorOverride?: string | null) => {
    const a = anchorOverride === null ? undefined : (anchorOverride ?? anchorId);
    const shown = fresh || !saved ? [] : saved.shown;
    const r = suggest({ items, logs, feedback, weather, anchorId: a, exclude: new Set(shown), jitter: shown.length ? 0.15 : 0 });
    if (r.missing) {
      setMissing(r.missing);
      return;
    }
    setMissing(null);
    setSaved({ date: todayKey(), combos: r.combos, shown: [...shown, ...r.combos.map((c) => c.key)], notes: r.notes, anchorId: a });
  };

  // Arriving from "Style this piece" builds right away.
  useEffect(() => {
    if (anchorId && (!saved || saved.anchorId !== anchorId) && items.length) build(true);
  }, [anchorId, items.length]);

  const input = { items, logs, feedback, weather };
  const tried = useMemo(() => new Map<string, Set<string>>(), [saved?.shown.length]); // per card: pieces already cycled through

  const swap = (n: number, itemId: string) => {
    if (!saved) return;
    const c = saved.combos[n];
    const seen = tried.get(c.key + n) ?? new Set<string>([itemId]);
    const next = rankSwaps(input, c.itemIds, itemId).find((id) => !seen.has(id)) ?? rankSwaps(input, c.itemIds, itemId)[0];
    if (!next) return;
    seen.add(next);
    tried.set(c.key + n, seen);
    const from = itemsById.get(itemId)?.name ?? 'piece';
    const to = itemsById.get(next)?.name ?? 'another';
    const combos = saved.combos.map((x, i) => (i === n ? { ...x, itemIds: x.itemIds.map((id) => (id === itemId ? next : id)), why: `Your edit: ${to} in place of the ${from.toLowerCase()}.` } : x));
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
            <p className="label muted" style={{ margin: '10px 0 0', lineHeight: 1.5 }}>
              {starter.why}
              {starter.extras.length ? ` · bring ${starter.extras.join(', ')}` : ''}
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
          <span className="label muted">{items.length} pieces</span>
        </div>
        {anchor && (
          <div className="chip" aria-pressed="true" style={{ marginBottom: 10, gap: 8 }}>
            Built around: {anchor.name}
            <button
              type="button"
              aria-label="Stop building around this piece"
              onClick={() => {
                setAnchorId(undefined);
                build(true, null);
              }}
              style={{ fontSize: 15, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        )}
        <button type="button" className="primary-btn" onClick={() => build(!saved)}>
          <span>{saved ? 'Show me three more' : 'Show me combos'}</span>
          <span style={{ color: 'var(--accent)' }}>{saved ? '↻' : '→'}</span>
        </button>
        {saved?.notes.map((n) => (
          <p key={n} style={{ fontSize: 12, fontWeight: 600, margin: '10px 0 0', lineHeight: 1.4, display: 'flex', gap: 8 }}>
            <span style={{ width: 8, height: 8, background: 'var(--accent)', flexShrink: 0, marginTop: 4 }} aria-hidden />
            {n}
          </p>
        ))}
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
          worn={!!todaysLog && todaysLog.itemIds.length === c.itemIds.length && c.itemIds.every((id) => todaysLog.itemIds.includes(id))}
          liked={feedback.some((f) => f.verdict === 'like' && f.itemIds.length === c.itemIds.length && c.itemIds.every((id) => f.itemIds.includes(id)))}
          onSwap={(id) => swap(n, id)}
          onWear={async () => {
            if (todaysLog?.itemIds.length && !confirm('Replace what you already logged today with this outfit?')) return;
            await logOutfit(todayKey(), c.itemIds);
          }}
          onLike={() => react(c.itemIds, 'like')}
          onDislike={async () => {
            await react(c.itemIds, 'dislike');
            setSaved({ ...saved, combos: saved.combos.filter((_, i) => i !== n) });
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
  worn,
  liked,
  onSwap,
  onWear,
  onLike,
  onDislike,
}: {
  index: number;
  combo: Suggestion;
  itemsById: Map<string, ClothingItem>;
  worn: boolean;
  liked: boolean;
  onSwap: (itemId: string) => void;
  onWear: () => void;
  onLike: () => void;
  onDislike: () => void;
}) {
  const pieces = combo.itemIds
    .map((id) => itemsById.get(id))
    .filter((i): i is ClothingItem => !!i)
    .sort((a, b) => SLOT_ORDER.indexOf(a.category) - SLOT_ORDER.indexOf(b.category));
  // Flat-lay: top + bottom large, everything else in a row beneath.
  const main = pieces.filter((i) => i.category === 'Top' || i.category === 'Bottom');
  const rest = pieces.filter((i) => i.category !== 'Top' && i.category !== 'Bottom');
  const meters: [string, number | null][] = [
    ['Weather', combo.meters.weather],
    ['Color', combo.meters.color],
    ['Fresh', combo.meters.fresh],
    ['You', combo.meters.you],
  ];

  return (
    <article style={{ marginTop: 28 }}>
      <div className="rule-b" style={{ margin: '0 20px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span className="index">No. {String(index + 1).padStart(2, '0')}</span>
          <span className="display-italic" style={{ fontSize: 24, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {combo.title}
          </span>
        </span>
        <span className="label muted" style={{ flexShrink: 0 }}>
          Tap to swap
        </span>
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

      <div style={{ margin: '12px 20px 0' }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, lineHeight: 1.35, letterSpacing: '-0.02em' }}>{combo.why}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, margin: '12px 0 0' }}>
          {meters.map(([label, v]) => (
            <div key={label} title={v === null ? 'Log a few more days to unlock' : undefined}>
              <div style={{ height: 3, background: 'var(--rule-soft)', position: 'relative' }}>
                {v !== null && <div style={{ position: 'absolute', inset: 0, width: `${Math.round(v * 100)}%`, background: 'var(--ink)' }} />}
              </div>
              <span className="label muted" style={{ display: 'block', marginTop: 5, fontSize: 9 }}>
                {label}
                {v === null ? ' —' : ''}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 6, marginTop: 12 }}>
          <button type="button" className={worn ? 'primary-btn outline center' : 'primary-btn center'} style={{ minHeight: 42, fontSize: 11 }} disabled={worn} onClick={onWear}>
            {worn ? 'Logged ✓' : 'Wear this'}
          </button>
          <button type="button" className="primary-btn outline center" aria-pressed={liked} aria-label="Love this combo" disabled={liked} style={{ minHeight: 42, width: 48, padding: 0, fontSize: 16 }} onClick={onLike}>
            {liked ? '♥' : '♡'}
          </button>
          <button type="button" className="primary-btn outline center" style={{ minHeight: 42, padding: '0 12px', fontSize: 11 }} onClick={onDislike}>
            Not for me
          </button>
        </div>
      </div>
    </article>
  );
}

function PieceTile({ item, big, onSwap }: { item: ClothingItem; big?: boolean; onSwap: () => void }) {
  const url = usePhotoUrl(item.photoId);
  const fg = url ? '#FFFFFF' : textOn(item.color.hex);
  return (
    <button
      type="button"
      onClick={onSwap}
      aria-label={`${item.name} — tap to swap`}
      style={{ position: 'relative', aspectRatio: big ? '1' : undefined, height: big ? undefined : '100%', overflow: 'hidden', background: url ? '#111' : item.color.hex, color: fg, display: 'block', minWidth: 0 }}
    >
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
