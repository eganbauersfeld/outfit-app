import { useMemo } from 'react';
import { ThemeToggle } from '../components/Common';
import { shortLabel, todayKey } from '../dates';
import { galleryWeeks, wornByDate } from '../stats';
import { useStore } from '../store';

// Placeholder tiles until daily fit photos land (a later phase). Each tile shows the day's colors.
export function Gallery() {
  const { logs, itemsById } = useStore();
  const worn = useMemo(() => wornByDate(logs, itemsById), [logs, itemsById]);
  const { thisWeek, lastWeek } = galleryWeeks(todayKey());

  return (
    <>
      <header className="screen-header groove">
        <div>
          <h1 className="serif screen-title emboss" style={{ margin: 0 }}>
            Gallery
          </h1>
          <div className="screen-sub">Scroll back through your fits</div>
        </div>
        <ThemeToggle />
      </header>
      <Week title="This week" days={thisWeek} worn={worn} />
      <Week title="Last week" days={lastWeek} worn={worn} />
      <div style={{ height: 22 }} />
    </>
  );
}

function Week({ title, days, worn }: { title: string; days: string[]; worn: ReturnType<typeof wornByDate> }) {
  return (
    <section>
      <div className="sublabel" style={{ padding: '20px 24px 8px', letterSpacing: '0.08em' }}>
        {title}
      </div>
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {days.map((d) => {
          const items = worn.get(d) ?? [];
          return (
            <div key={d} className="photo-well" style={{ boxShadow: '0 2px 6px var(--card-shadow), inset 0 1px 2px var(--card-hi)' }} aria-label={`${shortLabel(d)}: ${items.length ? items.map((i) => i.name).join(', ') : 'nothing logged'}`}>
              {items.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', maxWidth: '70%' }}>
                  {items.map((i) => (
                    <span key={i.id} className="swatch" style={{ background: i.color.hex, width: 10, height: 10 }} />
                  ))}
                </div>
              )}
              <span className="tag dark" style={{ position: 'absolute', left: 6, bottom: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                {shortLabel(d)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
