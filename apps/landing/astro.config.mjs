import { defineConfig } from 'astro/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  output: 'static',
  site: 'https://mjmapsystems.com',
  build: {
    assets: '_assets',
  },
  vite: {
    resolve: {
      alias: {
        '@plans': fileURLToPath(new URL('../../packages/plans/index.ts', import.meta.url)),
      },
    },
  },
});
