// 全デモ長時間放置のメモリ・FPS点検(チャンク式): node perf-soak.mjs <start> <count>
// 各デモ150秒、FPS(10s/140s時点の5秒平均)とJSヒープを比較。結果は1行JSONで逐次出力。
import { chromium } from '/Users/<redacted>/Desktop/dev/260611_hikari/node_modules/playwright/index.mjs';
import { readdirSync } from 'node:fs';
let demos = readdirSync('/Users/<redacted>/Desktop/dev/260611_hikari/demos').filter(f=>f.endsWith('.html')).sort();
demos.push('19-niwa/index.html');
const start = +(process.argv[2]||0), count = +(process.argv[3]||demos.length);
demos = demos.slice(start, start+count);
const b = await chromium.launch({ args:['--enable-precise-memory-info'] });
for (const f of demos) {
  const ctx = await b.newContext({ viewport:{width:1280,height:800} });
  const p = await ctx.newPage();
  const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)));
  let rec;
  try {
    await p.goto(`http://localhost:8013/demos/${f}`,{waitUntil:'networkidle',timeout:30000});
    if (f.includes('19-niwa')) { try { await p.click('.niwa-intro-enter',{timeout:5000}); } catch(e){} }
    const sample = () => p.evaluate(() => new Promise(res => {
      let n=0; const t0=performance.now();
      const tick=()=>{ n++; if(performance.now()-t0<5000) requestAnimationFrame(tick); else res({fps:+(n/5).toFixed(1), heapMB:+(performance.memory.usedJSHeapSize/1048576).toFixed(1)}); };
      requestAnimationFrame(tick);
    }));
    await p.waitForTimeout(10000);
    const a = await sample();
    await p.waitForTimeout(120000);
    const z = await sample();
    rec = { demo:f, errors:errs.length, fps0:a.fps, fps1:z.fps, heap0:a.heapMB, heap1:z.heapMB,
      flagFPS: z.fps < a.fps*0.75, flagHeap: (z.heapMB-a.heapMB) > 25 };
  } catch(e) { rec = { demo:f, fatal:String(e).slice(0,120) }; }
  console.log(JSON.stringify(rec));
  await ctx.close();
}
await b.close();
