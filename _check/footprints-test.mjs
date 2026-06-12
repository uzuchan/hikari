// 足あと検証: 2回訪問して localStorage 記録と訪問者の出現を確認
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`));
const url = 'http://localhost:8013/demos/19-niwa/index.html';

// 1回目の訪問
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.click('text=庭へ入る');
await page.waitForTimeout(2000);
let visits = await page.evaluate(() => JSON.parse(localStorage.getItem('niwa-visits-v1') || '[]').length);
console.log('VISITS_AFTER_1ST:', visits);

// 2回目の訪問（リロード）— 再訪の気配が早めに現れるはず
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.click('text=庭へ入る');
await page.waitForTimeout(2000);
visits = await page.evaluate(() => JSON.parse(localStorage.getItem('niwa-visits-v1') || '[]').length);
console.log('VISITS_AFTER_2ND:', visits);

// 植物を植えてから訪問者(足あと)を待つ — 早出の訪問者を期待して70秒観察
await page.mouse.click(640, 480, { delay: 30 });
await page.waitForTimeout(70000);
await page.screenshot({ path: '_check/n5-footprints.png' });
await browser.close();
console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'NO_ERRORS');
