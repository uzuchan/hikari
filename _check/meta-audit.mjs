// メタ仕上げの検証: 全20ページ（ギャラリー + 19作品）を開き、
//  1) console error / pageerror が 0 であること（メタ追加でページが壊れていないこと）
//  2) DOM に description / favicon link / og:title / theme-color が存在すること
//  3) favicon.svg と og.png が（各ページの相対パス解決後の URL で）HTTP 200 で取れること
// を確認する。最後にギャラリーのスクリーンショットを1枚保存。
import { chromium } from 'playwright';

const BASE = 'http://localhost:8013';

const PAGES = [
  { url: '/index.html', og: 'hikari — インタラクティブ試作スタジオ' },
  { url: '/demos/01-planet.html', og: '01 惑星のすみか — hikari' },
  { url: '/demos/02-library.html', og: '02 宇宙図書館 — hikari' },
  { url: '/demos/03-breath.html', og: '03 息で咲く光の花野 — hikari' },
  { url: '/demos/04-spirit.html', og: '04 一筆書きの精霊 — hikari' },
  { url: '/demos/05-mirror.html', og: '05 群れと踊る鏡 — hikari' },
  { url: '/demos/06-rain.html', og: '06 言葉の雨 — hikari' },
  { url: '/demos/07-pond.html', og: '07 音紋の池 — hikari' },
  { url: '/demos/08-sand.html', og: '08 光の砂庭 — hikari' },
  { url: '/demos/09-constellation.html', og: '09 星座を紡ぐ夜 — hikari' },
  { url: '/demos/10-fireworks.html', og: '10 影に咲く花火 — hikari' },
  { url: '/demos/11-corridor.html', og: '11 光の回廊 — hikari' },
  { url: '/demos/12-nebula.html', og: '12 声の星雲 — hikari' },
  { url: '/demos/13-ito-koto.html', og: '13 光の糸琴 — hikari' },
  { url: '/demos/14-tomoshibi.html', og: '14 ふれると灯る街 — hikari' },
  { url: '/demos/15-wataridori.html', og: '15 渡り鳥の手紙 — hikari' },
  { url: '/demos/16-kurage.html', og: '16 クラゲの天蓋 — hikari' },
  { url: '/demos/17-mizukagami.html', og: '17 水鏡の文字 — hikari' },
  { url: '/demos/18-tourou.html', og: '18 灯籠流しの川 — hikari' },
  { url: '/demos/19-niwa/index.html', og: '19 光の庭 — hikari' },
  { url: '/demos/20-echo-cave.html', og: '20 こだまの洞窟 — hikari' },
  { url: '/demos/21-furiko.html', og: '21 振り子の夜 — hikari' },
  { url: '/demos/22-toudai.html', og: '22 霧の灯台 — hikari' },
  { url: '/demos/23-sukima.html', og: '23 夜のすきま — hikari' },
  { url: '/demos/24-shabon.html', og: '24 夜のしゃぼん — hikari' },
  { url: '/demos/25-michishio.html', og: '25 月のみちしお — hikari' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

let failures = 0, totalErrors = 0;

for (const { url, og } of PAGES) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e}`));

  await page.goto(`${BASE}${url}`, { waitUntil: 'load' });
  await page.waitForTimeout(1200); // 初期化と最初の描画ループを待つ

  const meta = await page.evaluate(() => ({
    description: document.querySelector('meta[name="description"]')?.content || null,
    themeColor: document.querySelector('meta[name="theme-color"]')?.content || null,
    ogTitle: document.querySelector('meta[property="og:title"]')?.content || null,
    ogDesc: document.querySelector('meta[property="og:description"]')?.content || null,
    ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || null,
    favicon: document.querySelector('link[rel="icon"]')?.getAttribute('href') || null,
  }));

  const problems = [];
  if (errors.length) problems.push(...errors);
  if (!meta.description) problems.push('missing meta description');
  if (meta.themeColor !== '#0a0a0f') problems.push(`theme-color = ${meta.themeColor}`);
  if (meta.ogTitle !== og) problems.push(`og:title = "${meta.ogTitle}" (expected "${og}")`);
  if (!meta.ogDesc) problems.push('missing og:description');
  if (!meta.favicon) problems.push('missing favicon link');
  if (!meta.ogImage) problems.push('missing og:image');

  // 相対パスをページ URL に対して解決し、実際に 200 で取れることを確認
  for (const [label, href] of [['favicon', meta.favicon], ['og:image', meta.ogImage]]) {
    if (!href) continue;
    const resolved = new URL(href, `${BASE}${url}`).href;
    const res = await page.request.get(resolved);
    if (res.status() !== 200) problems.push(`${label} -> ${resolved} returned ${res.status()}`);
  }

  totalErrors += errors.length;
  if (problems.length) { failures++; console.log(`NG  ${url}\n      ${problems.join('\n      ')}`); }
  else console.log(`OK  ${url}  (errors:0, meta:ok, assets:200)`);

  if (url === '/index.html') {
    await page.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/_check/meta-gallery.png' });
  }
  await page.close();
}

await browser.close();
console.log(`\n${PAGES.length} pages audited — ${failures} failed, total console/page errors: ${totalErrors}`);
process.exit(failures ? 1 : 0);
