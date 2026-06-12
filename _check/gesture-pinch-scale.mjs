// ピンチ後の visualViewport.scale を全デモで計測（ピンチズーム許容の特定）
import { chromium } from 'playwright';

const DEMOS = [
  '01-planet', '02-library', '03-breath', '04-spirit', '05-mirror', '06-rain',
  '07-pond', '08-sand', '09-constellation', '10-fireworks', '11-corridor', '12-nebula',
  '13-ito-koto', '14-tomoshibi', '15-wataridori', '16-kurage', '17-mizukagami', '18-tourou',
  '19-niwa/index',
];

const browser = await chromium.launch();
for (const slug of DEMOS) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`http://localhost:8013/demos/${slug}.html`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);
  if (slug.startsWith('19')) { await page.click('text=庭へ入る'); await page.waitForTimeout(2000); }
  const client = await context.newCDPSession(page);
  const tp = (x, y, id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(580, 400, 0), tp(700, 400, 1)] });
  for (let i = 1; i <= 5; i++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(580 - i * 25, 400, 0), tp(700 + i * 25, 400, 1)] });
    await page.waitForTimeout(40);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(800);
  const scale = await page.evaluate(() => window.visualViewport ? window.visualViewport.scale : 'n/a');
  console.log(slug.slice(0, 2), 'scale=', scale);
  await context.close();
}
await browser.close();
