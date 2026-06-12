// 21 振り子の夜 — ドラッグで乱す→蔵本結合でそろう→床の光、エラー0
import { chromium } from 'playwright';
let failed = 0;
const ok = (n, p, note='') => { if(!p) failed++; console.log(`${p?'PASS':'FAIL'}  ${n}${note?'  -- '+note:''}`); };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport:{width:1280,height:800} })).newPage();
const errs = [];
page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8013/demos/21-furiko.html', { waitUntil:'networkidle' });
await page.waitForTimeout(2000);

// 床の光の帯(beam)領域の明るさ
const beamLit = () => page.evaluate(() => {
  const cv = document.getElementById('cv');
  const c = cv.getContext('2d');
  const H = cv.height, W = cv.width;
  const by = Math.round(H*0.20 + H*0.60 + 18*Math.min(devicePixelRatio,2));
  const d = c.getImageData(Math.round(W*0.3), by-6, Math.round(W*0.4), 12).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i]+d[i+1]+d[i+2];
  return Math.round(s/1000);
});

// 振り子AをドラッグしてかきまぜるW=1280: 枠w≈413, anchor(213, 222), L≈256 → bob≈(213,478)付近
await page.mouse.move(213, 470);
await page.mouse.down();
await page.mouse.move(330, 420, { steps: 8 });
await page.waitForTimeout(120);
await page.mouse.up();
// Cもノック(空白タップ)
await page.mouse.click(1100, 300);
await page.waitForTimeout(600);
ok('ドラッグ・タップ操作でエラーなし', errs.length === 0, errs.join('|').slice(0,150));

const orderOf = () => page.evaluate(() => +document.getElementById('cv').dataset.order || 0);
const earlyOrder = await orderOf();
const early = await beamLit();
ok('乱した直後はまだそろっていない', earlyOrder < 0.8, `order=${earlyOrder}`);
// 蔵本結合でそろうのを待つ(最長60秒、order>0.93で抜ける)
let lateOrder = 0;
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000);
  lateOrder = await orderOf();
  if (lateOrder > 0.93) break;
}
ok('やがてひとつの呼吸にそろう(order>0.93)', lateOrder > 0.93, `order=${lateOrder}`);
let late = 0;
for (let i = 0; i < 6; i++) { await page.waitForTimeout(350); late = Math.max(late, await beamLit()); }
ok('そろうと床の光が灯る(beam輝度増)', late > early + 40, `early=${early} late=${late}`);

await page.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/_check/furiko.png' });
const hud = await page.evaluate(() => ({
  back: !!document.querySelector('.hud-back'),
  no: (document.querySelector('.hud-no')||{}).textContent,
  labels: document.querySelectorAll('.dev-label').length,
}));
ok('HUD+3端末ラベル', hud.back && /21/.test(hud.no) && hud.labels === 3, JSON.stringify(hud));
ok('console/pageerror 0件(全行程)', errs.length === 0, errs.join('|').slice(0,150));

// モバイル縦
const mp = await (await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:3 })).newPage();
const merrs = [];
mp.on('console', m => { if (m.type()==='error') merrs.push(m.text()); });
mp.on('pageerror', e => merrs.push(String(e)));
await mp.goto('http://localhost:8013/demos/21-furiko.html', { waitUntil:'networkidle' });
await mp.waitForTimeout(1500);
await mp.touchscreen.tap(65, 480);   // A枠ノック
await mp.waitForTimeout(700);
const mOver = await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth);
await mp.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/_check/furiko-mob.png' });
ok('モバイル縦: タップエラーなし・はみ出しなし', merrs.length === 0 && !mOver, `errs=${merrs.length} over=${mOver}`);

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
await browser.close();
process.exit(failed ? 1 : 0);
