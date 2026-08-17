// Generates public/og-image.jpg (1200x630) from the hero photo, with the site's
// brand typography (Fraunces display + Manrope/UI-mono eyebrows), using headless
// Chrome via puppeteer-core. Runs as part of `npm run build`.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

// Downscale a photo to a width small enough to embed in the OG HTML without
// stalling the renderer: the mosaic slots are ~400px wide, so 800px is ample
// and keeps the card under a megabyte.
const tile = async (rel, width = 800) =>
  (await sharp(path.join(root, rel)).resize({ width }).jpeg({ quality: 82 }).toBuffer()).toString("base64");

// Preprocess a photo into the exact card geometry (1200x630) so the renderer
// never upscales: cover-crop with Lanczos3, then a mild unsharp mask. This
// matters for sources smaller than the card (e.g. the 960px Bataan photo) —
// without it, Chrome stretches the JPEG 1.25x with a soft bilinear filter.
//
// NOTE: only pass `sigma` — the object API defaults are m1=1.0, m2=2.0,
// x1=2.0, and passing 0s there zeroes the sharpening (x1:0 makes everything
// "flat", then m1:0 sharpens nothing).
const cardPhoto = async (rel) => {
  const buf = await sharp(path.join(root, rel))
    .resize(1200, 630, {
      fit: "cover",
      kernel: sharp.kernel.lanczos3,
      position: "centre",
    })
    .sharpen({ sigma: 1.0 })
    .jpeg({ quality: 88 })
    .toBuffer();
  return buf.toString("base64");
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "og-image.jpg");

// ---- Find a Chrome/Chromium binary -----------------------------------------
// Puppeteer's browser cache (what `npx browsers install chrome@stable` writes on
// CI/Vercel): ~/.cache/puppeteer/chrome/<buildId>/chrome-linux64/chrome, plus the
// macOS/Windows equivalents.
const cacheChrome = () => {
  try {
    const base = path.join(os.homedir(), ".cache", "puppeteer", "chrome");
    if (!existsSync(base)) return null;
    const targets = [
      ["chrome-linux64", "chrome"],
      ["chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
      ["chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
      ["chrome-win64", "chrome.exe"],
      ["chrome-headless-shell-linux64", "chrome-headless-shell"],
    ];
    for (const buildDir of readdirSync(base)) {
      for (const t of targets) {
        const p = path.join(base, buildDir, ...t);
        if (existsSync(p)) return p;
      }
    }
  } catch {
    /* cache unreadable — fall through to the other candidates */
  }
  return null;
};

const candidates = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  cacheChrome(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const chromePath = candidates.find((p) => existsSync(p));
if (!chromePath) {
  console.error(
    "✗ generate-og: no Chrome/Chromium found. Set CHROME_PATH or install Chrome, " +
      "then re-run. The og:image metadata expects public/og-image.jpg to exist."
  );
  process.exit(1);
}

// ---- Assets as data URLs (no file access needed inside the page) ------------
const b64 = (rel) => readFileSync(path.join(root, rel)).toString("base64");
const photo = b64("src/assets/img/gravelines.jpg");
const bataan = await cardPhoto("src/assets/img/bataan.jpg");
const mosaic = await Promise.all([
  tile("src/assets/img/pellet-hand.jpg"),
  tile("src/assets/img/control-room.jpg"),
  tile("src/assets/img/cofrentes.jpg"),
]);
const fraunces = b64(
  "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2"
);
const manrope = b64(
  "node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2"
);

const fontCss = `
  @font-face {
    font-family: "Fraunces";
    src: url(data:font/woff2;base64,${fraunces}) format("woff2");
    font-weight: 100 900;
    font-style: normal;
    font-display: block;
  }
  @font-face {
    font-family: "Manrope";
    src: url(data:font/woff2;base64,${manrope}) format("woff2");
    font-weight: 200 800;
    font-style: normal;
    font-display: block;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
`;

const atomSvg = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="32" cy="32" r="6" fill="#ffc53d" />
  <g fill="none" stroke="#e7edf3" stroke-width="2.5" opacity="0.9">
    <ellipse cx="32" cy="32" rx="27" ry="10" transform="rotate(-30 32 32)" />
    <ellipse cx="32" cy="32" rx="27" ry="10" transform="rotate(30 32 32)" />
    <ellipse cx="32" cy="32" rx="27" ry="10" transform="rotate(90 32 32)" />
  </g>
</svg>`;  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  ${fontCss}
  .card {
    position: relative;
    width: 1200px;
    height: 630px;
    background: #0a0e13;
    font-family: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;
  }
  .photo {
    position: absolute;
    inset: 0;
    background-image: url(data:image/jpeg;base64,${photo});
    background-size: cover;
    background-position: center;
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(10, 14, 19, 0.9) 0%,
      rgba(10, 14, 19, 0.52) 42%,
      rgba(10, 14, 19, 0.9) 100%
    );
  }
  .content {
    position: absolute;
    inset: 0;
    padding: 58px 72px 52px;
    display: flex;
    flex-direction: column;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    align-self: flex-start;
  }
  .brand svg { width: 34px; height: 34px; display: block; }
  .brand-label {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: #ffc53d;
  }
  .spacer { flex: 1; }
  h1 {
    font-family: "Fraunces", Georgia, serif;
    font-weight: 600;
    font-optical-sizing: auto;
    font-size: 64px;
    line-height: 1.09;
    letter-spacing: -0.015em;
    color: #e7edf3;
    max-width: 1000px;
    text-wrap: balance;
  }
  h1 .acc { color: #ffc53d; }
  .stats {
    margin-top: 40px;
    padding-top: 24px;
    border-top: 1px solid rgba(255, 197, 61, 0.45);
    display: flex;
    gap: 40px;
    align-items: center;
  }
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    font-size: 21px;
    color: #c6d0d9;
    white-space: nowrap;
  }
  .stat::before {
    content: "";
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #ffc53d;
    flex: none;
  }
  .stat strong { color: #e7edf3; font-weight: 700; }
</style>
</head>
<body>
  <div class="card">
    <div class="photo" role="img" aria-label="Gravelines nuclear power station from the sea"></div>
    <div class="scrim"></div>
    <div class="content">
      <div class="brand">
        ${atomSvg}
        <span class="brand-label">Why Nuclear</span>
      </div>
      <div class="spacer"></div>
      <h1>The <span class="acc">cleanest, safest, most reliable</span> energy we already know how to build</h1>
      <div class="spacer"></div>
      <div class="stats">
        <div class="stat"><strong>≈12 g</strong> CO₂/kWh lifecycle</div>
        <div class="stat"><strong>0.07</strong> deaths per TWh</div>
        <div class="stat"><strong>~93%</strong> capacity factor</div>
      </div>
    </div>
  </div>
</body>
</html>`;

// Second card: a photo mosaic for the credits page. Three site photos in a
// strip, then the brand typography and a short promise line.
const creditsHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  ${fontCss}
  .card {
    position: relative;
    width: 1200px;
    height: 630px;
    background: #0a0e13;
    font-family: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;
  }
  .strip {
    display: flex;
    height: 312px;
    border-bottom: 2px solid #ffc53d;
  }
  .strip img {
    flex: 1;
    min-width: 0;
    width: 0;
    height: 100%;
    object-fit: cover;
    border-right: 1px solid rgba(10, 14, 19, 0.55);
  }
  .strip img:last-child { border-right: none; }
  .content {
    position: absolute;
    inset: 312px 0 0;
    padding: 40px 72px 46px;
    display: flex;
    flex-direction: column;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    align-self: flex-start;
  }
  .brand svg { width: 30px; height: 30px; display: block; }
  .brand-label {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: #ffc53d;
  }
  .spacer { flex: 1; }
  h1 {
    font-family: "Fraunces", Georgia, serif;
    font-weight: 600;
    font-optical-sizing: auto;
    font-size: 52px;
    line-height: 1.08;
    letter-spacing: -0.015em;
    color: #e7edf3;
    max-width: 900px;
    text-wrap: balance;
  }
  h1 .acc { color: #ffc53d; }
  .meta {
    margin-top: 22px;
    padding-top: 18px;
    border-top: 1px solid rgba(255, 197, 61, 0.45);
    display: flex;
    gap: 40px;
    align-items: center;
  }
  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    font-size: 19px;
    color: #c6d0d9;
    white-space: nowrap;
  }
  .meta-item::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ffc53d;
    flex: none;
  }
  .meta-item strong { color: #e7edf3; font-weight: 700; }
</style>
</head>
<body>
  <div class="card">
    <div class="strip">
      <img src="data:image/jpeg;base64,${mosaic[0]}" alt="Gloved hand holding nuclear fuel pellets" />
      <img src="data:image/jpeg;base64,${mosaic[1]}" alt="Nuclear plant control room" />
      <img src="data:image/jpeg;base64,${mosaic[2]}" alt="Cofrentes nuclear power station" />
    </div>
    <div class="content">
      <div class="brand">
        ${atomSvg}
        <span class="brand-label">Why Nuclear</span>
      </div>
      <div class="spacer"></div>
      <h1>Every photo on this site, <span class="acc">credited</span></h1>
      <div class="spacer"></div>
      <div class="meta">
        <div class="meta-item"><strong>11 photos</strong> · one attribution record</div>
        <div class="meta-item"><strong>Wikimedia Commons</strong> originals linked</div>
        <div class="meta-item"><strong>Free</strong> to reuse with credit</div>
      </div>
    </div>
  </div>
</body>
</html>`;

// Third card: the Philippines deep-dive. Full-bleed Bataan photo (the
// mothballed plant), brand typography, and the institutional-capacity line.
const philippinesHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  ${fontCss}
  .card {
    position: relative;
    width: 1200px;
    height: 630px;
    background: #0a0e13;
    font-family: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;
  }
  .photo {
    position: absolute;
    inset: 0;
    background-image: url(data:image/jpeg;base64,${bataan});
    background-size: cover;
    background-position: center;
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(10, 14, 19, 0.88) 0%,
      rgba(10, 14, 19, 0.5) 40%,
      rgba(10, 14, 19, 0.92) 100%
    );
  }
  .content {
    position: absolute;
    inset: 0;
    padding: 58px 72px 52px;
    display: flex;
    flex-direction: column;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    align-self: flex-start;
  }
  .brand svg { width: 34px; height: 34px; display: block; }
  .brand-label {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: #ffc53d;
  }
  .spacer { flex: 1; }
  h1 {
    font-family: "Fraunces", Georgia, serif;
    font-weight: 600;
    font-optical-sizing: auto;
    font-size: 60px;
    line-height: 1.08;
    letter-spacing: -0.015em;
    color: #e7edf3;
    max-width: 1000px;
    text-wrap: balance;
  }
  h1 .acc { color: #ffc53d; }
  .sub {
    margin-top: 22px;
    font-family: "Manrope", ui-sans-serif, system-ui, sans-serif;
    font-size: 24px;
    line-height: 1.45;
    color: #c6d0d9;
    max-width: 860px;
  }
  .meta {
    margin-top: 34px;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 197, 61, 0.45);
    display: flex;
    gap: 36px;
    align-items: center;
  }
  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    font-size: 19px;
    color: #c6d0d9;
    white-space: nowrap;
  }
  .meta-item::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ffc53d;
    flex: none;
  }
  .meta-item strong { color: #e7edf3; font-weight: 700; }
</style>
</head>
<body>
  <div class="card">
    <div class="photo" role="img" aria-label="The mothballed Bataan Nuclear Power Plant, Morong, Philippines"></div>
    <div class="scrim"></div>
    <div class="content">
      <div class="brand">
        ${atomSvg}
        <span class="brand-label">Why Nuclear</span>
      </div>
      <div class="spacer"></div>
      <h1>Nuclear in the <span class="acc">Philippines</span></h1>
      <div class="sub">Bataan's scar, the Ring of Fire, and the real question: institutions.</div>
      <div class="spacer"></div>
      <div class="meta">
        <div class="meta-item"><strong>1976–84</strong> BNPP, never fueled</div>
        <div class="meta-item"><strong>2023</strong> U.S.–PH 123 agreement</div>
        <div class="meta-item"><strong>2024</strong> IAEA review</div>
      </div>
    </div>
  </div>
</body>
</html>`;

const render = async (page, markup, fonts, file) => {
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.setContent(markup, { waitUntil: "load" });
  // Force the fonts and any embedded photos to finish decoding before painting.
  await page.evaluate(async (specs) => {
    for (const [weight, size, family] of specs) {
      await document.fonts.load(`${weight} ${size}px ${family}`);
    }
    await document.fonts.ready;
    if (!document.fonts.check('600 52px "Fraunces"')) {
      throw new Error("Fraunces did not load; the OG headline would silently fall back");
    }
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete ? Promise.resolve() : img.decode()
      )
    );
  }, fonts);
  await page.screenshot({ path: file, type: "jpeg", quality: 88 });
  console.log(`✓ og:image written to ${path.relative(root, file)}`);
};

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
});
try {
  const page = await browser.newPage();
  await render(
    page,
    html,
    [
      ["600", "64", "Fraunces"],
      ["700", "20", "Manrope"],
    ],
    out
  );
  await render(
    page,
    creditsHtml,
    [
      ["600", "52", "Fraunces"],
      ["700", "18", "Manrope"],
    ],
    path.join(root, "public", "og-credits.jpg")
  );
  await render(
    page,
    philippinesHtml,
    [
      ["600", "60", "Fraunces"],
      ["700", "24", "Manrope"],
    ],
    path.join(root, "public", "og-philippines.jpg")
  );
} finally {
  await browser.close();
}
