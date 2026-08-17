const puppeteer = require("puppeteer-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const log = [];
  page.on("pageerror", (e) => log.push("PAGEERROR: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") log.push("CONSOLE: " + m.text()); });

  await page.goto("http://localhost:4322/credits/", { waitUntil: "load" });
  await sleep(1200);

  const s = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".credit-card")];
    return {
      cards: cards.length,
      titles: cards.map((c) => c.querySelector("h2")?.textContent.trim()),
      thumbs: cards.filter((c) => c.querySelector(".credit-thumb")).length,
      brokenImgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
      licenseBadges: document.querySelectorAll(".credit-license").length,
      fileLinks: document.querySelectorAll(".credit-file").length,
      fullDoc: !!document.querySelector(".credit-full"),
      mdAnchors: document.querySelectorAll(".credit-md a").length,
      mdTables: document.querySelectorAll(".credit-md table").length,
      h1: document.querySelector("h1")?.textContent.trim(),
      backLink: !!document.querySelector(".credit-back"),
      footer: !!document.querySelector(".site-footer"),
      footerArgLinks: document.querySelectorAll('.footer-col[aria-label="The argument"] a').length,
      navLinks: document.querySelectorAll(".nav-links a").length,
      navMyths: [...document.querySelectorAll(".nav-links a")].some((a) => a.getAttribute("href") === "/#myths"),
    };
  });

  // scroll to the bottom to trigger lazy images + check full doc loads
  await page.evaluate(() => document.querySelector(".credit-full").scrollIntoView({ behavior: "instant" }));
  await sleep(800);
  s.fullDocOpen = await page.evaluate(() => {
    const d = document.querySelector(".credit-full");
    d.setAttribute("open", "");
    return d.querySelectorAll("h2, h3").length > 0;
  });

  // verify each card's license badge and file link resolve (href non-empty, http)
  s.badgeHrefs = await page.evaluate(() =>
    [...document.querySelectorAll(".credit-license")].map((a) => a.getAttribute("href"))
  );

  console.log(JSON.stringify(s, null, 1));
  console.log("errors:", log.length ? log.join("\n") : "none");
  await browser.close();
})();
