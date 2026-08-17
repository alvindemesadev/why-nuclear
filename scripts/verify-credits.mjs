#!/usr/bin/env node
// verify-credits.mjs
//
// Build-time check that the credits list never goes stale:
//   1. Parses public/CREDITS.md for every image entry (file page, direct link, license, local file).
//   2. Ensures each image exists in src/assets/img, downloading it (with a thumbnail-CDN
//      fallback) when it is missing or when run with --force.
//   3. Fetches each Wikimedia file page and confirms the expected license is still present.
//
// Exit code is non-zero on any hard failure, so `npm run build` stops if a license dies,
// an image disappears, or a download fails. Transient 429s are retried with backoff.
//
// Usage:
//   node scripts/verify-credits.mjs          # verify + download missing images
//   node scripts/verify-credits.mjs --force  # also re-download everything

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const creditsPath = join(root, 'public', 'CREDITS.md');
const imgDir = join(root, 'src', 'assets', 'img');
const force = process.argv.includes('--force');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 WhyNuclearBuild/1.0';

// Short license names in CREDITS.md -> regex that must appear on the Wikimedia file page.
const LICENSE_PATTERNS = {
  'CC BY-SA 3.0': /Attribution-ShareAlike 3\.0/i,
  'CC BY-SA 4.0': /Attribution-ShareAlike 4\.0/i,
  'CC BY 2.0': /Attribution 2\.0 Generic/i,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (res.status === 429) {
        console.log(`      (rate limited, retrying in ${5 * i}s)`);
        await sleep(5000 * i);
        continue;
      }
      return res;
    } catch {
      await sleep(2000 * i);
    }
  }
  return null;
}

function parseCredits(md) {
  const entries = [];
  const blocks = md.split(/\n(?=## \d+\.)/);
  for (const block of blocks) {
    const heading = block.match(/^## \d+\.\s*(.+?)\s+—/m);
    if (!heading) continue;
    entries.push({
      name: heading[1].trim(),
      filePage: block.match(/- \*\*File page:\*\* (https?:\/\/\S+)/)?.[1],
      direct: block.match(/- \*\*Direct:\*\* (https?:\/\/\S+)/)?.[1],
      license: block.match(/- \*\*License:\*\* (?:\[([^\]]+)\]\([^)]+\)|(Public domain|[^\s(]+))/)?.[1] ?? block.match(/- \*\*License:\*\* (?:\[([^\]]+)\]\([^)]+\)|(Public domain|[^\s(]+))/)?.[2],
      local: block.match(/- \*\*Local:\*\* (\S+)/)?.[1],
    });
  }
  return entries;
}

function licensePattern(name) {
  if (!name) return null;
  if (/^PD-/i.test(name) || /public domain/i.test(name)) return /public domain/i;
  return LICENSE_PATTERNS[name] || null;
}

async function downloadImage(entry) {
  const out = join(imgDir, entry.local);
  // Primary: Special:FilePath redirects to the original file.
  const res = await fetchWithRetry(entry.direct);
  if (res && res.status === 200 && (res.headers.get('content-type') || '').startsWith('image/')) {
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(out, buf);
    return { ok: true, bytes: buf.length, via: 'original' };
  }
  // Fallback: thumbnail CDN (upload.wikimedia.org) using the md5-based path.
  const fname = decodeURIComponent(entry.direct.split('/').pop());
  const md5 = createHash('md5').update(fname).digest('hex');
  const base = `https://upload.wikimedia.org/wikipedia/commons/thumb/${md5[0]}/${md5.slice(0, 2)}/${fname}`;
  for (const w of [2560, 1280, 640]) {
    const r = await fetchWithRetry(`${base}/${w}px-${fname}`);
    if (r && r.status === 200 && (r.headers.get('content-type') || '').startsWith('image/')) {
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(out, buf);
      return { ok: true, bytes: buf.length, via: `thumbnail ${w}px` };
    }
  }
  return { ok: false };
}

async function verifyLicense(entry) {
  if (!entry.filePage) return { ok: false, why: 'no File page URL in CREDITS.md' };
  const res = await fetchWithRetry(entry.filePage);
  if (!res) return { ok: false, why: 'request failed after retries' };
  if (res.status !== 200) return { ok: false, why: `file page HTTP ${res.status}` };
  const html = await res.text();
  const pattern = licensePattern(entry.license);
  if (!pattern)
    return {
      ok: false,
      why: `no pattern mapped for license "${entry.license || 'unknown'}"; add one in scripts/verify-credits.mjs`,
    };
  if (!pattern.test(html)) return { ok: false, why: `license "${entry.license}" no longer found on the page` };
  return { ok: true, why: `license "${entry.license}" confirmed` };
}

async function main() {
  const md = readFileSync(creditsPath, 'utf8');
  const entries = parseCredits(md);
  if (entries.length === 0) {
    console.error('verify-credits: no entries parsed from public/CREDITS.md');
    process.exitCode = 1;
    return;
  }
  console.log(`\nverify-credits: ${entries.length} image entries in public/CREDITS.md`);

  let failures = 0;
  let warnings = 0;
  let downloaded = 0;

  for (const entry of entries) {
    const exists = entry.local && existsSync(join(imgDir, entry.local));
    let state = exists ? 'present' : 'missing';

    if (!entry.local) {
      failures++;
      console.log(`  ✗ ${entry.name}: no "Local:" filename in CREDITS.md`);
      continue;
    }
    if (!exists || force) {
      const dl = await downloadImage(entry);
      if (dl.ok) {
        downloaded++;
        state = `downloaded (${(dl.bytes / 1024).toFixed(0)} kB via ${dl.via})`;
      } else {
        failures++;
        console.log(`  ✗ ${entry.local}: download failed (original + thumbnail CDN)`);
        continue;
      }
    }

    const lic = await verifyLicense(entry);
    if (lic.ok) {
      console.log(`  ✓ ${entry.local} [${state}] — ${lic.why}`);
    } else {
      failures++;
      console.log(`  ✗ ${entry.local} [${state}] — ${lic.why}`);
    }
    await sleep(700); // be polite to Wikimedia
  }

  console.log(
    `\nverify-credits done: ${entries.length - failures}/${entries.length} ok` +
      `${downloaded ? `, ${downloaded} downloaded` : ''}` +
      `${warnings ? `, ${warnings} warning(s)` : ''}` +
      `${failures ? `, ${failures} FAILURE(S)` : ''}\n`
  );
  process.exitCode = failures ? 1 : 0;
}

main();
