import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base so the build works from any static host path
// (a GitHub Pages project subpath, Netlify root, etc.).
export default defineConfig({
  base: './',
  // The photo-cutout worker code-splits (the model runtime loads on demand), which needs ES module workers.
  worker: { format: 'es' },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Outfit',
        short_name: 'Outfit',
        description: 'Personal outfit log, closet and style trends.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#E7E6E2',
        theme_color: '#E7E6E2',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            // The photo-cutout model (4.6 MB) and its WebAssembly runtime: too big to precache,
            // so they're cached the first time a photo is cleaned up and work offline after that.
            urlPattern: ({ url }) => /\/models\/.+\.onnx$|\.wasm$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'cutout-model',
              expiration: { maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
