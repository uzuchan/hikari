// 決定論的 A/B 視覚差分: node _check/corridor-ab.mjs [--frames 360] [--boostAt -1] [--keepAA] [--tag idle]
// 仮想クロック(1フレーム=1/60s固定)+乱数シードで新旧を「同一の世界状態」で凍結し、ピクセル差分を取る。
// 乱数列が版間でズレる塵・流線は両者で非表示(GLレベルでスキップ)。AAも両者そろえる(既定: OFF)。
import { chromium } from '/Users/<redacted>/Desktop/dev/260611_hikari/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? +args[i + 1] : def; };
const FRAMES = opt('frames', 360);
const BOOST_AT = opt('boostAt', -1);
const keepAA = args.includes('--keepAA');
const TAG = (() => { const i = args.indexOf('--tag'); return i >= 0 ? args[i + 1] : 'idle'; })();

const b = await chromium.launch();
async function shot(url) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(({ FRAMES, BOOST_AT, keepAA }) => {
    // 1) 乱数固定
    let seed = 42 >>> 0;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    // 2) 仮想クロック: rAF 1回 = 1/60 秒、FRAMES 到達で凍結
    let vt = 0; window.__frames = 0;
    const fire = (type) => {
      const tgt = document.getElementById('scene') || document.body;
      tgt.dispatchEvent(new PointerEvent(type, { clientX: 640, clientY: 400, bubbles: true }));
    };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(() => {
      if (window.__frames >= FRAMES) { window.__frozen = true; return; }
      window.__frames++; vt += 1000 / 60;
      if (window.__frames === BOOST_AT) fire('pointerdown');
      cb(vt);
    });
    performance.now = () => vt;
    // 3) AA を両者そろえる（既定: 強制OFF）
    if (!keepAA) {
      const gc = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, attrs) {
        if (type === 'webgl' || type === 'webgl2') attrs = Object.assign({}, attrs || {}, { antialias: false });
        return gc.call(this, type, attrs);
      };
    }
    // 4) 塵(ar240)と流線(ar220)は乱数列が版間でズレるため両者で非表示
    const P2 = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
    for (const proto of [WebGLRenderingContext.prototype, P2]) {
      if (!proto) continue;
      const da = proto.drawArrays;
      proto.drawArrays = function (m, f, n) { if (n === 240 || n === 220) return; return da.apply(this, arguments); };
    }
  }, { FRAMES, BOOST_AT, keepAA });
  await p.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  // rAF は凍結で止まるためタイマーポーリングで待つ
  await p.waitForFunction('window.__frozen === true', null, { timeout: 90000, polling: 200 });
  await p.waitForTimeout(300);
  const buf = await p.screenshot();
  await ctx.close();
  return { buf, errs };
}
const A = await shot('http://localhost:8013/_check/corridor-orig.html');
const B = await shot('http://localhost:8013/demos/11-corridor.html');

const p2 = await (await b.newContext()).newPage();
const stats = await p2.evaluate(async ([a64, b64]) => {
  const load = d => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d; });
  const ia = await load(a64), ib = await load(b64);
  const W = ia.width, H = ia.height;
  const px = im => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, W, H).data; };
  const da = px(ia), db = px(ib);
  const diff = new Uint8ClampedArray(W * H * 4);
  let sum = 0, c2 = 0, c8 = 0, c24 = 0, mx = 0; const n = W * H;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const d = Math.max(Math.abs(da[o] - db[o]), Math.abs(da[o + 1] - db[o + 1]), Math.abs(da[o + 2] - db[o + 2]));
    sum += d; if (d > 2) c2++; if (d > 8) c8++; if (d > 24) c24++; if (d > mx) mx = d;
    diff[o] = Math.min(255, d * 8); diff[o + 1] = diff[o]; diff[o + 2] = diff[o]; diff[o + 3] = 255;
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').putImageData(new ImageData(diff, W, H), 0, 0);
  return {
    meanAbs: +(sum / n).toFixed(3), pctGt2: +(100 * c2 / n).toFixed(2),
    pctGt8: +(100 * c8 / n).toFixed(2), pctGt24: +(100 * c24 / n).toFixed(3), max: mx,
    diffPng: c.toDataURL('image/png').split(',')[1],
  };
}, [A.buf.toString('base64'), B.buf.toString('base64')]);

writeFileSync(`_check/corridor-ab-${TAG}-orig.png`, A.buf);
writeFileSync(`_check/corridor-ab-${TAG}-new.png`, B.buf);
writeFileSync(`_check/corridor-ab-${TAG}-diff.png`, Buffer.from(stats.diffPng, 'base64'));
delete stats.diffPng;
console.log(JSON.stringify({ tag: TAG, frames: FRAMES, boostAt: BOOST_AT, keepAA, errsA: A.errs, errsB: B.errs, ...stats }));
await b.close();
