#!/usr/bin/env node
/**
 * Contrast audit — the measured WCAG table as a CI gate.
 *
 * Boots the real API against the synthetic fixtures in contrast-fixtures/
 * (the live artifacts live in a private repo), loads every page in both
 * themes, and measures the luminance ratio of EVERY text element against its
 * effective background (parent-chain composite for HTML, containing rect fill
 * for SVG — SVG text is the classic blind spot). Fails the build when any
 * text pair drops below 4.5:1.
 *
 * Run: node web/scripts/contrast-audit.mjs   (needs playwright installed)
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const fixtures = join(here, "contrast-fixtures");
const PORT = 8899;

const PAGES = [
  "/",
  "/concepts",
  "/business",
  "/architecture",
  "/lineage",
  "/product/home-environment",
  "/table/lake_gold.home_environment",
  "/workbench",
];

const AUDIT = `(() => {
  function lum(rgb) {
    const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ratio(fg, bg) {
    const a = lum(fg) + 0.05, b = lum(bg) + 0.05;
    return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100;
  }
  function parse(s) { const m = (s || '').match(/[\\\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; }
  function alpha(s) { const m = (s || '').match(/rgba?\\\(([^)]+)\\\)/); if (!m) return 1; const p = m[1].split(','); return p.length > 3 ? parseFloat(p[3]) : 1; }
  function over(fg, a, bg) { return fg.map((v, i) => v * a + bg[i] * (1 - a)); }
  function htmlBg(el) {
    let n = el;
    while (n && n.tagName !== 'HTML') {
      const cs = getComputedStyle(n);
      const a = (cs.backgroundColor.match(/rgba?\\\(([^)]+)\\\)/) || ['', ''])[1].split(',');
      if (a.length < 4 || parseFloat(a[3]) > 0) return parse(cs.backgroundColor);
      n = n.parentElement;
    }
    return parse(getComputedStyle(document.body).backgroundColor);
  }
  const pageBg = parse(getComputedStyle(document.body).backgroundColor);
  const out = [];
  const seen = new Set();
  for (const t of document.querySelectorAll('body *')) {
    if (!t.childNodes.length) continue;
    const text = Array.from(t.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    if (!text) continue;
    const cs = getComputedStyle(t);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
    const size = parseFloat(cs.fontSize);
    const isSvg = typeof t.getBBox === "function";
    let bg = htmlBg(t);
    if (isSvg) {
      // SVG text: the background is the containing rect fill (composited).
      const bb = t.getBBox();
      const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
      for (const r of document.querySelectorAll('rect')) {
        const x = +r.getAttribute('x') || 0, y = +r.getAttribute('y') || 0;
        const w = +r.getAttribute('width') || 0, h = +r.getAttribute('height') || 0;
        if (w < 12 || h < 12 || cx < x || cx > x + w || cy < y || cy > y + h) continue;
        const rc = getComputedStyle(r);
        if (rc.fill === 'none') continue;
        bg = over(parse(rc.fill), alpha(rc.fill) * parseFloat(rc.fillOpacity || 1), bg);
      }
    }
    const fg = over(parse(cs.color || cs.fill), alpha(cs.color || cs.fill), bg);
    const r = ratio(fg, bg);
    const key = cs.color + '|' + size + '|' + bg.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: text.slice(0, 30), size, ratio: r, cls: t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className });
  }
  return out;
})()`;

function startServer() {
  const proc = spawn(process.execPath, [join(repo, "api", "dist", "server.js")], {
    env: {
      ...process.env,
      PORT: String(PORT),
      LAKEHOUSE_ARTIFACTS_DIR: fixtures,
      LAKEHOUSE_META_DB: join(here, "contrast-meta.db"),
    },
    stdio: "ignore",
  });
  return proc;
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("API did not become healthy");
}

const server = startServer();
let failed = false;
try {
  await waitForServer();
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const rows = [];
  for (const path of PAGES) {
    await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await page.waitForTimeout(80);
      const results = await page.evaluate(AUDIT);
      for (const r of results) {
        const verdict = r.ratio >= 4.5 ? "PASS" : "FAIL";
        if (verdict === "FAIL") failed = true;
        rows.push(`${verdict} ${theme} ${path} "${r.text}" ${r.size}px ${r.ratio}:1 [${String(r.cls).slice(0, 24)}]`);
      }
    }
  }
  await browser.close();
  console.log(rows.join("\n"));
  console.log(`\n${rows.length} unique text/background pairs measured.`);
  if (failed) {
    console.error("contrast audit FAILED: pairs below 4.5:1");
    process.exitCode = 1;
  } else {
    console.log("contrast audit passed: every text pair >= 4.5:1 in both themes");
  }
} finally {
  server.kill();
}
