import type { WeatherIcon } from '../weather';

const stroke = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function SunIcon({ size = 14, width = 1.8 }: { size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={width} aria-hidden>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.1 5.1l1.4 1.4M17.5 17.5l1.4 1.4M18.9 5.1l-1.4 1.4M6.5 17.5l-1.4 1.4" />
    </svg>
  );
}

export function MoonIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={1.8} aria-hidden>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  );
}

export function PlusIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={2} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function GearIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={1.7} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function SparkleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--accent)" aria-hidden>
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" />
    </svg>
  );
}

export function PhotoPlaceholder({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={1.4} opacity={0.4} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.6" />
      <path d="M21 15.5l-5.2-5.2a1.5 1.5 0 0 0-2.1 0L5 19" />
    </svg>
  );
}

export function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={2.4} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function StarIcon({ filled, size = 12 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
    </svg>
  );
}

/** Weather glyphs in the same stroke style as the design's sun / partly / cloud set. */
export function WeatherGlyph({ icon, size = 16 }: { icon: WeatherIcon; size?: number }) {
  const cloud = 'M8.4 17h9a3.4 3.4 0 0 0 .5-6.77A4.9 4.9 0 0 0 8.6 11.6 3 3 0 0 0 8.4 17z';
  const props = { width: size, height: size, viewBox: '0 0 24 24', ...stroke, 'aria-hidden': true };
  switch (icon) {
    case 'sun':
      return (
        <svg {...props} strokeWidth={1.6}>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 3.5v1.6M12 18.9v1.6M3.5 12h1.6M18.9 12h1.6M6.1 6.1l1.1 1.1M16.8 16.8l1.1 1.1M17.9 6.1l-1.1 1.1M7.2 16.8l-1.1 1.1" />
        </svg>
      );
    case 'partly':
      return (
        <svg {...props} strokeWidth={size > 24 ? 1.4 : 1.5}>
          <circle cx="9" cy="8" r="3.4" />
          <path d="M9 2.6v1M3.6 8h1M5.3 4.3l.7.7M13.4 8h-.4M12.7 4.3l-.7.7" />
          <path d={cloud} />
        </svg>
      );
    case 'cloud':
      return (
        <svg {...props} strokeWidth={1.6}>
          <path d={cloud} />
        </svg>
      );
    case 'fog':
      return (
        <svg {...props} strokeWidth={1.6}>
          <path d="M8.4 13h9a3.4 3.4 0 0 0 .5-6.77A4.9 4.9 0 0 0 8.6 7.6 3 3 0 0 0 8.4 13z" />
          <path d="M5 17h14M7 20.5h10" />
        </svg>
      );
    case 'rain':
      return (
        <svg {...props} strokeWidth={1.6}>
          <path d="M8.4 14h9a3.4 3.4 0 0 0 .5-6.77A4.9 4.9 0 0 0 8.6 8.6 3 3 0 0 0 8.4 14z" />
          <path d="M9 17l-1 2.5M13 17l-1 2.5M17 17l-1 2.5" />
        </svg>
      );
    case 'snow':
      return (
        <svg {...props} strokeWidth={1.6}>
          <path d="M8.4 14h9a3.4 3.4 0 0 0 .5-6.77A4.9 4.9 0 0 0 8.6 8.6 3 3 0 0 0 8.4 14z" />
          <path d="M9 18h.01M13 19.5h.01M17 18h.01" strokeWidth={2.4} />
        </svg>
      );
    case 'storm':
      return (
        <svg {...props} strokeWidth={1.6}>
          <path d="M8.4 14h9a3.4 3.4 0 0 0 .5-6.77A4.9 4.9 0 0 0 8.6 8.6 3 3 0 0 0 8.4 14z" />
          <path d="M13 15l-2 3.5h3l-2 3.5" />
        </svg>
      );
  }
}
