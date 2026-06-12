// 02-library タッチ操作修繕の検証
// 使い方: node _check/library-touch-test.mjs
// 390x844 (isMobile+hasTouch): CDPタッチで hold=前進 / drag=見回し / tap=妖精集合 を実測し、
//   ヒント文がタッチ語彙に切り替わることを DOM で確認 → _check/library-mob.png
// 1280x800 (デスクトップ回帰): keydown 'w' で前進・ヒントがキーボード文言のまま・
//   クリック集合と「マウス長押しでは歩かない」ことを確認 → _check/library-desktop.png
// camera / yaw / gatherT はデモのトップレベル宣言を page.evaluate のレキシカル参照で読む（注入なし）。
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const ROOT = '/Users/<redacted>/Desktop/dev/260611_hikari';
const BASE = 'http://localhost:8013';
const URL = `${BASE}/demos/02-library.html`;
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function alive() {
  try { const r = await fetch(`${BASE}/index.html`, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}
async function ensureServer() {
  if (await alive()) return;
  const proc = spawn('python3', ['-m', 'http.server', '8013', '--directory', ROOT], { stdio: 'ignore', detached: true });
  proc.unref();
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 300));
    if (await alive()) return;
  }
  throw new Error('http://localhost:8013 を起動できませんでした');
}

await ensureServer();
const browser = await chromium.launch();
let failures = 0;
const ok = (checks) => (name, pass, detail = '') => { checks.push({ name, pass, detail }); if (!pass) failures++; };
const report = (name, checks) => {
  console.log(`\n=== ${name} ===`);
  for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
};
const camState = (page) => page.evaluate(() => ({
  x: camera.position.x, y: camera.position.y, z: camera.position.z,
  yaw, pitch, gatherT,
}));

// ---------- 390x844 モバイル ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: IPHONE_UA,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  try { await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 }); } catch { /* load済みなら続行 */ }
  await page.waitForTimeout(1500);

  const checks = [];
  const t = ok(checks);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const CX = 195, CY = 422;

  // ヒント文がタッチ語彙に切り替わっているか
  const hint = await page.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    text: document.querySelector('.hud-hint').textContent.trim(),
    keyChips: document.querySelectorAll('.hud-hint .key').length,
  }));
  t('(pointer: coarse) が成立', hint.coarse === true);
  t('ヒントがタッチ語彙（おしたまま すすむ…）', hint.text.includes('おしたまま すすむ') && hint.text.includes('なぞって みまわす') && hint.text.includes('妖精があつまる'), hint.text);
  t('kbd チップ(W/A/S/D…)が消えている', hint.keyChips === 0, `keyChips=${hint.keyChips}`);

  // (a) ホールド 1.5秒 → 視線方向(初期 yaw=0 なので -z)へ前進。離しても妖精は集まらない
  const h0 = await camState(page);
  await touch('touchStart', [{ x: CX, y: CY }]);
  await page.waitForTimeout(1600);
  await touch('touchEnd', []);
  await page.waitForTimeout(500); // walk のイーズアウトが収まってから測る
  const h1 = await camState(page);
  const fwd = h0.z - h1.z;
  t('ホールドで前進する (Δz > 2)', fwd > 2, `z ${h0.z.toFixed(2)} -> ${h1.z.toFixed(2)} (Δ${fwd.toFixed(2)})`);
  t('ホールド中に視線は回らない', Math.abs(h1.yaw - h0.yaw) < 0.01 && Math.abs(h1.pitch - h0.pitch) < 0.01, `yaw Δ${(h1.yaw - h0.yaw).toFixed(4)}`);
  t('ホールド解放では妖精が集まらない (gatherT=0)', h1.gatherT === 0, `gatherT=${h1.gatherT}`);

  // (b) ドラッグ → 視線が回る。位置は動かない
  const d0 = await camState(page);
  await touch('touchStart', [{ x: CX, y: CY }]);
  for (let i = 1; i <= 9; i++) {
    await touch('touchMove', [{ x: CX + i * 14, y: CY }]);
    await page.waitForTimeout(30);
  }
  await touch('touchEnd', []);
  await page.waitForTimeout(120);
  const d1 = await camState(page);
  const turned = Math.abs(d1.yaw - d0.yaw);
  const slid = Math.hypot(d1.x - d0.x, d1.z - d0.z);
  t('ドラッグで視線が回る (|Δyaw| > 0.1)', turned > 0.1, `yaw ${d0.yaw.toFixed(3)} -> ${d1.yaw.toFixed(3)} (Δ${turned.toFixed(3)})`);
  t('ドラッグ中は歩かない (移動 < 0.3)', slid < 0.3, `slid=${slid.toFixed(3)}`);
  t('ドラッグ解放では妖精が集まらない', d1.gatherT === 0, `gatherT=${d1.gatherT}`);

  // (c) 短いタップ → 妖精が集まる
  await touch('touchStart', [{ x: CX, y: CY }]);
  await page.waitForTimeout(70);
  await touch('touchEnd', []);
  await page.waitForTimeout(200);
  const tp = await camState(page);
  t('タップで妖精が集まる (gatherT > 100)', tp.gatherT > 100, `gatherT=${tp.gatherT}`);
  t('タッチ通しで console/pageerror 0件', errors.length === 0, errors.slice(0, 3).join(' | '));

  await page.waitForTimeout(800); // 妖精が集まりきった絵で撮る
  await page.screenshot({ path: `${ROOT}/_check/library-mob.png` });
  report('mobile 390x844 (iPhone, isMobile+hasTouch)', checks);
  await ctx.close();
}

// ---------- 1280x800 デスクトップ回帰 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  try { await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 }); } catch { /* load済みなら続行 */ }
  await page.waitForTimeout(1500);

  const checks = [];
  const t = ok(checks);

  // ヒントは従来のキーボード文言のまま
  const hint = await page.evaluate(() => ({
    text: document.querySelector('.hud-hint').textContent,
    keyChips: document.querySelectorAll('.hud-hint .key').length,
  }));
  t('ヒントがキーボード文言のまま', hint.text.includes('ドラッグで見回す') && !hint.text.includes('おしたまま'), hint.text.replace(/\s+/g, ' ').trim().slice(0, 40));
  t('kbd チップが残っている (>=4)', hint.keyChips >= 4, `keyChips=${hint.keyChips}`);

  // keydown 'w' で前進
  const k0 = await camState(page);
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  const k1 = await camState(page);
  t("keydown 'w' で前進する (Δz > 1)", k0.z - k1.z > 1, `z ${k0.z.toFixed(2)} -> ${k1.z.toFixed(2)}`);

  // マウス長押しでは歩かない（タッチ専用ホールドの回帰確認）
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.waitForTimeout(600);
  const m1 = await camState(page);
  await page.mouse.up();
  t('マウス長押しでは歩かない', Math.hypot(m1.x - k1.x, m1.z - k1.z) < 0.05, `moved=${Math.hypot(m1.x - k1.x, m1.z - k1.z).toFixed(3)}`);

  // クリックで妖精が集まる（従来挙動）
  await page.waitForTimeout(100);
  await page.evaluate(() => { gatherT = 0; });
  await page.mouse.click(640, 400);
  await page.waitForTimeout(150);
  const c1 = await camState(page);
  t('クリックで妖精が集まる (gatherT > 0)', c1.gatherT > 0, `gatherT=${c1.gatherT}`);
  t('console/pageerror 0件', errors.length === 0, errors.slice(0, 3).join(' | '));

  await page.waitForTimeout(600);
  await page.screenshot({ path: `${ROOT}/_check/library-desktop.png` });
  report('desktop 1280x800 (回帰)', checks);
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\nFAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
