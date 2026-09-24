import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// The icon art is full-bleed (black background baked into the SVG), so no padding or white fill anywhere.
const full = { padding: 0, resizeOptions: { background: '#111111', fit: 'contain' as const } };

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, ...full },
    maskable: { ...minimal2023Preset.maskable, ...full },
    apple: { ...minimal2023Preset.apple, ...full },
  },
  images: ['public/icon.svg'],
});
