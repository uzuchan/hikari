// 実ブラウザ検証: コンソールエラー収集 + スクリーンショット
// 使い方: node _check/shot.mjs <url-path> <out.png> [waitMs] [clickSelector]
// 例:     node _check/shot.mjs demos/19-niwa/index.html _check/niwa.png 4000 ".niwa-enter"
import { chromium } from 'playwright';

const [path = 'index.html', out = '_check/shot.png', waitMs = '3500', clickSel = ''] = process.argv.slice(2);
const url = `http://localhost:8013/${path}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(Number(waitMs));

if (clickSel) {
  try {
    await page.click(clickSel, { timeout: 3000 });
    await page.waitForTimeout(2500);
  } catch { errors.push(`CLICK_FAIL: ${clickSel}`); }
}

await page.screenshot({ path: out });
await browser.close();

if (errors.length) {
  console.log('CONSOLE_ERRORS:');
  for (const e of errors) console.log(' -', e.slice(0, 300));
  process.exit(1);
}
console.log('NO_ERRORS', out);
