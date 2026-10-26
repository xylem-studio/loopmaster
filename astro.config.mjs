// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://loopmaster.contrastic.io',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  vite: {
    plugins: [
      {
        // Older iPads top out at iPadOS 15 (Safari 15): lower newer syntax such as
        // class static blocks in three.js, which Safari 15 can't parse at all.
        // Astro pins the client build to esnext, so override it per environment.
        name: 'loopmaster:safari15-target',
        configEnvironment(name) {
          if (name === 'client') return { build: { target: 'safari15', cssTarget: 'safari15' } };
        },
      },
    ],
    // three.js is only reached through a lazy import(); pre-bundle it so the dev
    // server doesn't re-optimise mid-page and break that import.
    optimizeDeps: { include: ['three'] },
  },
});
