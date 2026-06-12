// 25 月のみちしお — 月を渡すと潮が入れ替わる。エラー0
import { chromium } from 'playwright';
let failed = 0;
const ok = (n, p, note='') => { if(!p) failed++; console.log(`${p?'PASS':'FAIL'}  ${n}${note?'  -- '+note:''}`); };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport:{width:1280,height:800} })).newPage();
const errs = [];
page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8013/demos/25-michishio.html', { waitUntil:'networkidle' });
await page.waitForTimeout(3500);   // 初期潮位が落ち着くまで

const state = () => page.evaluate(() => ({
  mx: +document.getElementById('cv').dataset.moonx,
  a: +document.getElementById('cv').dataset.tidea,
  b: +document.getElementById('cv').dataset.tideb,
}));

const s0 = await state();
ok('初期: 月はAの上・Aが満ちている', s0.mx < 0.5 && s0.a > s0.b, JSON.stringify(s0));

// 月をつかんでBの海へ渡す(moon初期位置 ≈ frames[0].cx=W/4=320, y=H*0.32=256)
await page.mouse.move(320, 256);
await page.mouse.down();
await page.mouse.move(960, 256, { steps: 20 });
await page.mouse.up();
await page.waitForTimeout(6000);   // 潮はゆっくり応える
const s1 = await state();
ok('月を渡すとBが満ち、Aが引く', s1.mx > 0.5 && s1.b > s1.a && s1.b > s0.b + 0.15 && s1.a < s0.a - 0.15, JSON.stringify(s1));

await page.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/_check/michishio.png' });
const hud = await page.evaluate(() => ({
  back: !!document.querySelector('.hud-back'),
  no: (document.querySelector('.hud-no')||{}).textContent,
  labels: document.querySelectorAll('.dev-label').length,
}));
ok('HUD+2海ラベル', hud.back && /25/.test(hud.no) && hud.labels === 2, JSON.stringify(hud));
ok('console/pageerror 0件', errs.length === 0, errs.join('|').slice(0,150));

// モバイル縦: タッチで月を渡す
const mp = await (await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:3 })).newPage();
const merrs = [];
mp.on('console', m => { if (m.type()==='error') merrs.push(m.text()); });
mp.on('pageerror', e => merrs.push(String(e)));
await mp.goto('http://localhost:8013/demos/25-michishio.html', { waitUntil:'networkidle' });
await mp.waitForTimeout(2500);
const m0 = await mp.evaluate(() => ({ a: +document.getElementById('cv').dataset.tidea, b: +document.getElementById('cv').dataset.tideb }));
const c = await mp.context().newCDPSession(mp);
await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:97,y:270}]});
for(let x=97;x<=292;x+=15){ await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:270}]}); await mp.waitForTimeout(16);}
await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await mp.waitForTimeout(5500);
const m1 = await mp.evaluate(() => ({ a: +document.getElementById('cv').dataset.tidea, b: +document.getElementById('cv').dataset.tideb }));
const mOver = await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth);
await mp.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/_check/michishio-mob.png' });
ok('モバイル縦: 指で月を渡すと潮が入れ替わる・はみ出しなし', merrs.length === 0 && !mOver && m1.b > m0.b + 0.1, `errs=${merrs.length} over=${mOver} ${JSON.stringify(m0)}→${JSON.stringify(m1)}`);

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
await browser.close();
process.exit(failed ? 1 : 0);
