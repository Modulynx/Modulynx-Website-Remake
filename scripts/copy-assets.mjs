import { cpSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'assets');
const to = resolve(root, 'dist/assets');

if (!existsSync(from)) {
  console.error('[copy-assets] assets/ not found — nothing to copy.');
  process.exit(1);
}

// Ship the optimised videos only; the unprocessed masters stay local.
cpSync(from, to, { recursive: true, filter: (src) => !src.includes('_originals') });
console.log('[copy-assets] assets/ -> dist/assets (originals excluded)');

// Cloudflare Pages reads its cache rules from a _headers file in the published
// directory. Netlify takes the same policy from netlify.toml, so shipping both
// keeps either host correct without a second source of truth to maintain.
const headers = resolve(root, '_headers');
if (existsSync(headers)) {
  cpSync(headers, resolve(root, 'dist/_headers'));
  console.log('[copy-assets] _headers -> dist/_headers');
}
