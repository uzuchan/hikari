// 見た目検証用スクリーンショット: node _check/corridor-shot.mjs <out.png> [holdMs]
// 読み込み後 6 秒待って撮影。holdMs>0 ならその時間長押し(加速)してから撮影。
import { chromium } from '/Users/<redacted>/Desktop/dev/260611_hikari/node_modules/playwright/index.mjs';
const out = process.argv[2] || '_check/corridor-shot.png';
const holdMs = +(process.argv[3] || 0);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:8013/demos/11-corridor.html', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(6000);
if (holdMs > 0) {
  await p.mouse.move(640, 400);
  await p.mouse.down();
  await p.waitForTimeout(holdMs);
  await p.screenshot({ path: out });
  await p.mouse.up();
} else {
  await p.screenshot({ path: out });
}
console.log(JSON.stringify({ out, hold: holdMs, errors: errs.length ? errs : 0 }));
await b.close();
