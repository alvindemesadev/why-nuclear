#!/usr/bin/env node
// verify-og-images.mjs
//
// Build-time check that the social share images never go stale:
//   1. Walks dist/**/*.html and collects every og:image / twitter:image URL.
//   2. Resolves each against the site root (they are absolute, e.g.
//      https://why-nuclear.vercel.app/og-image.jpg).
//   3. Asserts the file exists under dist/ and is a real JPEG/PNG (magic bytes),
//      so a missing or corrupt share image fails `npm run build`.
//
// Usage:
//   node scripts/verify-og-images.mjs          # run against dist/ (after astro build)
//   node scripts/verify-og-images.mjs --dist <dir>

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, sep } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distFlag = process.argv.indexOf('--dist');
const distArg = distFlag !== -1 ? process.argv[distFlag + 1] : null;
const distRoot = distArg ? (isAbsolute(distArg) ? distArg : join(root, distArg)) : join(root, 'dist');

// Collect every .html file under dist/.
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = join(dir, entry.name);
    return entry.isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
  });
}

const htmlFiles = walk(distRoot);
const seen = new Map(); // image path -> list of pages that reference it
const failures = [];

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const refs = [
    ...html.matchAll(/<meta\s+property="og:image"\s+content="([^"]+)"/g),
    ...html.matchAll(/<meta\s+name="twitter:image"\s+content="([^"]+)"/g),
  ];
  for (const m of refs) {
    let url;
    try {
      url = new URL(m[1], 'http://local');
    } catch {
      failures.push(`  ${file}: unparsable share-image URL "${m[1]}"`);
      continue;
    }
    const rel = url.pathname.replace(/^\/+/, '');
    if (!seen.has(rel)) seen.set(rel, new Set());
    seen.get(rel).add(file);
  }
}

if (seen.size === 0) {
  console.error('verify-og: no og:image/twitter:image meta found in the built HTML — is the build fresh?');
  process.exit(1);
}

for (const [rel, pages] of [...seen.entries()].sort()) {
  const abs = join(distRoot, rel.split('/').join(sep));
  const pageList = [...pages];
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    failures.push(`  ${rel} (referenced by ${pageList.length} page(s)) — MISSING in dist`);
    continue;
  }
  const head = readFileSync(abs);
  const isJpeg = head.length > 2 && head[0] === 0xff && head[1] === 0xd8;
  const isPng = head.length > 8 && head.readUInt32BE(0) === 0x89504e47;
  if (!isJpeg && !isPng) {
    failures.push(`  ${rel} (referenced by ${pageList.length} page(s)) — present but not a JPEG/PNG (${head.length} bytes)`);
    continue;
  }
  console.log(`  ✓ ${rel} [${head.length} bytes, ${isJpeg ? 'JPEG' : 'PNG'}] — used by ${pageList.length} page(s)`);
}

if (failures.length) {
  console.error('\nverify-og: ' + failures.length + ' share-image problem(s):');
  for (const f of failures) console.error(f);
  console.error('\nFix: make sure every og:image exists in public/ (or the page drops the meta), then rebuild.');
  process.exit(1);
}
console.log(`verify-og: ${seen.size} share image(s) verified across ${htmlFiles.length} page(s).`);
