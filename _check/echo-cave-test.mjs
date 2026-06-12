// 20 こだまの洞窟 — タップ→波紋、こだまの遅延帰還、マイクボタン、エラー0
import { chromium } from 'playwright';
const results = []; let failed = 0;
const ok = (n, p, note='') => { results.push(n); if(!p) failed++; console.log(`${p?'PASS':'FAIL'}  ${n}${note?'  -- '+note:''}`); };

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport:{width:1280,height:800}, permissions:['microphone'] });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8013/demos/20-echo-cave.html', { waitUntil:'networkidle' });
await page.waitForTimeout(2500);

// 発光ピクセル計測(中央領域)
const lit = () => page.evaluate(() => {
  const cv = document.getElementById('cv');
  const c = cv.getContext('2d');
  const d = c.getImageData(cv.width*0.2, cv.height*0.2, cv.width*0.6, cv.height*0.6).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i]+d[i+1]+d[i+2] > 90) n++;
  return n;
});

const base = await lit();
await page.mouse.click(640, 500);            // 呼び声
await page.waitForTimeout(350);
const afterCall = await lit();
ok('タップで波紋が出る(発光ピクセル増)', afterCall > base + 150, `base=${base} after=${afterCall}`);

// 1〜2つ目のこだま(700ms×i±180ms)をポーリングで捕まえ、山の値を取る
let echoPeak = 0;
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(160);
  echoPeak = Math.max(echoPeak, await lit());
}
ok('こだまが遅れて返る(ポーリング山値で発光増)', echoPeak > base + 150, `peak=${echoPeak} base=${base}`);

// マイクボタン(fake device)
await page.click('#mic');
await page.waitForTimeout(1200);
const micState = await page.evaluate(() => ({
  label: document.getElementById('mic').textContent,
  levelShown: getComputedStyle(document.getElementById('level')).display !== 'none',
}));
ok('マイク有効化(ラベル変化+レベルメータ表示)', /こだまを待っている/.test(micState.label) && micState.levelShown, JSON.stringify(micState));

await page.waitForTimeout(2500);             // fakeトーンの立ち上がりで呼び声が出てもエラーが出ないこと
await page.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/_check/echo-cave.png' });

// HUD構造
const hud = await page.evaluate(() => ({
  back: !!document.querySelector('.hud-back'),
  no: (document.querySelector('.hud-no')||{}).textContent,
  hint: !!document.querySelector('.hud-hint'),
  proto: !!document.querySelector('.tech-tag'),
}));
ok('HUDが揃っている', hud.back && /20/.test(hud.no) && hud.hint && hud.proto, JSON.stringify(hud));
ok('console/pageerror 0件', errs.length === 0, errs.join(' | ').slice(0,200));

// モバイル縦も軽く
const mctx = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:3 });
const mp = await mctx.newPage();
const merrs = [];
mp.on('console', m => { if (m.type()==='error') merrs.push(m.text()); });
mp.on('pageerror', e => merrs.push(String(e)));
await mp.goto('http://localhost:8013/demos/20-echo-cave.html', { waitUntil:'networkidle' });
await mp.waitForTimeout(1800);
await mp.touchscreen.tap(195, 420);
await mp.waitForTimeout(900);
const mOverflow = await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth);
await mp.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/_check/echo-cave-mob.png' });
ok('モバイル縦: タッチtapエラーなし・横はみ出しなし', merrs.length === 0 && !mOverflow, `errs=${merrs.length} overflow=${mOverflow}`);

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
