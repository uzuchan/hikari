// 補足検分: スクロールコンテナの特定 + スクロール後のビューポートショット
// 使い方: node _check/mobile-gallery-scroll.mjs
import { chromium } from 'playwright';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
  isMobile: true, hasTouch: true, userAgent: IPHONE_UA,
});
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));

try { await page.goto('http://localhost:8013/index.html', { waitUntil: 'networkidle', timeout: 20000 }); } catch {}
await page.waitForTimeout(2000);

// どの要素がスクロールするか
const scrollInfo = await page.evaluate(() => {
  const de = document.documentElement, b = document.body;
  const before = { winScrollY: scrollY, deTop: de.scrollTop, bodyTop: b.scrollTop };
  window.scrollTo(0, 600);
  b.scrollTop = 0; // まず window スクロールだけ試す
  const afterWin = { winScrollY: scrollY, deTop: de.scrollTop, bodyTop: b.scrollTop };
  b.scrollTop = 600;
  const afterBody = { winScrollY: scrollY, deTop: de.scrollTop, bodyTop: b.scrollTop };
  const cs = getComputedStyle(b);
  return {
    before, afterWin, afterBody,
    deScrollHeight: de.scrollHeight, bodyScrollHeight: b.scrollHeight,
    deClientHeight: de.clientHeight, bodyClientHeight: b.clientHeight,
    bodyComputed: { height: cs.height, minHeight: cs.minHeight, overflowY: cs.overflowY },
    htmlComputed: { height: getComputedStyle(de).height, overflowY: getComputedStyle(de).overflowY },
  };
});
console.log('SCROLL_INFO', JSON.stringify(scrollInfo, null, 2));

// ホイール/タッチ相当のスクロールが実際に効くか(mouse.wheel)
await page.evaluate(() => { document.body.scrollTop = 0; window.scrollTo(0, 0); });
await page.mouse.wheel(0, 1200);
await page.waitForTimeout(600);
const afterWheel = await page.evaluate(() => ({ winScrollY: scrollY, bodyTop: document.body.scrollTop, deTop: document.documentElement.scrollTop }));
console.log('AFTER_WHEEL', JSON.stringify(afterWheel));

// セクション毎のビューポートショット(group 弐 / 参 / 肆 / footer)
const stops = [
  { y: 1770, name: '_check/mob-ip-scroll-g2.png' },
  { y: 2925, name: '_check/mob-ip-scroll-g3.png' },
  { y: 4555, name: '_check/mob-ip-scroll-g4.png' },
  { y: 99999, name: '_check/mob-ip-scroll-footer.png' },
];
for (const s of stops) {
  await page.evaluate(y => {
    // body / documentElement どちらがスクローラでも効くように両方
    window.scrollTo(0, y);
    document.body.scrollTop = y;
    document.documentElement.scrollTop = y;
  }, s.y);
  await page.waitForTimeout(700);
  await page.screenshot({ path: s.name });
}

console.log('ERRORS', JSON.stringify(errors));
await browser.close();
