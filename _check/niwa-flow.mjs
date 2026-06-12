// 光の庭の通し検証: intro → 庭へ入る → 種を描く → 植える → 撮影
import { chromium } from 'playwright';

const url = 'http://localhost:8013/demos/19-niwa/index.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: '_check/n1-intro.png' });

await page.click('text=庭へ入る');
await page.waitForTimeout(3500);
await page.screenshot({ path: '_check/n2-garden.png' });

// 描きパッドに線を描く（dna生成）
const pad = await page.$('.niwa-seedpad-canvas');
if (pad) {
  const b = await pad.boundingBox();
  await page.mouse.move(b.x + 30, b.y + 120);
  await page.mouse.down();
  for (let i = 0; i < 14; i++) {
    await page.mouse.move(
      b.x + 30 + i * 9,
      b.y + 120 + Math.sin(i * 0.9) * 45,
      { steps: 2 }
    );
  }
  await page.mouse.up();
} else {
  errors.push('NO_SEEDPAD');
}

// 丘を3か所タップして植える
for (const [x, y] of [[640, 480], [520, 560], [780, 520]]) {
  await page.mouse.click(x, y, { delay: 30 });
  await page.waitForTimeout(1500);
}
await page.waitForTimeout(6000);   // 成長・開花を待つ
await page.screenshot({ path: '_check/n3-planted.png' });

// 植物カウンタの確認
const counter = await page.textContent('body').catch(() => '');
const m = counter.match(/灯る草花\s*—\s*(\d+)/);
console.log('PLANT_COUNT:', m ? m[1] : 'NOT_FOUND');

await browser.close();
if (errors.length) {
  console.log('CONSOLE_ERRORS:');
  for (const e of errors) console.log(' -', e.slice(0, 300));
  process.exit(1);
}
console.log('NO_ERRORS n1/n2/n3 saved');
