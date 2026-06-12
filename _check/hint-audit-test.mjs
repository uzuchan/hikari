// 操作ヒント語彙総点検の検証 — 変更したデモ (07, 09, 11, 15) のみを対象
//   1. console error 0（デスクトップ=マウス / モバイル=isMobile+hasTouch の両コンテキスト）
//   2. .hud-hint にデスクトップ専用語彙（クリック/ダブルクリック/ホイール/右クリック）が残っていない
//   3. 文言が約束する操作が両モダリティで実際に動く（top-level let の状態値で確認）
//      07: 水面にふれる → 波紋が立ち魚が生まれる (fish.length 増)
//      09: 星3つ連結 → すばやく二度たたく → 獣誕生 & 鎖リセット (beasts/chain)
//      11: 長押し → 加速 (speed 上昇)、離す → 減速
//   4. 15: スマホ縦390×844でラベルがHUDタイトルに重ならない（デスクトップは top:96 のまま不変）
//      → スクショ _check/wataridori-mob.png
// 使い方: node _check/hint-audit-test.mjs   (サーバ http://localhost:8013 起動済みであること)
import { chromium } from 'playwright';

const BASE = 'http://localhost:8013';
let failures = 0;
const ok = (cond, label) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures++; };

const browser = await chromium.launch();

async function openPage(mobile, path) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`));
  await page.goto(`${BASE}/${path}`, { waitUntil: 'networkidle', timeout: 20000 });
  return { ctx, page, errors };
}

const press = (page, mobile, x, y) =>
  mobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);

const noDesktopVocab = page => page.evaluate(() =>
  !/クリック|ホイール|右クリ/.test(document.querySelector('.hud-hint')?.textContent || ''));

// ---------------------------------------------------------------- 07 音紋の池
for (const mobile of [false, true]) {
  const mode = mobile ? 'タッチ' : 'マウス';
  console.log(`\n[07-pond / ${mode}]`);
  const { ctx, page, errors } = await openPage(mobile, 'demos/07-pond.html');
  await page.waitForTimeout(900);
  ok(await noDesktopVocab(page), 'ヒントにデスクトップ専用語彙なし');
  const before = await page.evaluate(() => fish.length);
  await press(page, mobile, 195, 460);          // 静かな水面にふれる
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => ({ fish: fish.length, ripples: ripples.length }));
  ok(after.fish > before, `ふれる → 魚誕生 (fish ${before}→${after.fish})`);
  ok(after.ripples > 0, `ふれる → 波紋 (ripples ${after.ripples})`);
  ok(errors.length === 0, `console error 0 (${errors.length}件)`);
  errors.forEach(e => console.log('    ERR:', e.slice(0, 200)));
  await ctx.close();
}

// ------------------------------------------------------- 09 星座を紡ぐ夜
for (const mobile of [false, true]) {
  const mode = mobile ? 'タッチ' : 'マウス';
  console.log(`\n[09-constellation / ${mode}]`);
  const { ctx, page, errors } = await openPage(mobile, 'demos/09-constellation.html');
  await page.waitForTimeout(600);
  ok(await noDesktopVocab(page), 'ヒントにデスクトップ専用語彙なし（ダブルクリック撤去）');

  // 互いに80px以上離れた星3つ + 全星から46px以上離れた空き地（CSS px）を選ぶ
  const pts = await page.evaluate(() => {
    const css = s => ({ x: s.x / DPR, y: s.y / DPR });
    const S = stars.map(css).filter(p =>
      p.y > 150 && p.y < innerHeight - 170 && p.x > 36 && p.x < innerWidth - 36);
    const picked = [];
    for (const p of S) {
      if (picked.length >= 3) break;
      if (picked.every(q => Math.hypot(p.x - q.x, p.y - q.y) > 80)) picked.push(p);
    }
    let empty = null;
    outer: for (let gy = 160; gy < innerHeight - 180; gy += 22)
      for (let gx = 36; gx < innerWidth - 36; gx += 22)
        if (stars.every(s => Math.hypot(s.x / DPR - gx, s.y / DPR - gy) > 46)) {
          empty = { x: gx, y: gy }; break outer;
        }
    return { picked, empty };
  });
  ok(pts.picked.length === 3 && !!pts.empty, '星3つ + 空き地を確保');

  for (const p of pts.picked) {                 // 星をつぎつぎにつなぐ（二度たたき誤判定を避け420ms間隔）
    await press(page, mobile, p.x, p.y);
    await page.waitForTimeout(420);
  }
  const chained = await page.evaluate(() => chain.length);
  ok(chained === 3, `星をつないで鎖に (chain=${chained})`);

  await press(page, mobile, pts.empty.x, pts.empty.y);   // すばやく二度たたく
  await page.waitForTimeout(90);
  await press(page, mobile, pts.empty.x, pts.empty.y);
  await page.waitForTimeout(150);
  const st = await page.evaluate(() => ({ beasts: beasts.length, chain: chain.length }));
  ok(st.beasts === 1, `二度たたき → 獣誕生 (beasts=${st.beasts})`);
  ok(st.chain === 0, `誕生後に鎖リセット (chain=${st.chain})`);
  ok(errors.length === 0, `console error 0 (${errors.length}件)`);
  errors.forEach(e => console.log('    ERR:', e.slice(0, 200)));
  await ctx.close();
}

// ---------------------------------------------------------- 11 光の回廊
for (const mobile of [false, true]) {
  const mode = mobile ? 'タッチ' : 'マウス';
  console.log(`\n[11-corridor / ${mode}]`);
  const { ctx, page, errors } = await openPage(mobile, 'demos/11-corridor.html');
  await page.waitForTimeout(1500);              // three.js 初期化
  ok(await noDesktopVocab(page), 'ヒントにデスクトップ専用語彙なし（クリック撤去）');

  const vw = mobile ? 390 : 1280, vh = mobile ? 844 : 800;
  const hx = Math.round(vw * 0.7), hy = Math.round(vh * 0.5);
  if (mobile) {                                 // タッチで押さえて保持（CDP）
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hx, y: hy }] });
    await page.waitForTimeout(750);
    const mid = await page.evaluate(() => ({ speed, holding, mx }));
    ok(mid.holding === true, '長押し中 holding=true');
    ok(mid.speed > 12, `長押し → 加速 (speed=${mid.speed.toFixed(1)} > 12)`);
    ok(Math.abs(mid.mx - (hx / vw * 2 - 1)) < 0.12, `指の位置に視線が応答 (mx=${mid.mx.toFixed(2)})`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(900);
    const end = await page.evaluate(() => ({ speed, holding }));
    ok(end.holding === false && end.speed < mid.speed, `離す → 減速 (speed=${end.speed.toFixed(1)})`);
  } else {
    await page.mouse.move(hx, hy);
    await page.waitForTimeout(150);
    const mx0 = await page.evaluate(() => mx);
    ok(Math.abs(mx0 - (hx / vw * 2 - 1)) < 0.12, `マウス位置に視線が応答 (mx=${mx0.toFixed(2)})`);
    await page.mouse.down();
    await page.waitForTimeout(750);
    const mid = await page.evaluate(() => ({ speed, holding }));
    ok(mid.holding === true, '長押し中 holding=true');
    ok(mid.speed > 12, `長押し → 加速 (speed=${mid.speed.toFixed(1)} > 12)`);
    await page.mouse.up();
    await page.waitForTimeout(900);
    const end = await page.evaluate(() => ({ speed, holding }));
    ok(end.holding === false && end.speed < mid.speed, `離す → 減速 (speed=${end.speed.toFixed(1)})`);
  }
  ok(errors.length === 0, `console error 0 (${errors.length}件)`);
  errors.forEach(e => console.log('    ERR:', e.slice(0, 200)));
  await ctx.close();
}

// ------------------------------------------------------ 15 渡り鳥の手紙
{
  console.log('\n[15-wataridori / スマホ縦 390×844]');
  const { ctx, page, errors } = await openPage(true, 'demos/15-wataridori.html');
  await page.waitForTimeout(2200);
  const m = await page.evaluate(() => {
    const tb = document.querySelector('.hud-title-block').getBoundingClientRect();
    const a = document.querySelector('.sky-left').getBoundingClientRect();
    return { blockBottom: tb.bottom, labelTop: a.top, labelBottom: a.bottom };
  });
  ok(m.labelTop >= m.blockBottom + 12,
    `ラベルがタイトルに重ならない (title下端${m.blockBottom}px / ラベル上端${m.labelTop}px)`);
  ok(m.labelBottom < 390, 'ラベルは空の上層に収まる');
  await page.screenshot({ path: '_check/wataridori-mob.png' });
  console.log('  SHOT  _check/wataridori-mob.png');
  ok(errors.length === 0, `console error 0 (${errors.length}件)`);
  errors.forEach(e => console.log('    ERR:', e.slice(0, 200)));
  await ctx.close();
}
{
  console.log('\n[15-wataridori / デスクトップ不変 1280×800]');
  const { ctx, page, errors } = await openPage(false, 'demos/15-wataridori.html');
  await page.waitForTimeout(1200);
  const top = await page.evaluate(() => document.querySelector('.sky-left').getBoundingClientRect().top);
  ok(top === 96, `デスクトップは top:96px のまま (実測 ${top}px)`);
  ok(errors.length === 0, `console error 0 (${errors.length}件)`);
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
