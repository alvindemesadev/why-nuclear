// Scan RAW source for text glued across tag boundaries: a word char directly
// before </tag> followed directly (no space) by a word char after the tag,
// e.g. "...roughly</strong>US$2.3..." would NOT match but
// "...roughly<strong>US" ... hmm — we want cases like "word</a>word".
import { readFileSync } from "node:fs";

const files = [
  "src/pages/index.astro",
  "src/pages/credits.astro",
  "src/pages/nuclear-in-philippines.astro",
];

// Find: [wordchar]</tag>[wordchar]  OR  [wordchar]<tag>[wordchar]
// where there is NO whitespace between the text and the tags.
const pat = /([A-Za-z0-9$%.,])(<\/?(?:strong|a|em|span|p|li|h[1-6]|code)[^>]*>)([A-Za-z0-9$%])/g;

for (const f of files) {
  const src = readFileSync(f, "utf8");
  const lines = src.split("\n");
  const hits = [];
  lines.forEach((line, i) => {
    for (const m of line.matchAll(pat)) {
      // ignore obvious code: attribute-ish lines
      if (/"|'|class=|href=|Icon|<svg|<path/.test(m[0])) continue;
      hits.push(`  L${i + 1}: …${m[0].slice(0, 60)}…`);
    }
  });
  console.log(`\n=== ${f} ===`);
  console.log(hits.length ? hits.join("\n") : "clean — no cross-tag glue");
}
