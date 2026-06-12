// 全デモ ジェスチャー網羅検査: 操作ごとに console error / pageerror を差分収集
// 使い方: node _check/gesture-all.mjs
import { chromium } from 'playwright';
import { mkdirSync, readdirSync } from 'fs';

// demos/*.html を自動列挙(新作を足し忘れない)。19-niwa はディレクトリ構成のため対象外(専用スイートが担当)
const DEMOS = readdirSync('demos').filter(f => f.endsWith('.html')).map(f => f.replace('.html', '')).sort();

mkdirSync('_check/gesture', { recursive: true });

const browser = await chromium.launch();
const results = [];

async function inspect(nn, url, extra) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`));

  const opErrors = [];      // { op, errs: [...] }
  let mark = 0;
  const snap = (op) => {
    const fresh = errors.slice(mark);
    mark = errors.length;
    if (fresh.length) opErrors.push({ op, errs: [...new Set(fresh)] });
  };

  let navFail = null;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(3000);
    snap('load');

    if (extra === 'niwa-intro') {
      await page.click('text=庭へ入る');
      await page.waitForTimeout(3000);
      snap('intro通過');
    }

    const cx = 640, cy = 400, D = 220;

    // 1. 速いスワイプ 4方向
    const dirs = [['上', 0, -D], ['下', 0, D], ['左', -D, 0], ['右', D, 0]];
    for (const [name, dx, dy] of dirs) {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + dx, cy + dy, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(250);
      snap(`スワイプ${name}`);
    }

    // 2. 長押し 1.8秒
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(1800);
    await page.mouse.up();
    await page.waitForTimeout(300);
    snap('長押し');

    // 3. 連打 10回
    for (let i = 0; i < 10; i++) {
      await page.mouse.click(cx + (i % 3) * 8, cy + (i % 2) * 8, { delay: 10 });
    }
    await page.waitForTimeout(400);
    snap('連打10回');

    // 4. 端クリック 四隅
    for (const [x, y] of [[10, 10], [1270, 10], [10, 790], [1270, 790]]) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(300);
    snap('端クリック');

    // 5. タッチ tap 中央+端
    await page.touchscreen.tap(cx, cy);
    await page.waitForTimeout(200);
    await page.touchscreen.tap(15, 15);
    await page.touchscreen.tap(1265, 785);
    await page.waitForTimeout(300);
    snap('タッチtap');

    // 6. 複数指ピンチ (CDP)
    let pinchSkipped = false;
    try {
      const client = await context.newCDPSession(page);
      const tp = (x, y, id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 });
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [tp(cx - 60, cy, 0), tp(cx + 60, cy, 1)],
      });
      for (let i = 1; i <= 5; i++) {
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [tp(cx - 60 - i * 25, cy, 0), tp(cx + 60 + i * 25, cy, 1)],
        });
        await page.waitForTimeout(40);
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await client.detach().catch(() => {});
    } catch (e) {
      pinchSkipped = true;
      // 環境起因の失敗は記録のみ（ページのエラーではない）
    }
    await page.waitForTimeout(400);
    snap('ピンチ(2指)');

    // 7. リサイズ 800x600 → 1280x800
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(1000);
    snap('リサイズ800x600');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(1000);
    snap('リサイズ1280x800');

    // 19-niwa: 描きパッド上のドラッグ
    if (extra === 'niwa-intro') {
      const pad = await page.$('.niwa-seedpad-canvas');
      if (pad) {
        const b = await pad.boundingBox();
        await page.mouse.move(b.x + 20, b.y + b.height / 2);
        await page.mouse.down();
        for (let i = 0; i < 12; i++) {
          await page.mouse.move(
            b.x + 20 + i * (b.width - 40) / 12,
            b.y + b.height / 2 + Math.sin(i * 0.9) * (b.height / 3),
            { steps: 2 }
          );
        }
        await page.mouse.up();
        await page.waitForTimeout(600);
        snap('描きパッドドラッグ');
        // 速い往復ドラッグ
        await page.mouse.move(b.x + 10, b.y + 10);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width - 10, b.y + b.height - 10, { steps: 3 });
        await page.mouse.move(b.x + 10, b.y + b.height - 10, { steps: 3 });
        await page.mouse.up();
        await page.waitForTimeout(400);
        snap('描きパッド速ドラッグ');
      } else {
        opErrors.push({ op: '描きパッド', errs: ['NO_SEEDPAD (.niwa-seedpad-canvas not found)'] });
      }
    }

    // 8. 最終待機 + 撮影
    await page.waitForTimeout(2000);
    snap('最終待機');
    await page.screenshot({ path: `_check/gesture/${nn}.png` });

    results.push({ nn, opErrors, pinchSkipped });
  } catch (e) {
    navFail = e.message;
    snap('(中断時点)');
    results.push({ nn, opErrors, fatal: navFail });
  } finally {
    await context.close();
  }
}

for (const slug of DEMOS) {
  await inspect(slug.slice(0, 2), `http://localhost:8013/demos/${slug}.html`);
  console.log('done', slug);
}
await inspect('19', 'http://localhost:8013/demos/19-niwa/index.html', 'niwa-intro');
console.log('done 19-niwa');

await browser.close();

console.log('===== GESTURE RESULTS =====');
for (const r of results) {
  if (r.fatal) console.log(`${r.nn}: FATAL ${r.fatal}`);
  if (!r.opErrors.length) {
    console.log(`${r.nn}: NO_ERRORS${r.pinchSkipped ? ' (pinch skipped)' : ''}`);
  } else {
    console.log(`${r.nn}: ERRORS${r.pinchSkipped ? ' (pinch skipped)' : ''}`);
    for (const oe of r.opErrors) {
      for (const e of oe.errs.slice(0, 4)) console.log(`   [${oe.op}] ${e.slice(0, 300)}`);
    }
  }
}
