// 全デモ巡回スモークテスト: console error 収集 + ドラッグ/クリック + スクリーンショット
// 使い方: node _check/smoke-all.mjs
import { chromium } from 'playwright';
import { mkdirSync, readdirSync } from 'fs';

// demos/*.html を自動列挙(新作を足し忘れない)。19-niwa はディレクトリ構成のため対象外(専用スイートが担当)
const DEMOS = readdirSync('demos').filter(f => f.endsWith('.html')).map(f => f.replace('.html', '')).sort();

mkdirSync('_check/smoke', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const results = [];

for (const slug of DEMOS) {
  const nn = slug.slice(0, 2);
  const localErrors = [];
  const onConsole = m => { if (m.type() === 'error') localErrors.push(m.text()); };
  const onPageError = e => localErrors.push(`PAGEERROR: ${e.message}`);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    await page.goto(`http://localhost:8013/demos/${slug}.html`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(5000);

    // 画面中央で軽くドラッグ
    const cx = 640, cy = 400;
    await page.mouse.move(cx - 120, cy - 60);
    await page.mouse.down();
    await page.mouse.move(cx, cy, { steps: 8 });
    await page.mouse.move(cx + 120, cy + 60, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    // クリック
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(1200);

    await page.screenshot({ path: `_check/smoke/${nn}.png` });
    results.push({ nn, slug, errors: [...localErrors] });
  } catch (e) {
    results.push({ nn, slug, errors: [...localErrors, `NAV_FAIL: ${e.message}`] });
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }
}

await browser.close();

console.log('===== SMOKE RESULTS =====');
for (const r of results) {
  if (r.errors.length) {
    console.log(`${r.nn} ${r.slug}: ERRORS(${r.errors.length})`);
    for (const e of [...new Set(r.errors)].slice(0, 5)) console.log('   -', e.slice(0, 250));
  } else {
    console.log(`${r.nn} ${r.slug}: OK`);
  }
}
