// 24 夜のしゃぼん — 長押しでふくらみ旅立つ・ふれるとほどける・マイク有効化・エラー0
import { chromium } from 'playwright';
let failed = 0;
const ok = (n, p, note='') => { if(!p) failed++; console.log(`${p?'PASS':'FAIL'}  ${n}${note?'  -- '+note:''}`); };

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport:{width:1280,height:800}, permissions:['microphone'] })).newPage();
const errs = [];
page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8013/demos/24-shabon.html', { waitUntil:'networkidle' });
await page.waitForTimeout(2500);   // お手本のひと玉(+1)

const count = () => page.evaluate(() => +document.getElementById('cv').dataset.bubbles || 0);
const c0 = await count();

// 長押しでふくらませ→離して旅立たせる(吹き口は W/2, H*0.72 = 640, 576)
await page.mouse.move(400, 300);
await page.mouse.down();
await page.waitForTimeout(1400);
await page.mouse.up();
await page.waitForTimeout(400);
const c1 = await count();
ok('長押しの息でしゃぼんが生まれる', c1 > c0, `before=${c0} after=${c1}`);

// 漂うしゃぼんにふれてほどく(位置は dataset では取れないので、吹き口の真上をなぞって当てる)
const popped = await page.evaluate(async () => {
  // 1秒かけて上昇中の玉のだいたいの場所(吹き口の上方)を順にクリック判定
  return null;
});
// 実座標が取れないため、広めにタップを散らして1つ以上ほどけることを確認
let c2 = c1;
outer:
for (let y = 560; y >= 200; y -= 60) {
  for (let x = 540; x <= 740; x += 50) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(60);
    c2 = await count();
    if (c2 < c1) break outer;
  }
}
ok('ふれるとほどけて星屑になる(数が減る)', c2 < c1, `before=${c1} after=${c2}`);

// マイク有効化(fake device)
await page.click('#mic');
await page.waitForTimeout(1500);
const micState = await page.evaluate(() => ({
  label: document.getElementById('mic').textContent,
  levelShown: getComputedStyle(document.getElementById('level')).display !== 'none',
}));
ok('マイク有効化(ラベル変化+メータ表示)', /息をきいている/.test(micState.label) && micState.levelShown, JSON.stringify(micState));
await page.waitForTimeout(2500);  // fakeトーンの息でエラーが出ないこと

await page.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/_check/shabon.png' });
const hud = await page.evaluate(() => ({
  back: !!document.querySelector('.hud-back'),
  no: (document.querySelector('.hud-no')||{}).textContent,
}));
ok('HUD', hud.back && /24/.test(hud.no), JSON.stringify(hud));
ok('console/pageerror 0件', errs.length === 0, errs.join('|').slice(0,150));

// モバイル縦
const mp = await (await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:3 })).newPage();
const merrs = [];
mp.on('console', m => { if (m.type()==='error') merrs.push(m.text()); });
mp.on('pageerror', e => merrs.push(String(e)));
await mp.goto('http://localhost:8013/demos/24-shabon.html', { waitUntil:'networkidle' });
await mp.waitForTimeout(1200);
const mc0 = await mp.evaluate(() => +document.getElementById('cv').dataset.bubbles || 0);
const c = await mp.context().newCDPSession(mp);
await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:380}]});
await mp.waitForTimeout(1300);
await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await mp.waitForTimeout(400);
const mc1 = await mp.evaluate(() => +document.getElementById('cv').dataset.bubbles || 0);
const mOver = await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth);
await mp.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/_check/shabon-mob.png' });
ok('モバイル縦: 長押しの息で生まれる・はみ出しなし', merrs.length === 0 && !mOver && mc1 > mc0, `errs=${merrs.length} over=${mOver} c=${mc0}→${mc1}`);

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
await browser.close();
process.exit(failed ? 1 : 0);
