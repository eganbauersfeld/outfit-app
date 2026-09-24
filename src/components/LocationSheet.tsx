import { useEffect, useState } from 'react';
import { getSavedLocation, searchPlaces, setManualLocation, switchToDeviceLocation, type Place } from '../weather';
import { Sheet } from './Common';

/** Pick a city for the forecast, or go back to device location. */
export function LocationSheet({ onClose }: { onClose: () => void }) {
  const saved = getSavedLocation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [state, setState] = useState<'idle' | 'searching' | 'error'>('idle');

  // Debounced search as he types.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return setResults([]);
    setState('searching');
    const t = setTimeout(() => {
      searchPlaces(q)
        .then((r) => {
          setResults(r);
          setState('idle');
        })
        .catch(() => setState('error'));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <Sheet title="Weather location" onClose={onClose}>
      <p className="muted" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 14px', lineHeight: 1.5 }}>
        Now using: <span style={{ color: 'var(--ink)' }}>{saved?.source === 'manual' ? saved.name : 'current location'}</span>
      </p>

      {saved?.source === 'manual' && (
        <button
          type="button"
          className="primary-btn center"
          style={{ marginBottom: 18 }}
          onClick={() => {
            switchToDeviceLocation();
            onClose();
          }}
        >
          Use my current location
        </button>
      )}

      <label className="field" style={{ marginBottom: 10 }}>
        <span className="sublabel">Search for a city</span>
        <input className="input" type="search" enterKeyHint="search" autoComplete="off" value={query} placeholder="e.g. Brooklyn" onChange={(e) => setQuery(e.target.value)} />
      </label>

      {state === 'error' && <div className="empty">Search isn’t working right now. Check your connection.</div>}
      {state === 'idle' && query.trim().length >= 2 && results.length === 0 && <div className="empty">No matches.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map((p) => (
          <button
            key={`${p.lat},${p.lon}`}
            type="button"
            className="hair-b"
            style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}
            onClick={() => {
              setManualLocation(p);
              onClose();
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</span>
            {p.region && <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{p.region}</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
