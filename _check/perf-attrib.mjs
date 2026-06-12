// フレームコスト帰属分析: node _check/perf-attrib.mjs [--noaa]
// GL の draw 呼び出しをシグネチャ(インデックス数×インスタンス数)で識別し、
// レイヤ別にスキップして FPS 差分を測る。--noaa は antialias:false を強制し MSAA コストを測る。
import { chromium } from '/Users/<redacted>/Desktop/dev/260611_hikari/node_modules/playwright/index.mjs';
const noaa = process.argv.includes('--noaa');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
await p.addInitScript(forceNoAA => {
  if (forceNoAA) {
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (type === 'webgl' || type === 'webgl2') attrs = Object.assign({}, attrs || {}, { antialias: false });
      return gc.call(this, type, attrs);
    };
  }
  window.__skip = {};
  const P2 = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  const P1 = WebGLRenderingContext.prototype;
  for (const proto of [P1, P2]) {
    if (!proto) continue;
    if (proto.drawElementsInstanced) {
      const dei = proto.drawElementsInstanced;
      proto.drawElementsInstanced = function (m, n, t, o, ic) {
        if (window.__skip['ei' + n + '_' + ic]) return;
        return dei.apply(this, arguments);
      };
    }
    const de = proto.drawElements;
    proto.drawElements = function (m, n) { if (window.__skip['el' + n]) return; return de.apply(this, arguments); };
    const da = proto.drawArrays;
    proto.drawArrays = function (m, f, n) { if (window.__skip['ar' + n]) return; return da.apply(this, arguments); };
  }
}, noaa);
await p.goto('http://localhost:8013/demos/11-corridor.html', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(3000);

const fps = () => p.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(+(n / 3).toFixed(1)); };
  requestAnimationFrame(tick);
}));

// シグネチャ → レイヤ名（ジオメトリから計算: tris×3 / instances）
const LAYERS = {
  halo: 'ei1296_26',     // Torus(0.85, 6,36,π) 432tri ×26
  glow: 'ei2304_26',     // Torus(0.30, 8,48,π) 768tri ×26
  core: 'ei3072_26',     // Torus(0.085,8,64,π) 1024tri ×26
  feet: 'ei240_52',      // Sphere(8,6) 80tri ×52
  footGlow: 'ei6_52',    // Plane 2tri ×52
  floor: 'el6',          // PlaneGeometry
  rails: 'el36',         // BoxGeometry ×2
  stars: 'ar900',
  dust: 'ar240',
  streaks: 'ar220',
};
const base = await fps();
const rows = [{ off: '(none)', fps: base }];
for (const [name, sig] of Object.entries(LAYERS)) {
  await p.evaluate(s => { window.__skip[s] = true; }, sig);
  const f = await fps();
  rows.push({ off: name, fps: f, gainMs: +((1000 / base) - (1000 / f)).toFixed(2) });
  await p.evaluate(s => { window.__skip[s] = false; }, sig);
}
await p.evaluate(sigs => { for (const s of sigs) window.__skip[s] = true; },
  [LAYERS.halo, LAYERS.glow, LAYERS.core, LAYERS.feet, LAYERS.footGlow]);
rows.push({ off: 'ALL-arch-layers', fps: await fps() });
console.log(JSON.stringify({ noaa, rows }, null, 1));
await b.close();
