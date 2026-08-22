import { defineConfig } from 'vite';

// The story assets live in ./assets and are referenced by plain runtime URLs
// (see src/main.js), so Vite must not try to fingerprint or inline them.
// `npm run build` copies the folder into dist/ verbatim afterwards.
export default defineConfig({
  // Relative asset URLs so the build works from a domain root *and* from a
  // sub-path such as GitHub Pages (/<repo>/), without a rebuild.
  base: './',
  publicDir: false,
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900
  }
});
