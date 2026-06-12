// 19 光の庭 — natsu(夏)粒子の存在感チェック(磨き検証用)
// 使い方:
//   node _check/natsu-check.mjs                 … スクショ _check/n9-natsu.png
//   node _check/natsu-check.mjs n9-natsu-before.png   … 出力名を指定(調整前の控え等)
// 手口(先例: seasons-test.mjs):
//   page.route で seasons.js 配信時に「開始季節 haru→natsu」だけ書き換えて注入(ディスクは無改変)。
//   入庭 → app:start+3s で夏が訪れ、フェードイン(8〜12s)が満ちた頃にスクリーンショット。
// 合格条件: console error / pageerror 0件・最初の season:change が natsu・state.season=natsu。
import { chromium } from 'playwright';

const OUT = '/Users/<redacted>/Desktop/dev/260611_hikari/_check';
const SHOT = process.argv[2] || 'n9-natsu.png';
const URL = 'http://localhost:8013/demos/19-niwa/index.html';

const results = [];
let failedCount = 0;
function ok(name, pass, note = '') {
  results.push({ name, pass });
  if (!pass) failedCount++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? '  -- ' + note : ''}`);
}

const browser = await chromium.launch({
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

// --- route 注入: 開始季節を natsu に + init 冒頭に観測フック(挙動は変えない) ---
let routeInjected = false;
const INJECT =
  "\n  try {" +
  "\n    window.__niwaState = ctx.state; window.__seasonEvents = [];" +
  "\n    ctx.bus.on('app:start', () => { window.__appStartAt = performance.now(); });" +
  "\n    ctx.bus.on('season:change', (d) => window.__seasonEvents.push({ season: d && d.season, stateSeason: ctx.state.season, at: performance.now() }));" +
  "\n  } catch (e) {}\n";
await page.route('**/demos/19-niwa/js/seasons.js', async (route) => {
  const res = await route.fetch();
  let body = await res.text();
  const startAnchor = "setSeason('haru', ctx);";   // 最初の季節だけ夏へ(循環ロジックは無改変)
  const initAnchor = 'function init(ctx) {';
  if (body.includes(startAnchor) && body.includes(initAnchor)) {
    body = body.replace(startAnchor, "setSeason('natsu', ctx);");
    body = body.replace(initAnchor, initAnchor + INJECT);
    routeInjected = true;
  }
  await route.fulfill({ response: res, body });
});

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2500);
ok('開始季節の書き換えを seasons.js に注入できた(route)', routeInjected);

// --- 入庭 → 夏のフェードイン完了を待つ(3s + inDur最大12s + ひと呼吸) ---
await page.click('.niwa-intro-enter', { timeout: 8000 });
await page.waitForTimeout(17000);

const s = await page.evaluate(() => ({
  appStartAt: window.__appStartAt || null,
  events: window.__seasonEvents || [],
  stateSeason: window.__niwaState ? window.__niwaState.season : '(no state)',
}));
const rel = s.events.length && s.appStartAt ? ((s.events[0].at - s.appStartAt) / 1000).toFixed(2) : 'n/a';
ok('最初の季節として夏(natsu)が来た', s.events.length >= 1 && s.events[0].season === 'natsu', `+${rel}s`);
ok('state.season が natsu', s.stateSeason === 'natsu', `state=${s.stateSeason}`);

await page.screenshot({ path: OUT + '/' + SHOT });
console.log('SHOT ' + SHOT + ' (夏フェードイン完了後)');

ok('console error / pageerror 0件', errors.length === 0, errors.length ? errors.join(' | ').slice(0, 300) : '');
await browser.close();
console.log(`RESULT(natsu): ${results.length - failedCount}/${results.length} pass, errors=${errors.length}`);
process.exit(failedCount > 0 || errors.length > 0 ? 1 : 0);
