// 11-corridor 操作検証: gesture-all.mjs の操作群 + 「長押し加速が実際に効くか」の挙動検証
// (マウス・タッチ両方)。node _check/gesture-11.mjs
import { chromium } from '/Users/<redacted>/Desktop/dev/260611_hikari/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`));
const opErrors = [];
let mark = 0;
const snap = op => {
  const fresh = errors.slice(mark); mark = errors.length;
  if (fresh.length) opErrors.push({ op, errs: [...new Set(fresh)] });
};

await page.goto('http://localhost:8013/demos/11-corridor.html', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);
snap('load');

const cx = 640, cy = 400, D = 220;

// 加速の機能検証: 長押し中は全アーチの発光が ei += boost*0.9 で増す
// → 回廊中央帯の平均輝度が明確に上がることを観測する。
// （リング列は9m周期の自己相似なのでフレーム差分では速度を測れない。輝度は単調で頑健。
//   page.screenshot の連写は GL キャンバスで黒/古フレームを拾うため、rAF 内で drawImage して読む）
// 加速の機能検証は描画ではなく状態を直接読む：デモは毎フレーム
// camera.fov = 64 + boost*14 で updateProjectionMatrix() を呼ぶので、
// プロトタイプをフックすれば boost が騒音ゼロで観測できる。
await page.evaluate(() => {
  const upm = THREE.PerspectiveCamera.prototype.updateProjectionMatrix;
  window.__fov = 0;
  THREE.PerspectiveCamera.prototype.updateProjectionMatrix = function () {
    window.__fov = this.fov;
    return upm.apply(this, arguments);
  };
});
const fov = () => page.evaluate(() => window.__fov);

// --- 挙動: 長押し加速(マウス) — fov 64→(最大78)へ上がり、離すと戻ること
const idleFov = await fov();
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.waitForTimeout(1800);          // 加速の立ち上がり待ち
const holdFovMouse = await fov();
await page.mouse.up();
await page.waitForTimeout(2500);
const releaseFovMouse = await fov();
snap('長押し加速(マウス)');

// --- 挙動: 長押し加速(タッチ・CDP)
await page.evaluate(() => {
  window.__pd = 0; window.__pu = 0;
  addEventListener('pointerdown', () => window.__pd++);
  addEventListener('pointerup', () => window.__pu++);
});
const cdp = await context.newCDPSession(page);
const tp = (x, y, id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(cx, cy, 0)] });
await page.waitForTimeout(1800);
const holdFovTouch = await fov();
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(2500);
const releaseFovTouch = await fov();
const touchPointer = await page.evaluate(() => ({ down: window.__pd, up: window.__pu }));
snap('長押し加速(タッチ)');

// --- gesture-all 相当の網羅操作 ---
for (const [name, dx, dy] of [['上', 0, -D], ['下', 0, D], ['左', -D, 0], ['右', D, 0]]) {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  snap(`スワイプ${name}`);
}
for (let i = 0; i < 10; i++) await page.mouse.click(cx + (i % 3) * 8, cy + (i % 2) * 8, { delay: 10 });
await page.waitForTimeout(400);
snap('連打10回');
for (const [x, y] of [[10, 10], [1270, 10], [10, 790], [1270, 790]]) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(120);
}
snap('端クリック');
await page.touchscreen.tap(cx, cy);
await page.touchscreen.tap(15, 15);
await page.touchscreen.tap(1265, 785);
await page.waitForTimeout(300);
snap('タッチtap');
// 2指ピンチ
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(cx - 60, cy, 0), tp(cx + 60, cy, 1)] });
for (let i = 1; i <= 5; i++) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(cx - 60 - i * 25, cy, 0), tp(cx + 60 + i * 25, cy, 1)] });
  await page.waitForTimeout(40);
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(400);
snap('ピンチ(2指)');
await page.setViewportSize({ width: 800, height: 600 });
await page.waitForTimeout(1000);
snap('リサイズ800x600');
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(1000);
snap('リサイズ1280x800');
await page.waitForTimeout(2000);
snap('最終待機');
await page.screenshot({ path: '_check/gesture/11.png' });

console.log(JSON.stringify({
  idleFov, holdFovMouse, releaseFovMouse, holdFovTouch, releaseFovTouch, touchPointer,
  accelWorksMouse: holdFovMouse > 74 && releaseFovMouse < 66,
  accelWorksTouch: holdFovTouch > 74 && releaseFovTouch < 66 && touchPointer.down >= 1 && touchPointer.up >= 1,
  opErrors: opErrors.length ? opErrors : 'NO_ERRORS',
}));
await browser.close();
