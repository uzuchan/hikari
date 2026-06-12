import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://localhost:8013/demos/19-niwa/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.click('text=庭へ入る');
await page.waitForTimeout(2500);
const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
await page.click('text=写真にのこす');
const download = await dl;
console.log('DOWNLOAD:', download ? download.suggestedFilename() : 'NONE');
await page.waitForTimeout(45000);  // 天候遷移・流れ星を待つ
await page.screenshot({ path: '_check/n4-weather.png' });
await browser.close();
console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'NO_ERRORS');
