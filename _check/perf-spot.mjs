// スポット性能計測: node _check/perf-spot.mjs [demoFile] [holdMs]
// 4秒待機 → 5秒間の FPS / フレームあたり GL ドローコール / JSヒープ。holdMs>0 なら長押し(加速)状態で計測。
import { chromium } from '/Users/<redacted>/Desktop/dev/260611_hikari/node_modules/playwright/index.mjs';
const f = process.argv[2] || '11-corridor.html';
const holdMs = +(process.argv[3] || 0);
const b = await chromium.launch({ args: ['--enable-precise-memory-info'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push(String(e)));
// GL ドローコール計数（WebGL1/2 両対応）
await p.addInitScript(() => {
  window.__draws = 0;
  const wrap = (proto) => {
    for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      if (!proto || !proto[fn]) continue;
      const orig = proto[fn];
      proto[fn] = function (...a) { window.__draws++; return orig.apply(this, a); };
    }
  };
  wrap(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
  wrap(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
});
await p.goto(`http://localhost:8013/demos/${f}`, { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(4000);
if (holdMs > 0) { await p.mouse.move(640, 400); await p.mouse.down(); await p.waitForTimeout(600); }
const r = await p.evaluate(() => new Promise(res => {
  let n = 0; const d0 = window.__draws; const t0 = performance.now();
  const tick = () => {
    n++;
    if (performance.now() - t0 < 5000) requestAnimationFrame(tick);
    else res({
      fps: +(n / 5).toFixed(1),
      drawsPerFrame: Math.round((window.__draws - d0) / n),
      heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
    });
  };
  requestAnimationFrame(tick);
}));
if (holdMs > 0) await p.mouse.up();
console.log(JSON.stringify({ demo: f, hold: holdMs > 0, ...r, errors: errs.length ? errs.slice(0, 5) : 0 }));
await b.close();
