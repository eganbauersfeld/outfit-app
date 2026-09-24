# Outfit

Personal outfit log / closet / style-trends PWA ("Editorial Mono" design). Single user, single device, no backend.

- **Stack:** Vite + React + TypeScript, `idb` (IndexedDB) for items, wear logs and photo blobs, Open-Meteo for weather (keyless, device geolocation), hand-rolled SVG chart, `vite-plugin-pwa` for manifest + service worker.
- **Screens:** Today · Ideas · Closet · Trends · Gallery (`src/screens/`).
- **Ideas:** a weather-based starter line (`starterFor` in `src/ideas.ts`), then combos on request — from Claude (`src/ai.ts`, `claude-opus-5`, called from the phone with the user's own API key saved in Settings) or from rules when there's no key or the call fails.
- **Data:** `src/types.ts` (ClothingItem, WearLogEntry), `src/db.ts`, derived stats in `src/stats.ts`, outfit ideas in `src/ideas.ts`.

## Develop

```bash
npm install
npm run dev
```

`npm run icons` regenerates the PNG icons from `public/icon.svg`.

## Deploy

`npm run build` → static files in `dist/`. The build uses relative paths, so it works at any host path (GitHub Pages project page, Netlify, Vercel). It needs HTTPS for geolocation and the service worker.

On iPhone: open the URL in Safari → Share → **Add to Home Screen**.

## Notes

- Everything lives in the phone's IndexedDB. Use **Settings → Export** now and then; Import restores a backup.
- The 3-month Trends view is 13 weekly points (pieces per logged day, colors worn, thrifted %).
- Items tagged only "house-only" or "sports" are never used in outfit ideas.
- Not built yet (open questions in the spec): auto-tagging color/Graphic from photos, wear-frequency notifications, daily fit photos in Gallery (tiles show the day's colors for now).
