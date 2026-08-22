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
