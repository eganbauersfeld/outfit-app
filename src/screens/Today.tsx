import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { textOn } from '../color';
import { idx, openLocation, Sheet, SettingsButton, STUDIO, usePhotoUrl } from '../components/Common';
import { WeatherGlyph } from '../components/Icons';
import { ItemForm } from '../components/ItemForm';
import { LogPicker } from '../components/LogPicker';
import { todayKey } from '../dates';
import { starter as makeStarter } from '../engine/stylist';
import { useQuote } from '../quotes';
import { dayStreak, uniquenessScore } from '../stats';
import { newFitId, useStore, type FitRef } from '../store';
import { CATEGORIES, fitName, fitsOn, type Category, type ClothingItem } from '../types';
import { useWeather } from '../weather';

const TILE_LABEL: Record<Category, string> = { Top: 'Top', Bottom: 'Bottom', Outerwear: 'Outerwear', Shoes: 'Shoes', Sunglasses: 'Shades', Misc: 'Misc.' };

export function Today() {
  const { items, logs, feedback, itemsById } = useStore();
  const { status, weather, error, needsLocation, denied, refresh } = useWeather();
  const [picker, setPicker] = useState<Category | null>(null);
  // Several fits a day: fits made here but not logged into yet live only in this screen's state.
  const [drafts, setDrafts] = useState<FitRef[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fitSheet, setFitSheet] = useState<'new' | string | null>(null);
  const [newIn, setNewIn] = useState<Category | null>(null);
  const quoteBox = useRef<HTMLDivElement>(null);
  const quoteCard = useRef<HTMLElement>(null);
  const [quoteFits, setQuoteFits] = useState(true);

  // The screen never scrolls; the quote only shows when the space left over can hold it.
  const checkQuote = useCallback(() => {
    const box = quoteBox.current;
    const card = quoteCard.current;
    if (box && card) setQuoteFits(box.clientHeight >= card.offsetHeight + 16);
  }, []);
  useLayoutEffect(checkQuote);
  useEffect(() => {
    addEventListener('resize', checkQuote);
    return () => removeEventListener('resize', checkQuote);
  }, [checkQuote]);

  const today = todayKey();
  const saved = fitsOn(logs, today);
  const fits: FitRef[] = [...saved, ...drafts.filter((d) => d.date === today && !saved.some((s) => s.id === d.id))];
  if (!fits.length) fits.push({ id: `log-${today}`, date: today });
  // The newest fit is the one he's most likely logging right now.
  const active = fits.find((f) => f.id === activeId) ?? fits[fits.length - 1];
  const activeIndex = fits.indexOf(active);
  const todays = (saved.find((s) => s.id === active.id)?.itemIds ?? []).map((id) => itemsById.get(id)).filter((i) => !!i);
  const streak = useMemo(() => dayStreak(logs, today), [logs, today]);
  const unique = useMemo(() => uniquenessScore(logs, itemsById, today), [logs, itemsById, today]);
  const quote = useQuote();
  const starter = useMemo(() => makeStarter(weather, items, logs, feedback), [weather, items, logs, feedback]);
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="today">
      {/* Masthead: date line, then the temperature set huge */}
      <header style={{ padding: 'calc(10px + env(safe-area-inset-top)) 20px 0' }}>
        <div className="rule-b" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6 }}>
          <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, background: 'var(--accent)' }} aria-hidden />
            {weekday} <span className="muted">/ {monthDay}</span>
          </span>
          <div style={{ display: 'flex', marginRight: -10 }}>
            <SettingsButton />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, padding: '10px 0 12px' }}>
          <div className={weather ? 'display' : 'display muted'} style={{ fontSize: 'clamp(96px, 30vw, 128px)', marginLeft: -4 }}>
            {weather ? `${weather.temp}°` : status === 'loading' ? '—' : '?'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, paddingBottom: 4, textAlign: 'right', minWidth: 0 }}>
            {weather ? (
              <>
                <WeatherGlyph icon={weather.icon} size={26} />
                <span className="grot" style={{ fontSize: 22 }}>
                  {weather.condition}
                </span>
                <span className="label muted">
                  Feels {weather.feelsLike}° · H {weather.high}° · L {weather.low}°
                </span>
                {weather.place && (
                  <button type="button" className="label" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }} onClick={openLocation}>
                    {weather.place}
                  </button>
                )}
              </>
            ) : (
              <span className="grot" style={{ fontSize: 22 }}>
                {status === 'loading' ? 'Forecast…' : 'No forecast'}
              </span>
            )}
          </div>
        </div>

        {!weather && status === 'error' && (
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', lineHeight: 1.45, paddingBottom: 10 }}>
            {error ?? 'Weather unavailable.'}
            {denied && ' On iPhone: Settings → Privacy & Security → Location Services → Safari Websites → While Using.'}
            <div style={{ display: 'flex', gap: 18 }}>
              <button type="button" className="text-btn" style={{ color: 'var(--ink)' }} onClick={() => refresh(true)}>
                Try again
              </button>
              {needsLocation && (
                <button type="button" className="text-btn" style={{ color: 'var(--ink)', textDecoration: 'underline', textUnderlineOffset: 3 }} onClick={openLocation}>
                  Pick a city
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {weather && weather.hours.length > 0 && (
        <div className="hscroll rule-t rule-b" style={{ margin: '0 20px' }}>
          {weather.hours.map((h, i) => (
            <div key={h.time} style={{ flex: '1 0 46px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0', borderLeft: i ? '1px solid var(--rule-soft)' : 'none' }}>
              <span className="index">{h.time}</span>
              <WeatherGlyph icon={h.icon} size={15} />
              <span style={{ fontWeight: 700, fontSize: 13 }}>{h.temp}°</span>
            </div>
          ))}
        </div>
      )}

      {/* The starter: a nudge in plain garment terms. Real combos live on the Ideas tab. */}
      <section style={{ padding: '12px 20px 0' }}>
        <button type="button" className="primary-btn" style={{ minHeight: 58, alignItems: 'center' }} onClick={() => (location.hash = 'ideas')}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5, textTransform: 'none', letterSpacing: 0, minWidth: 0 }}>
            <span className="label" style={{ opacity: 0.55 }}>
              Start with
            </span>
            <span className="grot" style={{ fontSize: 17, lineHeight: 1.05, letterSpacing: '-0.03em' }}>
              {starter ? starter.line : 'Outfit ideas'}
            </span>
          </span>
          <span style={{ flexShrink: 0, color: 'var(--accent)' }}>Ideas →</span>
        </button>
      </section>

      <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 38 }}>
        {fits.length <= 1 ? (
          <span className="label">Today’s fit</span>
        ) : (
          <div className="hscroll" role="tablist" style={{ gap: 16, minWidth: 0 }}>
            {fits.map((f, i) => {
              const on = f.id === active.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className="label"
                  onClick={() => (on ? setFitSheet(f.id) : setActiveId(f.id))}
                  style={{ flexShrink: 0, padding: '8px 0 6px', color: on ? 'var(--ink)' : 'var(--muted)', boxShadow: on ? 'inset 0 -2px 0 var(--accent)' : 'none' }}
                >
                  {fitName(f, i)}
                </button>
              );
            })}
          </div>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span className="label muted">
            {String(todays.length).padStart(2, '0')} {todays.length === 1 ? 'piece' : 'pieces'}
          </span>
          <button type="button" className="label" onClick={() => setFitSheet('new')} style={{ padding: '8px 0 6px' }} aria-label="Add another fit today">
            + Fit
          </button>
        </span>
      </div>

      <div className="hairgrid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', margin: '0 20px', borderLeft: '1px solid var(--rule)', borderRight: '1px solid var(--rule)' }}>
        {CATEGORIES.map((c, i) => (
          <LogTile key={c} index={i} label={TILE_LABEL[c]} worn={todays.filter((it) => it.category === c)} onClick={() => setPicker(c)} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', margin: '10px 20px 0' }} className="rule-b">
        <Stat value={String(streak)} label="Day streak" />
        <Stat value={unique === null ? '—' : String(unique.value)} label={unique?.scope === 'week' ? 'Unique · 7 days' : 'Unique today'} divider />
      </div>

      {/* Lowest priority: takes whatever height is left and hides itself when it doesn't fit. */}
      <div ref={quoteBox} style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden', flexShrink: 1 }}>
        <figure ref={quoteCard} style={{ margin: '12px 20px 10px', visibility: quoteFits ? 'visible' : 'hidden' }}>
          <blockquote className="display-italic" style={{ margin: 0, fontSize: 19, lineHeight: 1.2 }}>
            “{quote.text}”
          </blockquote>
          <figcaption className="label muted" style={{ marginTop: 6 }}>
            {quote.author}
          </figcaption>
        </figure>
      </div>

      {picker && (
        <LogPicker
          category={picker}
          label={fits.length > 1 ? `${TILE_LABEL[picker]} · ${fitName(active, activeIndex)}` : TILE_LABEL[picker]}
          fit={active}
          onClose={() => setPicker(null)}
          onAddNew={() => {
            setNewIn(picker);
            setPicker(null);
          }}
        />
      )}
      {newIn && (
        <ItemForm
          defaultCategory={newIn}
          onClose={() => {
            setPicker(newIn);
            setNewIn(null);
          }}
        />
      )}
      {fitSheet && (
        <FitSheet
          fit={fitSheet === 'new' ? null : (fits.find((f) => f.id === fitSheet) ?? null)}
          index={fitSheet === 'new' ? fits.length : fits.findIndex((f) => f.id === fitSheet)}
          saved={fitSheet !== 'new' && saved.some((s) => s.id === fitSheet)}
          onCreate={(label) => {
            const f: FitRef = { id: newFitId(today), date: today, label, createdAt: Date.now() };
            // The first fit of the day may exist only implicitly; give it a real place first.
            setDrafts((d) => [...d, ...(saved.length || fits.length > 1 ? [] : [{ ...fits[0], createdAt: 0 }]), f]);
            setActiveId(f.id);
          }}
          onRename={(id, label) => setDrafts((d) => d.map((x) => (x.id === id ? { ...x, label } : x)))}
          onDelete={(id) => {
            setDrafts((d) => d.filter((x) => x.id !== id));
            setActiveId(null);
          }}
          onClose={() => setFitSheet(null)}
        />
      )}
    </div>
  );
}

const FIT_NAMES = ['Night out', 'Work', 'Gym', 'Dinner', 'Date', 'Errands'];

/** Name a new fit, or rename / delete one. */
function FitSheet({
  fit,
  index,
  saved,
  onCreate,
  onRename,
  onDelete,
  onClose,
}: {
  fit: FitRef | null;
  index: number;
  saved: boolean;
  onCreate: (label: string) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { renameFit, deleteFit } = useStore();
  const [custom, setCustom] = useState('');
  const current = fit ? fitName(fit, index) : '';
  const choose = async (label: string) => {
    if (!fit) onCreate(label);
    else if (saved) await renameFit(fit.id, label);
    else onRename(fit.id, label);
    onClose();
  };
  return (
    <Sheet title={fit ? current : 'Another fit'} onClose={onClose}>
      <p className="muted" style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px', lineHeight: 1.4 }}>
        {fit ? 'Rename this fit, or remove it.' : 'Going out, changing for work or the gym? Log it as its own fit.'}
      </p>
      <div className="seg" style={{ marginBottom: 16 }}>
        {(index === 0 ? ['Day', ...FIT_NAMES] : FIT_NAMES).map((n) => (
          <button key={n} type="button" className="chip" aria-pressed={n === current} onClick={() => choose(n)}>
            {n}
          </button>
        ))}
      </div>
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) choose(custom.trim());
        }}
      >
        <span className="sublabel">Or name it</span>
        <input className="input" value={custom} placeholder="e.g. Wedding" onChange={(e) => setCustom(e.target.value)} enterKeyHint="done" />
      </form>
      {fit && index > 0 && (
        <button
          type="button"
          className="text-btn danger"
          onClick={async () => {
            if (saved && !confirm(`Remove “${current}” from today? The pieces stay in your closet.`)) return;
            if (saved) await deleteFit(fit.id);
            onDelete(fit.id);
            onClose();
          }}
        >
          Remove this fit
        </button>
      )}
    </Sheet>
  );
}

/** A log cell: empty = index + name + ADD; logged = the piece's photo or its color, like a record sleeve. */
function LogTile({ index, label, worn, onClick }: { index: number; label: string; worn: ClothingItem[]; onClick: () => void }) {
  const first = worn[0];
  const photo = usePhotoUrl(first?.photoId);
  const studio = !!photo && !!first?.photoCutout;
  const fill = first && !photo ? first.color.hex : studio ? STUDIO : undefined;
  const fg = studio ? '#111111' : photo ? '#FFFFFF' : fill ? textOn(fill) : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'relative',
        height: 58,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        minWidth: 0,
        background: fill ?? 'var(--paper)',
        color: fg,
      }}
    >
      {photo && studio && (
        <img src={photo} alt="" style={{ position: 'absolute', right: 4, top: 3, bottom: 3, width: '42%', height: 'calc(100% - 6px)', objectFit: 'contain', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.2))' }} />
      )}
      {photo && !studio && (
        <>
          <img src={photo} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0) 70%)' }} />
        </>
      )}
      <span style={{ position: 'relative', display: 'flex', justifyContent: 'space-between' }}>
        <span className="index" style={{ color: fg ? 'inherit' : undefined, opacity: fg ? 0.75 : 1 }}>
          {idx(index)}
        </span>
        {worn.length === 0 ? (
          <span className="label" style={{ color: 'var(--ink)' }}>
            + Add
          </span>
        ) : (
          worn.length > 1 && <span className="label">+{worn.length - 1}</span>
        )}
      </span>
      <span style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span className="grot" style={{ fontSize: 20, flexShrink: 0 }}>
          {label}
        </span>
        {first && (
          <span style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>{first.name}</span>
        )}
      </span>
    </button>
  );
}

function Stat({ value, label, divider }: { value: string; label: string; divider?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, padding: '10px 0 10px', paddingLeft: divider ? 14 : 0, borderLeft: divider ? '1px solid var(--rule-soft)' : 'none' }}>
      <span className="display" style={{ fontSize: 52 }}>
        {value}
      </span>
      <span className="label muted" style={{ paddingRight: divider ? 0 : 14, textAlign: 'right' }}>
        {label}
      </span>
    </div>
  );
}
