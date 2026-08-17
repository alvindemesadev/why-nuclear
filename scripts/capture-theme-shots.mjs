// Capture dark + light hero screenshots for the README theme docs.
// Usage: node scripts/capture-theme-shots.mjs <base-url>
// Requires headless Chrome; set CHROME_PATH if needed.
import puppeteer from "puppeteer-core";
import { mkdirSync, existsSync } from "node:fs";

const CHROME =
  process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.argv[2] || "http://localhost:4322";
const OUT = "docs";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

mkdirSync(OUT, { recursive: true });

// Dark (default, no stored choice)
await page.goto(BASE + "/", { waitUntil: "networkidle0" });
await page.evaluate(() => {
  try {
    localStorage.removeItem("theme");
  } catch (e) {}
});
await page.reload({ waitUntil: "networkidle0" });
await page.evaluate(() => window.scrollTo(0, 0));
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: OUT + "/hero-dark.png" });
console.log("wrote docs/hero-dark.png");

// Light (toggle via the nav button — the same path a user takes)
await page.evaluate(() => {
  const t = document.getElementById("theme-toggle");
  if (document.documentElement.getAttribute("data-theme") !== "light") t.click();
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: OUT + "/hero-light.png" });
console.log("wrote docs/hero-light.png");

await browser.close();
