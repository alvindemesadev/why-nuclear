// Diagnostic: capture layout-shift entries with their source elements on /credits/.
import puppeteer from "puppeteer-core";
import os from "node:os";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const cacheChrome = () => {
  try {
    const base = path.join(os.homedir(), ".cache", "puppeteer", "chrome");
    if (!existsSync(base)) return null;
    const targets = [
      ["chrome-linux64", "chrome"],
      ["chrome-win64", "chrome.exe"],
      ["chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
    ];
    for (const buildDir of readdirSync(base)) {
      for (const t of targets) {
        const p = path.join(base, buildDir, ...t);
        if (existsSync(p)) return p;
      }
    }
  } catch {}
  return null;
};
const candidates = [
  process.env.CHROME_PATH,
  cacheChrome(),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter(Boolean);
const chromePath = candidates.find((p) => existsSync(p));

const url = process.argv[2] || "http://localhost:4322/credits/";
const browser = await puppeteer.launch({ executablePath: chromePath, headless: true });
const page = await browser.newPage();
// Replicate Lighthouse mobile emulation (its "simulate" throttling leaves the
// real load unthrottled; CLS comes from that real trace).
await page.setViewport({
  width: 412,
  height: 823,
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
});
await page.setUserAgent(
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
);
const shifts = [];
await page.evaluateOnNewDocument(() => {
  window.__shifts = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const sources = (e.sources || []).map((s) => {
          const n = s.node;
          if (!n) return null;
          const sel = [
            n.id ? "#" + n.id : null,
            n.className && typeof n.className === "string"
              ? "." + n.className.trim().split(/\s+/).join(".")
              : null,
            n.localName,
          ]
            .filter(Boolean)
            .join("");
          return { sel, from: [Math.round(s.previousRect.x), Math.round(s.previousRect.y)], to: [Math.round(s.currentRect.x), Math.round(s.currentRect.y)] };
        }).filter(Boolean);
        window.__shifts.push({ value: e.value, hadRecentInput: e.hadRecentInput, sources });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
});
await page.goto(url, { waitUntil: "domcontentloaded" });
// No scrolling — stay still, like Lighthouse's load window, and watch shifts
// for a long window so late font swaps under throttling are captured.
await new Promise((r) => setTimeout(r, 10000));
const result = await page.evaluate(() => window.__shifts);
const total = result.reduce((a, s) => a + (s.hadRecentInput ? 0 : s.value), 0);
console.log(`total CLS (no recent-input): ${total.toFixed(4)} — ${result.length} entries`);
const seen = new Map();
for (const s of result) {
  const key = JSON.stringify(s.sources);
  if (!seen.has(key)) seen.set(key, { count: 0, value: 0, sources: s.sources });
  seen.get(key).count++;
  seen.get(key).value += s.value;
}
for (const [key, g] of [...seen.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 12)) {
  console.log(`value=${g.value.toFixed(4)} count=${g.count} sources=${g.sources.map((x) => x.sel + "@" + x.from + "→" + x.to).join(" | ")}`);
}
await browser.close();
