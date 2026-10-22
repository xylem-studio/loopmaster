// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://loopmaster.contrastic.io',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  vite: {
    // three.js is only reached through a lazy import(); pre-bundle it so the dev
    // server doesn't re-optimise mid-page and break that import.
    optimizeDeps: { include: ['three'] },
  },
});
