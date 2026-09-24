import { useMemo, useRef, useState } from 'react';
import { idx, ThemeToggle } from '../components/Common';
import { trends, type Period } from '../stats';
import { useStore } from '../store';
import type { Category } from '../types';

const W = 350;
const TOP = 6;
const BOTTOM = 96;
const UP = '#2E9E57';
const DOWN = '#E4572E';
const COLORS_LINE = '#3A6EA5';
const THRIFT_LINE = 'var(--muted)';
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
      <header className="screen-header">
        <h1 className="display screen-title">Trends</h1>
        <div style={{ marginRight: -10, paddingBottom: 4 }}>
          <ThemeToggle />
        </div>
      </header>

      <div role="tablist" className="rule-t rule-b" style={{ margin: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {(['7d', '3mo'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            onClick={() => setPeriod(p)}
            className="label"
            style={{ padding: '11px 0', textAlign: 'center', background: period === p ? 'var(--ink)' : 'transparent', color: period === p ? 'var(--paper)' : 'var(--muted)' }}
          >
            {p === '7d' ? '7 Days' : '3 Months'}
          </button>
        ))}
      </div>

      <section
        onPointerDown={(e) => (swipeX.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipeX.current == null) return;
          const dx = swipeX.current - e.clientX;
          swipeX.current = null;
          if (Math.abs(dx) >= 30) setPeriod(dx > 0 ? '3mo' : '7d');
        }}
        onPointerCancel={() => (swipeX.current = null)}
        style={{ touchAction: 'pan-y', userSelect: 'none', padding: '16px 20px 0' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
          <span className="display" style={{ fontSize: 104, marginLeft: -4 }}>
            {t.headline}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 6 }}>
            <span className="grot" style={{ fontSize: 18, color: trendColor }}>
              {t.up ? '▲' : '▼'} {t.deltaPct === null ? '—' : `${Math.abs(t.deltaPct)}%`}
            </span>
            <span className="label">{is7 ? 'Pieces logged today' : 'Pieces / day, this week'}</span>
            <span className="label muted">vs. {is7 ? '7 days ago' : '3 months ago'}</span>
          </div>
        </div>
        <p style={{ margin: '12px 0 0', fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>
          {t.colorCount} {t.colorCount === 1 ? 'color' : 'colors'} · {t.categoryCount} {t.categoryCount === 1 ? 'category' : 'categories'} in rotation {is7 ? 'this week' : 'this quarter'}.
        </p>

        <svg viewBox={`0 0 ${W} 104`} width="100%" height="120" preserveAspectRatio="none" style={{ marginTop: 14, overflow: 'visible', display: 'block' }} aria-label="Trend chart">
          {[TOP, (TOP + BOTTOM) / 2, BOTTOM].map((y) => (
            <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="var(--rule-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={primary.area} fill={trendColor} opacity="0.1" />
          <path d={thrift.line} fill="none" stroke={THRIFT_LINE} strokeWidth="1.25" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <path d={colors.line} fill="none" stroke={COLORS_LINE} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <path d={primary.line} fill="none" stroke={trendColor} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="rule-t" style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6 }}>
          <span className="index">{t.startLabel}</span>
          <span style={{ display: 'flex', gap: 5 }} aria-hidden>
            <span style={{ width: 14, height: 3, background: is7 ? 'var(--ink)' : 'var(--rule-soft)' }} />
            <span style={{ width: 14, height: 3, background: is7 ? 'var(--rule-soft)' : 'var(--ink)' }} />
          </span>
          <span className="index">{t.endLabel}</span>
        </div>
        <div style={{ display: 'flex', gap: 16, paddingTop: 10, flexWrap: 'wrap' }}>
          <Legend swatch={<span style={{ width: 14, height: 3, background: trendColor }} />} label="Pieces logged" />
          <Legend swatch={<span style={{ width: 14, height: 2, background: COLORS_LINE }} />} label="Colors worn" />
          <Legend swatch={<span style={{ width: 14, height: 0, borderTop: `2px dashed ${THRIFT_LINE}` }} />} label="Thrifted %" />
        </div>
      </section>

      {!t.hasData ? (
        <div className="empty">Nothing logged {is7 ? 'this week' : 'in the last 3 months'} yet — log a fit on Today.</div>
      ) : (
        <>
          <Breakdown title="By color" rows={t.byColor.map((r) => ({ name: r.name, dot: r.hex, value: r.value }))} />
          <Breakdown title="By category" rows={t.byCategory.map((r) => ({ name: r.name, dot: CATEGORY_DOT[r.category], value: r.value }))} />
        </>
      )}
      <div style={{ height: 24 }} />
    </>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="label muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {swatch}
      {label}
    </span>
  );
}

/** Numbered rows; each bar is sized against the top value in its own list. */
function Breakdown({ title, rows }: { title: string; rows: { name: string; dot: string; value: number }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <section style={{ padding: '26px 20px 0' }}>
      <div className="rule-b" style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6 }}>
        <span className="label">{title}</span>
        <span className="label muted">Times worn</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.name} className="hair-b" style={{ display: 'grid', gridTemplateColumns: '24px 96px 1fr 38px', alignItems: 'center', gap: 10, padding: '9px 0' }}>
          <span className="index">{idx(i)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em', minWidth: 0 }}>
            <span className="swatch" style={{ background: r.dot, width: 10, height: 10 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          </span>
          <span style={{ height: 8, background: 'var(--rule-soft)', position: 'relative' }}>
            <span style={{ position: 'absolute', inset: 0, width: `${Math.round((r.value / max) * 100)}%`, background: 'var(--ink)' }} />
          </span>
          <span className="display" style={{ fontSize: 20, textAlign: 'right', lineHeight: 1 }}>
            {r.value}
          </span>
        </div>
      ))}
    </section>
  );
}
