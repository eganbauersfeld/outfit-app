import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Closet } from './screens/Closet';
import { Gallery } from './screens/Gallery';
import { Today } from './screens/Today';
import { Trends } from './screens/Trends';
import { SettingsProvider, StoreProvider } from './store';
import './styles.css';

// iOS Safari only applies :active (the press feedback) once the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });

const TABS = [
  { id: 'today', label: 'Today', Screen: Today },
  { id: 'closet', label: 'Closet', Screen: Closet },
  { id: 'trends', label: 'Trends', Screen: Trends },
  { id: 'gallery', label: 'Gallery', Screen: Gallery },
] as const;
type TabId = (typeof TABS)[number]['id'];

function currentTab(): TabId {
  const h = location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as TabId) : 'today';
}

function App() {
  const [tab, setTab] = useState<TabId>(currentTab);
  useEffect(() => {
    const onHash = () => setTab(currentTab());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const { Screen } = TABS.find((t) => t.id === tab)!;

  return (
    <div className="app">
      <main key={tab}>
        <Screen />
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => {
              history.replaceState(null, '', `#${t.id}`);
              setTab(t.id);
              scrollTo(0, 0);
            }}
          >
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </SettingsProvider>
  </StrictMode>,
);
