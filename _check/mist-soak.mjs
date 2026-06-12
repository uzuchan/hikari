// mist 自然発生の長回し観測(weather.js を route 注入で観測、ディスク無改変)
import { chromium } from '/Users/<redacted>/Desktop/dev/260611_hikari/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:1100,height:700} })).newPage();
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)));
await p.route('**/js/weather.js', async route => {
  const r = await route.fetch(); let body = await r.text();
  body = body.replace(/function setMode\(([^)]*)\)\s*\{/, 'function setMode($1){try{(window.__wx=window.__wx||[]).push({t:Date.now(),mode});}catch(e){}');
  await route.fulfill({ response: r, body, headers: { ...r.headers(), 'content-length': undefined } });
});
await p.goto('http://localhost:8013/demos/19-niwa/index.html',{waitUntil:'networkidle'});
await p.waitForTimeout(1500);
await p.click('.niwa-intro-enter');
const t0 = Date.now();
let log=[];
while (Date.now()-t0 < 620000) {
  await p.waitForTimeout(5000);
  log = await p.evaluate(()=>window.__wx||[]);
  if (log.some(e=>e.mode==='mist')) break;
}
if (log.some(e=>e.mode==='mist')) {
  await p.waitForTimeout(12000); // 霧が育つのを待って撮影
  await p.screenshot({ path:'/Users/<redacted>/Desktop/dev/260611_hikari/_check/n8-mist.png' });
}
console.log(JSON.stringify({ errors:errs, timeline:log.map(e=>({sec:Math.round((e.t-t0)/1000), mode:e.mode})), mistSeen:log.some(e=>e.mode==='mist') }));
await b.close();
