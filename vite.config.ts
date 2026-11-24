/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { env } from 'node:process';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app under /<repository-name>/. The deploy workflow
// sets BASE_PATH; local development uses the root.
const base = env.BASE_PATH ?? '/';

// Shown in Settings, so the phone's installed version can be checked.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const appVersion = `${version} (${env.GITHUB_SHA?.slice(0, 7) ?? 'local'})`;

// The only hosts the app talks to: GitHub for the vault, Open Library for
// book lookups. Covers are plain images, from Open Library and wherever the
// vault's cover_url points.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://api.github.com https://openlibrary.org",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

// Production builds only: the dev server needs inline scripts for hot reload.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'screening-room-content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!-- content-security-policy -->',
        `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [
    svelte(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'The Screening Room',
        short_name: 'Screening Room',
        description: 'A phone companion for The Screening Room reading archive.',
        lang: 'en',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        theme_color: '#f4efe6',
        background_color: '#f4efe6',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        cleanupOutdatedCaches: true,
        // Vault reads and writes always go to the network. Covers are left to
        // the browser's own cache: opaque images would count as megabytes each.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
