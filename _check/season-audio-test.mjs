// 19 光の庭 — 季節×音（夜の虫・鈴 chime の season:change 連動）の実ブラウザ検査
// - page.route で観測コードを注入する（ディスクは無改変。先例: _check/audio-soundscape-test.mjs）
//   - audio.js: chime 発火（semi / freq / dec / type / season）を window.__chimes へ記録、
//               applySeason 適用を window.__seasonApplied へ記録、bus / state を window へ公開
//   - seasons.js: 1季節の長さ(DUR)を引き延ばし、実機の季節送りを「初回の春」だけにする
//     （初回 haru = 本物の season:change bus 経路の検証。以降は合成で natsu→aki→fuyu を駆動。
//      natsu は state.season のみ書く＝毎フレーム保険の検証 / aki・fuyu は state+emit＝producer 忠実）
// - 各季節 N 粒の chime を観測し、間隔・音域(半音)・減衰が SEASON_CHIME テーブルどおりかを確認
// - console error / pageerror 0件、ミュート2回でエラーなし。全体 ~5分以内（fuyu は2粒だけ待つ）
import { chromium } from 'playwright';

const url = 'http://localhost:8013/demos/19-niwa/index.html';

// 期待テーブル（demos/19-niwa/js/audio.js の SEASON_CHIME と対応させる）
const EXPECT = {
  haru:  { wait: [4, 11],  semis: [39, 41, 43, 46, 48], dec: [0.5, 1.1], type: 'sine',     need: 3, window: 40000 },
  natsu: { wait: [2.5, 8], semis: [41, 43, 46, 48],     dec: [0.3, 0.6], type: 'triangle', need: 4, window: 40000 },
  aki:   { wait: [6, 16],  semis: [34, 36, 39, 41, 43], dec: [0.8, 1.4], type: 'sine',     need: 3, window: 55000 },
  fuyu:  { wait: [10, 24], semis: [43, 46, 48, 51],     dec: [1.2, 2.0], type: 'sine',     need: 2, window: 75000 },
};
const ORDER = ['haru', 'natsu', 'aki', 'fuyu'];

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

// --- 注入1: audio.js（観測のみ・挙動は変えない） ---
let audioInjected = 0;
await page.route('**/demos/19-niwa/js/audio.js', async (route) => {
  const res = await route.fetch();
  let body = await res.text();
  const a1 = 'buildUI(ctx);';
  if (body.includes(a1)) {
    body = body.replace(a1, a1 +
      `\n      try { window.__niwaBus = ctx.bus; window.__niwaState = ctx.state; } catch (e) {}`);
    audioInjected++;
  }
  const a2 = 'const dec = c.dec[0] + Math.random() * (c.dec[1] - c.dec[0]);';
  if (body.includes(a2)) {
    body = body.replace(a2, a2 +
      `\n    try { (window.__chimes = window.__chimes || []).push({ at: performance.now(),` +
      ` semi, freq: Math.round(220 * Math.pow(2, semi / 12)), dec: +dec.toFixed(2),` +
      ` type: c.type, season: seasonMode }); } catch (e) {}`);
    audioInjected++;
  }
  const a3 = '  seasonMode = season;';
  if (body.includes(a3)) {
    body = body.replace(a3, a3 +
      `\n  try { (window.__seasonApplied = window.__seasonApplied || []).push({ season, at: performance.now() }); } catch (e) {}`);
    audioInjected++;
  }
  await route.fulfill({ response: res, body });
});

// --- 注入2: seasons.js（初回の春のあと自動では進ませない。視覚は春のまま＝観測の邪魔をしない） ---
let seasonsInjected = false;
await page.route('**/demos/19-niwa/js/seasons.js', async (route) => {
  const res = await route.fetch();
  let body = await res.text();
  const a = 'const DUR_MIN = 75, DUR_MAX = 120;';
  if (body.includes(a)) {
    body = body.replace(a, 'const DUR_MIN = 9e6, DUR_MAX = 9e6;');
    seasonsInjected = true;
  }
  await route.fulfill({ response: res, body });
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2000);
console.log('INJECTED audio.js hooks:', audioInjected, '/ 3, seasons.js DUR stretch:', seasonsInjected);
if (audioInjected !== 3) errors.push(`TEST: audio.js observation hooks injected ${audioInjected}/3 (anchor changed?)`);
if (!seasonsInjected) errors.push('TEST: seasons.js DUR anchor not found');

// 庭に入る → app:start → AudioContext 生成 → ~3秒後に本物の季節機械が「春」を emit
await page.click('text=庭へ入る');

// 初回の春（実 bus 経路）を待つ
let sawHaru = false;
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1000);
  sawHaru = await page.evaluate(() =>
    (window.__seasonApplied || []).some((s) => s.season === 'haru'));
  if (sawHaru) break;
}
console.log('REAL_HARU_VIA_BUS:', sawHaru);
if (!sawHaru) errors.push('TEST: real season:change (haru) was not applied within ~20s');

// 指定季節の chime が need 粒たまるまで観測（window で打ち切り）
async function observe(season) {
  const exp = EXPECT[season];
  const t0 = Date.now();
  let mine = [];
  while (Date.now() - t0 < exp.window) {
    await page.waitForTimeout(1000);
    mine = await page.evaluate((s) => (window.__chimes || []).filter((c) => c.season === s), season);
    if (mine.length >= exp.need) break;
  }
  return mine;
}

function analyze(season, recs, appliedAt) {
  const exp = EXPECT[season];
  const gaps = [];
  // applySeason は新しい季節の wait で次の一粒を予約し直すので、切替→初粒も間隔サンプルになる
  if (appliedAt != null && recs.length) gaps.push((recs[0].at - appliedAt) / 1000);
  for (let i = 1; i < recs.length; i++) gaps.push((recs[i].at - recs[i - 1].at) / 1000);
  const freqs = recs.map((r) => r.freq);
  const out = {
    season, count: recs.length,
    gaps: gaps.map((g) => +g.toFixed(1)),
    freqHz: freqs.length ? [Math.min(...freqs), Math.max(...freqs)] : [],
    semis: [...new Set(recs.map((r) => r.semi))].sort((a, b) => a - b),
    decs: recs.map((r) => r.dec),
    types: [...new Set(recs.map((r) => r.type))],
  };
  if (recs.length < exp.need) errors.push(`TEST[${season}]: only ${recs.length}/${exp.need} chimes in window`);
  const gapMin = Math.max(0.3, exp.wait[0] - 1.0);
  const gapMax = exp.wait[1] * 1.5 + 2.0;   // rAF/負荷ぶんの余裕
  for (const g of gaps) {
    if (g < gapMin || g > gapMax) errors.push(`TEST[${season}]: gap ${g.toFixed(1)}s outside ${gapMin}-${gapMax.toFixed(1)}s (table ${exp.wait[0]}-${exp.wait[1]}s)`);
  }
  for (const r of recs) {
    if (!exp.semis.includes(r.semi)) errors.push(`TEST[${season}]: semi ${r.semi} (${r.freq}Hz) not in ${JSON.stringify(exp.semis)}`);
    if (r.dec < exp.dec[0] - 0.011 || r.dec > exp.dec[1] + 0.011) errors.push(`TEST[${season}]: dec ${r.dec}s outside ${exp.dec[0]}-${exp.dec[1]}s`);
    if (r.type !== exp.type) errors.push(`TEST[${season}]: osc type ${r.type} != ${exp.type}`);
  }
  console.log(`SEASON ${season}:`, JSON.stringify(out));
  return out;
}

const results = {};
for (const season of ORDER) {
  if (season !== 'haru') {
    // 合成遷移。natsu は state のみ（保険経路の検証）、aki/fuyu は producer 同様 state+emit
    await page.evaluate((s) => {
      if (window.__niwaState) window.__niwaState.season = s;
      if (s !== 'natsu' && window.__niwaBus) window.__niwaBus.emit('season:change', { season: s });
    }, season);
    await page.waitForTimeout(300);
    const applied = await page.evaluate(() => (window.__seasonApplied || []).map((x) => x.season));
    if (!applied.includes(season)) errors.push(`TEST[${season}]: applySeason did not run after synthetic switch`);
  }
  const appliedAt = await page.evaluate((s) => {
    const a = (window.__seasonApplied || []).filter((x) => x.season === s);
    return a.length ? a[a.length - 1].at : null;
  }, season);
  results[season] = analyze(season, await observe(season), appliedAt);
}
const applied = await page.evaluate(() => window.__seasonApplied || []);
console.log('SEASON_APPLIED:', JSON.stringify(applied));
const defaultChimes = await page.evaluate(() => (window.__chimes || []).filter((c) => !c.season).length);
console.log('DEFAULT(no-season)_CHIMES:', defaultChimes);

// 密度の筋: 夏は最短間隔・冬は最長間隔（テーブル境界より緩く、傾向だけ確かめる）
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const mNatsu = mean(results.natsu.gaps), mFuyu = mean(results.fuyu.gaps);
console.log('MEAN_GAP natsu:', mNatsu && mNatsu.toFixed(1), 's / fuyu:', mFuyu && mFuyu.toFixed(1), 's');
if (isFinite(mNatsu) && isFinite(mFuyu) && mNatsu >= mFuyu)
  errors.push(`TEST: natsu mean gap ${mNatsu.toFixed(1)}s not denser than fuyu ${mFuyu.toFixed(1)}s`);

// ミュート ON → OFF（エラーなく通ること）
const muteBtn = page.locator('.niwa-mute-btn');
if (await muteBtn.count()) {
  await muteBtn.click();
  await page.waitForTimeout(600);
  await muteBtn.click();
  await page.waitForTimeout(600);
  console.log('MUTE_TOGGLE: ok (2 clicks)');
} else {
  errors.push('TEST: .niwa-mute-btn not found');
}

await page.screenshot({ path: new URL('./season-audio.png', import.meta.url).pathname });
await browser.close();

if (errors.length) {
  console.log('ERRORS:');
  for (const e of errors) console.log(' -', e.slice(0, 300));
  process.exit(1);
}
console.log('NO_ERRORS season-audio.png saved');
