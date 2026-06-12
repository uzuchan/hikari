// 22 霧の灯台 — ドラッグで光が回る・舟が帰港する・エラー0
import { chromium } from 'playwright';
let failed = 0;
const ok = (n, p, note='') => { if(!p) failed++; console.log(`${p?'PASS':'FAIL'}  ${n}${note?'  -- '+note:''}`); };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport:{width:1280,height:800} })).newPage();
const errs = [];
page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8013/demos/22-toudai.html', { waitUntil:'networkidle' });
await page.waitForTimeout(3000);

const beam = () => page.evaluate(() => +document.getElementById('scene').dataset.beam || 0);
const home = () => page.evaluate(() => +document.getElementById('scene').dataset.home || 0);

const b0 = await beam();
await page.mouse.move(640, 420);
await page.mouse.down();
await page.mouse.move(940, 420, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(700);
const b1 = await beam();
ok('ドラッグで光がまわる(beam方位が増加)', b1 > b0 + 0.8, `b0=${b0} b1=${b1}`);

// 自走+時々のスイープで帰港を待つ(最長110秒)
let h = 0;
for (let i = 0; i < 22; i++) {
  await page.waitForTimeout(5000);
  h = await home();
  if (h >= 1) break;
}
ok('舟が港にともる(home>=1)', h >= 1, `home=${h}`);

await page.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/_check/toudai.png' });
const hud = await page.evaluate(() => ({
  back: !!document.querySelector('.hud-back'),
  no: (document.querySelector('.hud-no')||{}).textContent,
  counter: document.getElementById('homes').textContent,
}));
ok('HUD+帰港カウンタ', hud.back && /22/.test(hud.no) && /ともった舟/.test(hud.counter), JSON.stringify(hud));
ok('console/pageerror 0件', errs.length === 0, errs.join('|').slice(0,150));

// モバイル縦
const mp = await (await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:3 })).newPage();
const merrs = [];
mp.on('console', m => { if (m.type()==='error') merrs.push(m.text()); });
mp.on('pageerror', e => merrs.push(String(e)));
await mp.goto('http://localhost:8013/demos/22-toudai.html', { waitUntil:'networkidle' });
await mp.waitForTimeout(2500);
const mb0 = await mp.evaluate(() => +document.getElementById('scene').dataset.beam || 0);
const c = await mp.context().newCDPSession(mp);
await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:100,y:500}]});
for(let x=100;x<=320;x+=22){ await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:500}]}); await mp.waitForTimeout(16);}
await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await mp.waitForTimeout(600);
const mb1 = await mp.evaluate(() => +document.getElementById('scene').dataset.beam || 0);
const mOver = await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth);
await mp.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/_check/toudai-mob.png' });
ok('モバイル縦: 指なぞりで光がまわる・はみ出しなし', merrs.length === 0 && !mOver && mb1 > mb0 + 0.5, `errs=${merrs.length} over=${mOver} mb0=${mb0} mb1=${mb1}`);

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
await browser.close();
process.exit(failed ? 1 : 0);
