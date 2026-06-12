// 19 光の庭 — seasons.js(季節の状態機械)の実ブラウザ統合検査
// 使い方:
//   node _check/seasons-test.mjs          … デスクトップ 1280×800・約230〜250秒ソーク
//   node _check/seasons-test.mjs mobile   … スマホ縦 390×844 (isMobile+hasTouch)・春の出現確認
// 手口(先例: audio-soundscape-test.mjs):
//   page.route で seasons.js 配信時に init(ctx) 冒頭へ観測コードだけを注入(ディスクは無改変)。
//   bus/state を window へ公開し、season:change / note / weather:change / app:start を時刻つきで記録。
// 合格条件:
//   console error / pageerror 0件・初回の春が app:start+約3秒・以降の遷移が75〜120秒・
//   season:change と state.season の一致・遷移ごとに季節の鈴(note, vol=0.15)が1回。
import { chromium } from 'playwright';

const MODE = process.argv[2] === 'mobile' ? 'mobile' : 'soak';
const URL = 'http://localhost:8013/demos/19-niwa/index.html';
const OUT = '/Users/<redacted>/Desktop/dev/260611_hikari/_check';
const SPEC_PITCH = { haru: 0.5, natsu: 0.7, aki: 0.35, fuyu: 0.85 };
const ORDER = ['haru', 'natsu', 'aki', 'fuyu'];

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
const context = MODE === 'mobile'
  ? await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
      isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    })
  : await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const errors = [];
const warnings = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'warning') warnings.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

// --- 観測フック: seasons.js の init 冒頭に注入(route 経由・観測のみで挙動は変えない) ---
let routeInjected = false;
const INJECT =
  "\n  try {" +
  "\n    window.__niwaBus = ctx.bus; window.__niwaState = ctx.state;" +
  "\n    window.__seasonEvents = []; window.__noteEvents = []; window.__weatherEvents = [];" +
  "\n    ctx.bus.on('app:start', () => { window.__appStartAt = performance.now(); });" +
  "\n    ctx.bus.on('season:change', (d) => window.__seasonEvents.push({ season: d && d.season, stateSeason: ctx.state.season, at: performance.now() }));" +
  "\n    ctx.bus.on('note', (d) => window.__noteEvents.push({ pitch: d && d.pitch, vol: d && d.vol, at: performance.now() }));" +
  "\n    ctx.bus.on('weather:change', (d) => window.__weatherEvents.push({ mode: d && d.mode, at: performance.now() }));" +
  "\n  } catch (e) {}\n";
await page.route('**/demos/19-niwa/js/seasons.js', async (route) => {
  const res = await route.fetch();
  let body = await res.text();
  const anchor = 'function init(ctx) {';
  if (body.includes(anchor)) { body = body.replace(anchor, anchor + INJECT); routeInjected = true; }
  await route.fulfill({ response: res, body });
});

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
ok('観測フックを seasons.js に注入できた(route)', routeInjected);

// --- 入庭 ---
if (MODE === 'mobile') await page.tap('.niwa-intro-enter', { timeout: 8000 });
else await page.click('.niwa-intro-enter', { timeout: 8000 });
const enterAtNode = Date.now();

const snap = () => page.evaluate(() => ({
  now: performance.now(),
  appStartAt: window.__appStartAt || null,
  events: window.__seasonEvents || [],
  notes: window.__noteEvents || [],
  weather: window.__weatherEvents || [],
  stateSeason: window.__niwaState ? window.__niwaState.season : '(no state)',
}));

function finish() {
  console.log('---');
  if (warnings.length) {
    console.log('CONSOLE_WARNINGS: ' + warnings.length);
    for (const w of warnings) console.log('  - ' + w.slice(0, 300));
  }
  console.log('CONSOLE/PAGE ERRORS: ' + errors.length);
  for (const e of errors) console.log('  - ' + e.slice(0, 300));
  console.log(`RESULT(${MODE}): ${results.length - failedCount}/${results.length} pass, errors=${errors.length}`);
  process.exit(failedCount > 0 || errors.length > 0 ? 1 : 0);
}

// ================= mobile: 春の出現と HUD 干渉だけを素早く見る =================
if (MODE === 'mobile') {
  await page.waitForTimeout(11000);   // 春は app:start+3s、フェードイン8〜12sの途中を撮る
  const s = await snap();
  const rel = s.events.length && s.appStartAt ? ((s.events[0].at - s.appStartAt) / 1000).toFixed(2) : 'n/a';
  ok('mobile: 入庭後に最初の春が来る(約3秒)', s.events.length >= 1 && s.events[0].season === 'haru',
    `rel=+${rel}s`);
  ok('mobile: state.season が haru', s.events.length >= 1 && s.events[0].stateSeason === 'haru' && s.stateSeason === 'haru',
    `state=${s.stateSeason}`);
  const lay = await page.evaluate(() => {
    const g = (sel) => { const el = document.querySelector(sel); if (!el) return null;
      const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    return { vw: innerWidth, vh: innerHeight, pad: g('.niwa-seedpad'), hint: g('.hud-hint'),
      audioBar: g('.niwa-audio-bar'), actions: g('.niwa-actions'), hudBottom: g('.hud-bottom') };
  });
  const inter = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  ok('mobile: 描きパッドがヒント文と重ならない', !inter(lay.pad, lay.hint),
    JSON.stringify({ pad: lay.pad, hint: lay.hint }));
  console.log('MOBILE_LAYOUT ' + JSON.stringify(lay));
  await page.screenshot({ path: OUT + '/n7-season-mob.png' });
  console.log('SHOT n7-season-mob.png');
  await browser.close();
  finish();
}

// ================= soak: 約230〜250秒の季節めぐり観測 =================
const SOAK_MS = 250000;            // 仕様最悪値(3+120+120=243s)まで粘って2遷移目を狙う
let shot1Due = null, shot2Due = null, shot1 = false, shot2 = false;
let s = null;
for (;;) {
  await page.waitForTimeout(2000);
  s = await snap();
  const elapsed = Date.now() - enterAtNode;
  if (!shot1 && s.events.length >= 1) {
    if (shot1Due == null) shot1Due = Date.now() + 12000;       // フェードイン(8〜12s)が満ちた頃
    if (Date.now() >= shot1Due) {
      await page.screenshot({ path: OUT + '/n7-season-haru.png' });
      shot1 = true; console.log(`SHOT n7-season-haru.png @ +${(elapsed / 1000).toFixed(0)}s`);
    }
  }
  if (!shot2 && s.events.length >= 2) {
    if (shot2Due == null) shot2Due = Date.now() + 13000;       // クロスフェード(8〜15s)後の新季節
    if (Date.now() >= shot2Due) {
      await page.screenshot({ path: OUT + '/n7-season-2.png' });
      shot2 = true; console.log(`SHOT n7-season-2.png @ +${(elapsed / 1000).toFixed(0)}s`);
    }
  }
  if (elapsed >= SOAK_MS) break;
  if (s.events.length >= 3 && shot1 && shot2) break;           // 2遷移+撮影が済めば十分
}

// --- 評価 ---
const t0 = s.appStartAt;
ok('app:start を観測できた', !!t0);
const evs = (s.events || []).map((e) => ({ ...e, rel: t0 ? (e.at - t0) / 1000 : NaN }));
console.log('SEASON_TIMELINE (app:start からの秒):');
for (const e of evs) console.log(`  +${e.rel.toFixed(1)}s  ${e.season}  (state at emit=${e.stateSeason})`);

ok('初回の春が app:start+約3秒で来る', evs.length >= 1 && evs[0].season === 'haru' && evs[0].rel >= 2.5 && evs[0].rel <= 7,
  evs.length ? `+${evs[0].rel.toFixed(2)}s` : 'イベントなし');
ok('季節遷移を最低1回観測(できれば2回)', evs.length >= 2, `season:change ${evs.length}件(初回の春含む)`);
for (let i = 1; i < evs.length; i++) {
  const gap = evs[i].rel - evs[i - 1].rel;
  const expect = ORDER[(ORDER.indexOf(evs[i - 1].season) + 1) % ORDER.length];
  ok(`遷移${i}: ${evs[i - 1].season}→${evs[i].season} の順序が正しい`, evs[i].season === expect, `期待=${expect}`);
  ok(`遷移${i}: 間隔が75〜120秒(実測 ${gap.toFixed(1)}s)`, gap >= 73 && gap <= 124);
}
ok('season:change と state.season が一致(emit 時点・全件)', evs.length >= 1 && evs.every((e) => e.season === e.stateSeason));
ok('ソーク終了時の state.season が最後のイベントと一致', evs.length >= 1 && s.stateSeason === evs[evs.length - 1].season,
  `state=${s.stateSeason}`);

// 遷移ごとに「季節の鈴」note(該当 pitch, vol=0.15)がちょうど1回
for (let i = 0; i < evs.length; i++) {
  const e = evs[i];
  const near = (s.notes || []).filter((n) => Math.abs(n.at - e.at) <= 300 && n.vol === 0.15 && n.pitch === SPEC_PITCH[e.season]);
  ok(`note: ${e.season} の鈴が1回(pitch=${SPEC_PITCH[e.season]}, vol=0.15)`, near.length === 1, `matched=${near.length}`);
}

// 天候の自然発生(参考・減点なし)
const wevs = (s.weather || []).map((w) => `${t0 ? '+' + ((w.at - t0) / 1000).toFixed(1) + 's' : '?'} ${w.mode}`);
console.log('WEATHER_EVENTS(参考・自然発生): ' + (wevs.length ? wevs.join(' / ') : 'なし'));
console.log(`NOTE_EVENTS(参考): 計${(s.notes || []).length}件 ` +
  JSON.stringify((s.notes || []).map((n) => `+${t0 ? ((n.at - t0) / 1000).toFixed(1) : '?'}s p=${n.pitch} v=${n.vol}`)));

await browser.close();
finish();
