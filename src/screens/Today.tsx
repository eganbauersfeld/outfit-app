import { useMemo, useState } from 'react';
import { ThemeToggle } from '../components/Common';
import { GearIcon, SparkleIcon, WeatherGlyph } from '../components/Icons';
import { ItemForm } from '../components/ItemForm';
import { LogPicker } from '../components/LogPicker';
import { SettingsSheet } from '../components/SettingsSheet';
import { todayKey } from '../dates';
import { generateIdeas } from '../ideas';
import { quoteOfTheDay } from '../quotes';
import { dayStreak, thriftedPct } from '../stats';
import { useStore } from '../store';
import { CATEGORIES, type Category } from '../types';
import { useWeather } from '../weather';

const TILE_LABEL: Record<Category, string> = { Top: 'Top', Bottom: 'Bottom', Outerwear: 'Outerwear', Shoes: 'Shoes', Sunglasses: 'Sunglasses', Misc: 'Misc.' };

export function Today() {
  const { items, logs, itemsById } = useStore();
  const { status, weather, error, refresh } = useWeather();
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const [picker, setPicker] = useState<Category | null>(null);
  const [newIn, setNewIn] = useState<Category | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const today = todayKey();
  const todays = logs.filter((l) => l.date === today).flatMap((l) => l.itemIds.map((id) => itemsById.get(id)).filter((i) => !!i));
  const streak = useMemo(() => dayStreak(logs, today), [logs, today]);
  const thrifted = useMemo(() => thriftedPct(logs, itemsById), [logs, itemsById]);
  const quote = quoteOfTheDay();
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <>
      <header className="groove" style={{ padding: 'calc(26px + env(safe-area-inset-top)) 24px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="label">{dateLabel}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="round-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
              <GearIcon />
            </button>
            <ThemeToggle />
          </div>
        </div>
        {weather ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ filter: 'drop-shadow(0 1px 1px var(--card-shadow))', display: 'flex' }}>
                <WeatherGlyph icon={weather.icon} size={38} />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="serif emboss" style={{ fontSize: 46, lineHeight: 0.9 }}>
                  {weather.temp}°
                </div>
                <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', color: 'var(--muted)', marginTop: 5 }}>{weather.condition}</div>
              </div>
            </div>
            <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', color: 'var(--muted)' }}>
              Feels like {weather.feelsLike}° · H:{weather.high}° L:{weather.low}°
            </div>
          </>
        ) : (
          <button type="button" style={{ textAlign: 'left', padding: '6px 0' }} onClick={() => refresh(true)}>
            <div className="serif emboss muted" style={{ fontSize: 46, lineHeight: 0.9 }}>
              {status === 'loading' ? '—°' : '?°'}
            </div>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              {status === 'loading' ? 'Getting the forecast…' : `${error ?? 'Weather unavailable'} Tap to retry.`}
            </div>
          </button>
        )}
      </header>

      {weather && weather.hours.length > 0 && (
        <div
          className="hscroll"
          style={{ padding: '14px 16px', gap: 16, background: 'var(--track-bg)', boxShadow: 'inset 0 2px 4px var(--track-shadow), 0 1px 0 var(--hair-hi), 0 2px 0 var(--hair-sh)' }}
        >
          {weather.hours.map((h) => (
            <div key={h.time} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 32, flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 10, letterSpacing: '0.04em', color: 'var(--muted)' }}>{h.time}</span>
              <WeatherGlyph icon={h.icon} />
              <span style={{ fontWeight: 700, fontSize: 12 }}>{h.temp}°</span>
            </div>
          ))}
        </div>
      )}

      <section style={{ padding: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" className="primary-btn" onClick={() => setIdeas(generateIdeas(items, logs, weather))}>
          <SparkleIcon />
          {ideas ? 'Show new ideas' : 'Get outfit ideas'}
        </button>
        {ideas ? (
          <button type="button" className="muted" style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', padding: 4 }} onClick={() => setIdeas(null)}>
            Hide ideas
          </button>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textAlign: 'center' }}>Optional — just a nudge if you want one.</span>
        )}
      </section>

      {ideas && (
        <div style={{ margin: '4px 24px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ideas.map((text) => (
            <div key={text} className="card" style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>
              {text}
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '22px 24px 0', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span className="label">Log today’s fit</span>
        <span style={{ fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', color: 'var(--muted)' }}>
          {todays.length} {todays.length === 1 ? 'piece' : 'pieces'}
        </span>
      </div>

      <div style={{ padding: '10px 24px 0', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {CATEGORIES.map((c) => {
          const worn = todays.filter((i) => i.category === c);
          return (
            <button
              key={c}
              type="button"
              className="card"
              onClick={() => setPicker(c)}
              style={{ minHeight: 52, padding: '11px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, minWidth: 0 }}
            >
              <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: '0.02em' }}>{TILE_LABEL[c]}</span>
              {worn.length ? (
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <span className="swatch" style={{ background: worn[0].color.hex }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {worn[0].name}
                    {worn.length > 1 ? ` +${worn.length - 1}` : ''}
                  </span>
                </span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--accent)' }}>ADD</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, padding: '16px 24px 0' }}>
        <Stat value={String(streak)} label="day streak" />
        <Stat value={thrifted === null ? '—' : `${thrifted}%`} label="thrifted" />
      </div>

      <figure className="card" style={{ margin: '12px 24px 24px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <blockquote className="serif" style={{ margin: 0, fontSize: 15, lineHeight: 1.4 }}>
          “{quote.text}”
        </blockquote>
        <figcaption className="sublabel">— {quote.author}</figcaption>
      </figure>

      {picker && (
        <LogPicker
          category={picker}
          label={TILE_LABEL[picker]}
          date={today}
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
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="card" style={{ flex: 1, padding: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span className="serif emboss" style={{ fontSize: 22 }}>
        {value}
      </span>
      <span className="sublabel">{label}</span>
    </div>
  );
}
