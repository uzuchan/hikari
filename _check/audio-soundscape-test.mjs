// 19 光の庭 — 音風景（風ノイズ / 夜の鈴 / 星屑シマー / 薄霧ローパス）の実ブラウザ検査
// - console error / pageerror を全収集（合格条件: 0件）
// - weather:change の観測: js/weather.js を route で受け、init(ctx) 冒頭に
//   「bus購読 + window への bus/state 公開」だけを注入（純粋に観測のみ、挙動は変えない）
// - AudioParam.setTargetAtTime をフックし、audio 側が天候に反応したか裏取り
import { chromium } from 'playwright';

const url = 'http://localhost:8013/demos/19-niwa/index.html';

const browser = await chromium.launch({
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
const warnings = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'warning') warnings.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

// --- 観測フック1: AudioParam.setTargetAtTime（timeConstant>=1 の遅いフェードだけ記録） ---
await page.addInitScript(() => {
  window.__paramLog = [];
  const orig = AudioParam.prototype.setTargetAtTime;
  AudioParam.prototype.setTargetAtTime = function (v, t, tc) {
    if (tc >= 1) window.__paramLog.push({ v, tc, at: performance.now() });
    return orig.call(this, v, t, tc);
  };
});

// --- 観測フック2: weather.js の init 冒頭に観測コードを注入（route 経由・ファイルは無改変） ---
let routeInjected = false;
await page.route('**/demos/19-niwa/js/weather.js', async (route) => {
  const res = await route.fetch();
  let body = await res.text();
  const anchor = 'function init(ctx) {';
  if (body.includes(anchor)) {
    body = body.replace(
      anchor,
      anchor +
        `\n  try { window.__niwaBus = ctx.bus; window.__niwaState = ctx.state;` +
        ` ctx.bus.on('weather:change', (d) => (window.__weatherEvents = window.__weatherEvents || [])` +
        `.push({ mode: d && d.mode, at: performance.now() })); } catch (e) {}`
    );
    routeInjected = true;
  }
  await route.fulfill({ response: res, body });
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3500);
console.log('ROUTE_INJECTED:', routeInjected);
if (!routeInjected) errors.push('TEST: weather.js observation hook not injected (anchor not found)');

// 庭に入る（intro → app:start → AudioContext 生成）
await page.click('text=庭へ入る');
await page.waitForTimeout(2500);

// ミュート ON → OFF
const muteBtn = page.locator('.niwa-mute-btn');
if (await muteBtn.count()) {
  await muteBtn.click();
  await page.waitForTimeout(800);
  await muteBtn.click();
  await page.waitForTimeout(800);
  console.log('MUTE_TOGGLE: ok (2 clicks)');
} else {
  errors.push('TEST: .niwa-mute-btn not found');
}

// 「息を風に」→ fake device で許可 → 表示が変わるか
const micBtn = page.locator('button:has-text("息を風に")');
if (await micBtn.count()) {
  await micBtn.click();
  await page.waitForTimeout(2000);
  const label = await page
    .locator('.niwa-audio-bar button.action-btn:not(.niwa-mute-btn)')
    .first()
    .textContent();
  console.log('MIC_LABEL:', JSON.stringify(label));
  if (!/風をきいている/.test(label || '')) errors.push(`TEST: mic label unexpected: ${label}`);
} else {
  errors.push('TEST: mic button not found');
}

// 天候遷移（40〜90秒周期）を最低1回跨ぐまで観測（最大 ~110 秒）
let events = [];
let stateWeather = null;
const t0 = Date.now();
while (Date.now() - t0 < 110000) {
  await page.waitForTimeout(2000);
  const snap = await page.evaluate(() => ({
    events: window.__weatherEvents || [],
    weather: window.__niwaState ? window.__niwaState.weather : '(state not exposed)',
  }));
  events = snap.events;
  stateWeather = snap.weather;
  if (events.length >= 1 && Date.now() - t0 > 95000) break; // 100秒程度は走らせる
}
console.log('WEATHER_EVENTS:', JSON.stringify(events));
console.log('STATE_WEATHER:', JSON.stringify(stateWeather));
if (events.length === 0) errors.push('TEST: no weather:change observed in ~110s');

// 合成テスト: stardust / mist / clear を bus へ直接流して audio の反応を裏取り
await page.evaluate(() => window.__niwaBus && window.__niwaBus.emit('weather:change', { mode: 'stardust' }));
await page.waitForTimeout(4000);
await page.evaluate(() => window.__niwaBus && window.__niwaBus.emit('weather:change', { mode: 'mist' }));
await page.waitForTimeout(4000);
await page.evaluate(() => window.__niwaBus && window.__niwaBus.emit('weather:change', { mode: 'clear' }));
await page.waitForTimeout(2000);

const paramLog = await page.evaluate(() => window.__paramLog || []);
const sawShimmerIn = paramLog.some((p) => p.v === 1 && p.tc === 2.5);
const sawShimmerOut = paramLog.some((p) => p.v === 0 && p.tc === 1.8);
const sawMistClose = paramLog.some((p) => p.v === 2200 && p.tc === 2.5);
const sawMistOpen = paramLog.some((p) => p.v === 18000 && p.tc === 3.5);
console.log('AUDIO_REACTION:', JSON.stringify({ sawShimmerIn, sawShimmerOut, sawMistClose, sawMistOpen }));
if (!sawShimmerIn || !sawShimmerOut || !sawMistClose || !sawMistOpen)
  errors.push(`TEST: audio did not fully react to weather:change ${JSON.stringify({ sawShimmerIn, sawShimmerOut, sawMistClose, sawMistOpen })}`);
console.log('PARAM_LOG_SLOW_FADES:', JSON.stringify(paramLog.slice(0, 40)));

await page.screenshot({ path: '_check/n6-soundscape.png' });
await browser.close();

if (warnings.length) {
  console.log('CONSOLE_WARNINGS:');
  for (const w of warnings) console.log(' -', w.slice(0, 300));
}
if (errors.length) {
  console.log('CONSOLE_ERRORS:');
  for (const e of errors) console.log(' -', e.slice(0, 300));
  process.exit(1);
}
console.log('NO_ERRORS n6-soundscape.png saved');
