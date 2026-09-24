import { useMemo, useRef, useState } from 'react';
import { ThemeToggle } from '../components/Common';
import { trends, type Period } from '../stats';
import { useStore } from '../store';
import type { Category } from '../types';

const W = 342;
const TOP = 8;
const BOTTOM = 100;
const UP = '#3FAE58';
const DOWN = '#E4572E';
const COLORS_LINE = '#3A6EA5';
const THRIFT_LINE = '#D4AF37';
const CATEGORY_DOT: Record<Category, string> = {
  Top: '#3A6EA5',
  Bottom: '#4C8C5C',
  Shoes: '#C0392B',
  Sunglasses: '#D4AF37',
  Outerwear: '#8E7CC3',
  Misc: '#6B6B7A',
};

/** Each series gets its own min–max scale so differently-sized metrics share one chart. */
function series(values: number[]) {
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => ({ x: (i / (values.length - 1)) * W, y: TOP + (1 - (v - min) / range) * (BOTTOM - TOP) }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return { line, area: `${line} L${W},${BOTTOM} L0,${BOTTOM} Z`, first: pts[0], last: pts[pts.length - 1] };
}

export function Trends() {
  const { logs, itemsById } = useStore();
  const [period, setPeriod] = useState<Period>('7d');
  const swipeX = useRef<number | null>(null);
  const t = useMemo(() => trends(period, logs, itemsById), [period, logs, itemsById]);
  const is7 = period === '7d';

  const primary = series(t.pieces);
  const colors = series(t.colors);
  const thrift = series(t.thrifted);
  const trendColor = t.up ? UP : DOWN;

  return (
    <>
      <header className="screen-header groove">
        <div>
          <h1 className="serif screen-title emboss" style={{ margin: 0 }}>
            Trends
          </h1>
          <div className="screen-sub">Your style over time</div>
        </div>
        <ThemeToggle />
      </header>

      <div role="tablist" style={{ padding: '14px 24px 0', display: 'flex', gap: 24 }}>
        {(['7d', '3mo'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            onClick={() => setPeriod(p)}
            style={{ padding: '6px 0 0', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: period === p ? 'var(--ink)' : 'var(--muted)' }}
          >
            <span style={{ display: 'block', paddingBottom: 6, borderBottom: `2px solid ${period === p ? 'var(--accent)' : 'transparent'}` }}>{p === '7d' ? '7 Days' : '3 Months'}</span>
          </button>
        ))}
      </div>

      <div
        className="card"
        onPointerDown={(e) => (swipeX.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipeX.current == null) return;
          const dx = swipeX.current - e.clientX;
          swipeX.current = null;
          if (Math.abs(dx) >= 30) setPeriod(dx > 0 ? '3mo' : '7d');
        }}
        onPointerCancel={() => (swipeX.current = null)}
        style={{ touchAction: 'pan-y', margin: '16px 24px 0', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: '0 1px 0 var(--card-hi) inset, 0 2px 6px var(--card-shadow)', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="serif emboss" style={{ fontSize: 32 }}>
            {t.headline}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{is7 ? 'pieces logged, today' : 'pieces logged/day, this week'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: trendColor }}>
            {t.up ? '▲' : '▼'} {t.deltaPct === null ? '—' : `${Math.abs(t.deltaPct)}%`}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{is7 ? 'past 7 days' : 'past 3 months'}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginTop: 2 }}>
          {t.colorCount} {t.colorCount === 1 ? 'color' : 'colors'} · {t.categoryCount} {t.categoryCount === 1 ? 'category' : 'categories'} in rotation {is7 ? 'this week' : 'this quarter'}
        </span>

        <svg viewBox={`0 0 ${W} 110`} width="100%" height="110" style={{ marginTop: 8, overflow: 'visible', filter: 'drop-shadow(0 2px 2px var(--card-shadow))' }} aria-label="Trend chart">
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={trendColor} stopOpacity="0.22" />
              <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1={primary.first.y} x2={W} y2={primary.first.y} stroke="var(--hair-sh)" strokeWidth="1" strokeDasharray="3 4" />
          <path d={primary.area} fill="url(#trendFill)" />
          <path d={colors.line} fill="none" stroke={COLORS_LINE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          <path d={thrift.line} fill="none" stroke={THRIFT_LINE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          <path d={primary.line} fill="none" stroke={trendColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={colors.last.x} cy={colors.last.y} r="3.5" fill={COLORS_LINE} stroke="var(--card-top)" strokeWidth="1.5" />
          <circle cx={thrift.last.x} cy={thrift.last.y} r="3.5" fill={THRIFT_LINE} stroke="var(--card-top)" strokeWidth="1.5" />
          <circle cx={primary.last.x} cy={primary.last.y} r="4.5" fill={trendColor} stroke="var(--card-top)" strokeWidth="1.5" />
        </svg>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 1px' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>{t.startLabel}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>{t.endLabel}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, paddingTop: 2 }} aria-hidden>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: is7 ? 'var(--accent)' : 'var(--card-border)' }} />
          <span style={{ width: 5, height: 5, borderRadius: 999, background: is7 ? 'var(--card-border)' : 'var(--accent)' }} />
        </div>
        <div style={{ display: 'flex', gap: 14, paddingTop: 4, flexWrap: 'wrap' }}>
          <Legend color={trendColor} label="Pieces logged" />
          <Legend color={COLORS_LINE} label="Colors worn" />
          <Legend color={THRIFT_LINE} label="Thrifted %" />
        </div>
      </div>

      <div className="label" style={{ padding: '26px 24px 0' }}>
        Breakdown
      </div>
      {!t.hasData && <div className="empty">Nothing logged {is7 ? 'this week' : 'in the last 3 months'} yet — log a fit on Today.</div>}
      {t.hasData && (
        <>
          <div className="sublabel" style={{ padding: '12px 24px 0' }}>
            By color
          </div>
          <Bars rows={t.byColor.map((r) => ({ name: r.name, dot: r.hex, value: r.value }))} />
          <div className="sublabel" style={{ padding: '20px 24px 0' }}>
            By category
          </div>
          <Bars rows={t.byCategory.map((r) => ({ name: r.name, dot: CATEGORY_DOT[r.category], value: r.value }))} />
        </>
      )}
      <div style={{ height: 24 }} />
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: '0.03em', color: 'var(--muted)', textTransform: 'uppercase' }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}

/** Each bar is sized against the top value in its own list. */
function Bars({ rows }: { rows: { name: string; dot: string; value: number }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ padding: '8px 24px 0', display: 'flex', flexDirection: 'column', gap: 7 }}>
      {rows.map((r) => (
        <div key={r.name} style={{ position: 'relative', borderRadius: 3, background: 'var(--bar-track)', border: '1px solid var(--card-border)', boxShadow: 'inset 0 1px 3px var(--card-shadow)', overflow: 'hidden' }}>
          <div
            style={{ position: 'absolute', inset: 0, width: `${Math.round((r.value / max) * 100)}%`, background: 'linear-gradient(180deg, var(--card-top), var(--card-bot))', boxShadow: '0 1px 0 var(--card-hi) inset' }}
          />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px' }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: r.dot, border: '1px solid rgba(0,0,0,0.15)', boxShadow: '0 1px 1px rgba(17,17,17,0.2)', flexShrink: 0 }} />
            <span style={{ flexGrow: 1, fontWeight: 600, fontSize: 13 }}>{r.name}</span>
            <span style={{ fontWeight: 700, fontSize: 12 }}>{r.value}x</span>
          </div>
        </div>
      ))}
    </div>
  );
}
