# Outfit

Personal outfit log / closet / style-trends PWA ("Editorial Mono" design). Single user, single device, no backend.

- **Stack:** Vite + React + TypeScript, `idb` (IndexedDB) for items, wear logs and photo blobs, Open-Meteo for weather (keyless, device geolocation), hand-rolled SVG chart, `vite-plugin-pwa` for manifest + service worker.
- **Screens:** Today · Ideas · Closet · Trends · Gallery (`src/screens/`).
- **Ideas:** a rules engine in `src/engine/` (no AI, no network):
  - `day.ts` turns the hourly forecast (feels-like, rain %, wind, UV) into the 8AM–8PM wear window.
  - `garment.ts` infers each piece's warmth, formality and practical traits (waterproof, boots, rain-delicate shoes) from category, sleeves/length, material and name keywords.
  - `thermal.ts` checks an outfit hour by hour against a warmth curve (legs count half; the layer goes on when it helps and always in rain).
  - `color.ts` scores color harmony (neutrals incl. navy/olive/tan/denim, one pop of color, related vs. clashing hues, contrast, denim-on-denim, two graphics).
  - `taste.ts` learns from his logs and ♥ / "not for me" feedback: rotation, pairings he actually wears, whether he runs warm or cold, whether he wears shorts on warm days, the temperatures each piece gets worn in.
  - `stylist.ts` scores every outfit the closet can make, picks three distinct ones (best / bring back a neglected piece / a color move or zero-thought option), explains them, flags closet gaps, and writes the weather starter.
  - `npm test` runs the scenario tests in `stylist.test.ts`.
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
