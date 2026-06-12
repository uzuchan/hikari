// 一時診断: B6 のタップ座標が何に食われているかを実測する(390×844)
import { chromium } from 'playwright';

const URL = 'http://localhost:8013/demos/19-niwa/index.html';
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  permissions: ['microphone'],
});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
await page.tap('.niwa-intro-enter', { timeout: 5000 });
await page.waitForTimeout(2300);

// --- 1) 現テスト座標 + 候補座標の elementFromPoint 実測 ---
const points = [
  ['B6現行-1', 150, 620], ['B6現行-2', 255, 590], ['B6現行-3', 195, 690],
  ['候補-a', 195, 385], ['候補-b', 120, 450], ['候補-c', 310, 470],
  ['候補-d', 255, 590],
];
const probe = await page.evaluate((pts) => {
  const desc = (el) => {
    if (!el) return 'null';
    const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '');
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls.trim().replace(/\s+/g, '.') : ''}` +
      (el.textContent && el.textContent.length < 12 ? ` "${el.textContent.trim()}"` : '');
  };
  return pts.map(([name, x, y]) => {
    const el = document.elementFromPoint(x, y);
    return { name, x, y, hit: desc(el), inUiRoot: !!(el && el.closest && el.closest('#ui-root')) };
  });
}, points);
for (const p of probe) console.log(`HIT ${p.name} (${p.x},${p.y}) -> ${p.hit}  inUiRoot=${p.inUiRoot}`);

// --- 2) ボタン・パッド各部の正確な bbox ---
const geo = await page.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  return {
    miniBtns: [...document.querySelectorAll('.niwa-mini-btn')].map((b) => ({ t: b.textContent.trim(), ...r(b) })),
    count: r(document.querySelector('.niwa-count')),
    actions: r(document.querySelector('.niwa-actions')),
    pad: r(document.querySelector('.niwa-seedpad')),
    padCanvas: r(document.querySelector('.niwa-seedpad-canvas')),
    padRow: r(document.querySelector('.niwa-seedpad-row')),
    erase: r(document.querySelector('.niwa-erase')),
  };
});
console.log('GEO ' + JSON.stringify(geo, null, 1));

// --- 3) 候補座標で実際に植わるか(randomDna フォールバックで描かずに) ---
const countOf = async () => {
  const t = await page.textContent('.niwa-count').catch(() => '');
  const m = (t || '').match(/(\d+)/);
  return m ? +m[1] : -1;
};
const candidates = [[195, 385], [120, 450], [255, 590]];
console.log('count before =', await countOf());
for (const [x, y] of candidates) {
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(2000);
  console.log(`after tap(${x},${y}) count =`, await countOf());
}
console.log('ERRORS:', errors.length, errors.slice(0, 5));
await page.waitForTimeout(4500); // 開花を待ってから記念撮影
await page.screenshot({ path: '_check/niwa-actions-fix.png' });
console.log('SHOT _check/niwa-actions-fix.png');
await browser.close();
