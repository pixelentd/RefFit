/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Where the built site is served from. '/' means "domain/subdomain root" — the default, and
// what a first deploy to Hostinger should use. If you later deploy into a subfolder instead
// (e.g. https://yoursite.com/reffit/), change this to '/reffit/' and rebuild: Vite's asset
// URLs, the manifest's start_url/scope, and the service worker's registration path all derive
// from this one constant, so nothing else needs to change.
const BASE_PATH = '/';

// Matches index.css's --bg (light) and --accent. The manifest format itself has no media-query
// support — unlike the two <meta name="theme-color"> tags in index.html, which do adapt to
// light/dark — so these are the one fixed pair used for the install splash screen.
const THEME_COLOR = '#2f6fed';
const BACKGROUND_COLOR = '#f4f4f6';

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'RefFit',
        short_name: 'RefFit',
        description: 'Referee interval fitness trainer: GPS-paced run/walk intervals with audio cues.',
        start_url: BASE_PATH,
        scope: BASE_PATH,
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole built app shell so it loads with no network at all — the point of
        // this being a PWA in the first place is running it on a track with no signal.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,ico}'],
        navigateFallback: `${BASE_PATH}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    // The engine is pure timing logic driven by synthetic timestamps — no DOM needed.
    environment: 'node',
  },
});
