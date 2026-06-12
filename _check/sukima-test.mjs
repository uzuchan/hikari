// 23 夜のすきま — 削ると光がこぼれ、すきまがゆっくり閉じる。エラー0
import { chromium } from 'playwright';
let failed = 0;
const ok = (n, p, note='') => { if(!p) failed++; console.log(`${p?'PASS':'FAIL'}  ${n}${note?'  -- '+note:''}`); };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport:{width:1280,height:800} })).newPage();
const errs = [];
page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8013/demos/23-sukima.html', { waitUntil:'networkidle' });
await page.waitForTimeout(4500);   // お手本のすきまが閉じはじめるまで少し待つ

// 指定領域の明るさ(表示キャンバス)
const litAt = (x, y, w, h) => page.evaluate(([x,y,w,h]) => {
  const cv = document.getElementById('cv');
  const c = cv.getContext('2d');
  const d = c.getImageData(x, y, w, h).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i]+d[i+1]+d[i+2];
  return Math.round(s / (d.length/4));
}, [x,y,w,h]);

// 右下の未削り領域を基準に、左上を削って比較
const dark0 = await litAt(900, 200, 120, 120);
await page.mouse.move(300, 300);
await page.mouse.down();
for (let i = 0; i <= 10; i++) { await page.mouse.move(300 + i*22, 300 + Math.sin(i)*30); await page.waitForTimeout(20); }
await page.mouse.up();
await page.waitForTimeout(400);
const litAfter = await litAt(300, 240, 240, 120);
ok('削ると光がこぼれる(削り跡が基準より明るい)', litAfter > dark0 + 25, `dark=${dark0} lit=${litAfter}`);

// 癒え: 25秒待つと削り跡が暗くなる
await page.waitForTimeout(25000);
const healed = await litAt(300, 240, 240, 120);
ok('すきまはゆっくり閉じる(輝度が減る)', healed < litAfter * 0.72, `lit=${litAfter} healed=${healed}`);

await page.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/_check/sukima.png' });
const hud = await page.evaluate(() => ({
  back: !!document.querySelector('.hud-back'),
  no: (document.querySelector('.hud-no')||{}).textContent,
}));
ok('HUD', hud.back && /23/.test(hud.no), JSON.stringify(hud));
ok('console/pageerror 0件', errs.length === 0, errs.join('|').slice(0,150));

// モバイル縦: タッチで削れる
const mp = await (await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:3 })).newPage();
const merrs = [];
mp.on('console', m => { if (m.type()==='error') merrs.push(m.text()); });
mp.on('pageerror', e => merrs.push(String(e)));
await mp.goto('http://localhost:8013/demos/23-sukima.html', { waitUntil:'networkidle' });
await mp.waitForTimeout(1200);
const mdark = await mp.evaluate(() => {
  const cv = document.getElementById('cv'); const c = cv.getContext('2d');
  const d = c.getImageData(cv.width*0.1, cv.height*0.55, 200, 150).data;
  let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i]+d[i+1]+d[i+2];
  return Math.round(s / (d.length/4));
});
const c = await mp.context().newCDPSession(mp);
await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:60,y:520}]});
for(let x=60;x<=300;x+=20){ await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:520+Math.sin(x*0.05)*22}]}); await mp.waitForTimeout(16);}
await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await mp.waitForTimeout(400);
const mlit = await mp.evaluate(() => {
  const cv = document.getElementById('cv'); const c = cv.getContext('2d');
  const d = c.getImageData(cv.width*0.1, cv.height*0.55, 200, 150).data;
  let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i]+d[i+1]+d[i+2];
  return Math.round(s / (d.length/4));
});
const mOver = await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth);
await mp.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/_check/sukima-mob.png' });
ok('モバイル縦: 指で削れる・はみ出しなし', merrs.length === 0 && !mOver && mlit > mdark + 15, `errs=${merrs.length} over=${mOver} dark=${mdark} lit=${mlit}`);

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
await browser.close();
process.exit(failed ? 1 : 0);
