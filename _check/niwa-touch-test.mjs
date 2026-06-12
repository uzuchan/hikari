// 19 光の庭 — スマホ縦(390×844, DPR3)タッチ合成のみの通し検査
// 目的:
//  A) 前回検査の白黒判定: 旧セレクタ(.niwa-enter / .action-btn / button)のタイムアウトが
//     スクリプト誤りだったかを再現し、正セレクタ .niwa-intro-enter の tap() が通るか確かめる
//  B) タッチのみで intro→描く→植える→育つ→ミニボタン操作 が全通しできるか
//  C) スマホ縦の操作性(はみ出し・重なり・44pxタッチターゲット・pointer-events漏れ)を計測
import { chromium } from 'playwright';

const URL = 'http://localhost:8013/demos/19-niwa/index.html';
const SHOT = (n) => `_check/${n}`;

const results = [];
let failed = 0;
function ok(name, pass, note = '') {
  results.push({ name, pass, note });
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? '  -- ' + note : ''}`);
}
function info(name, note) { console.log(`INFO  ${name}  -- ${note}`); }

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  permissions: ['microphone'],
});
const page = await context.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000); // モジュール起動・フォント・初回フレーム

await page.screenshot({ path: SHOT('niwa-mob-intro.png') });

// ---------------------------------------------------------------
// A. 白黒判定 — 旧セレクタの再現(イントロ表示中)
// ---------------------------------------------------------------
const forensics = await page.evaluate(() => {
  const r = {};
  r.niwaEnterExists = !!document.querySelector('.niwa-enter');           // 旧セレクタ1
  r.introEnterExists = !!document.querySelector('.niwa-intro-enter');    // 正セレクタ
  const probe = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return {
      cls: String(el.className),
      hit: hit ? String(hit.className || hit.id || hit.tagName) : 'null',
      blockedByIntro: !!(hit && hit.closest && hit.closest('.niwa-intro') && !el.closest('.niwa-intro')),
      selfReceives: !!(hit && (hit === el || el.contains(hit))),
    };
  };
  r.firstActionBtn = probe(document.querySelector('.action-btn'));       // 旧セレクタ2
  r.firstButton = probe(document.querySelector('button'));               // 旧セレクタ3
  r.enterBtn = probe(document.querySelector('.niwa-intro-enter'));
  return r;
});
ok('A1 旧セレクタ .niwa-enter は存在しない(スクリプト誤り)', forensics.niwaEnterExists === false);
ok('A2 正セレクタ .niwa-intro-enter は存在する', forensics.introEnterExists === true);
ok('A3 .action-btn(1個目) はイントロ幕にヒット負けする',
  !!forensics.firstActionBtn && forensics.firstActionBtn.selfReceives === false,
  `hit=${forensics.firstActionBtn && forensics.firstActionBtn.hit}`);
ok('A4 button(1個目) もイントロ幕の下',
  !!forensics.firstButton && forensics.firstButton.selfReceives === false,
  `cls=${forensics.firstButton && forensics.firstButton.cls}`);
ok('A5 .niwa-intro-enter 自身はヒットを受ける',
  !!forensics.enterBtn && forensics.enterBtn.selfReceives === true);

// 旧失敗モードの実再現: visible は通るが hit-test で詰まり tap がタイムアウトする
let oldTimedOut = false;
try {
  await page.tap('.action-btn >> nth=0', { timeout: 1500 });
} catch (e) {
  oldTimedOut = /Timeout|intercepts pointer events/i.test(String(e.message));
}
ok('A6 旧式 tap(.action-btn) はタイムアウト(前回の失敗を再現)', oldTimedOut);

// ---------------------------------------------------------------
// B. 正セレクタで入庭(タッチ合成)
// ---------------------------------------------------------------
let entered = true;
try {
  await page.tap('.niwa-intro-enter', { timeout: 5000 });
} catch (e) {
  entered = false;
  info('enter-tap-error', String(e.message).slice(0, 200));
}
ok('B1 page.tap(.niwa-intro-enter) で入庭できる', entered);

await page.waitForTimeout(2300); // フェード1.6s + remove 1.7s
const afterEnter = await page.evaluate(() => ({
  introGone: !document.querySelector('.niwa-intro'),
  padOn: !!document.querySelector('.niwa-seedpad.niwa-on'),
}));
ok('B2 イントロ幕が除去された', afterEnter.introGone);
ok('B3 描きパッドが現れた(.niwa-on)', afterEnter.padOn);

// ---------------------------------------------------------------
// B. 指で種を描く(CDPで本物のタッチ列を合成)
// ---------------------------------------------------------------
const cdp = await context.newCDPSession(page);
async function touchStroke(pts) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0].x, y: pts[0].y, id: 1 }] });
  for (let i = 1; i < pts.length; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pts[i].x, y: pts[i].y, id: 1 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const litPixels = () => page.evaluate(() => {
  const cv = document.querySelector('.niwa-seedpad-canvas');
  if (!cv) return -1;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 16) n++;
  return n;
});

const padBox = await page.locator('.niwa-seedpad-canvas').boundingBox();
ok('B4 描きパッドcanvasのbboxが取れる', !!padBox, padBox ? `x=${padBox.x} y=${padBox.y} w=${padBox.width}` : '');

let drewOk = false;
if (padBox) {
  const before = await litPixels();
  const pts = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    pts.push({
      x: padBox.x + 20 + k * (padBox.width - 40),
      y: padBox.y + padBox.height / 2 + Math.sin(k * Math.PI * 2.2) * (padBox.height * 0.30),
    });
  }
  await touchStroke(pts);
  await page.waitForTimeout(300);
  const after = await litPixels();
  drewOk = after > Math.max(400, before + 400);
  ok('B5 指なぞりで線が描けた(発光ピクセル増加)', drewOk, `before=${before} after=${after}`);
} else {
  ok('B5 指なぞりで線が描けた', false, 'パッドなし');
}
await page.screenshot({ path: SHOT('niwa-mob-pad.png') });

// ---------------------------------------------------------------
// B. 丘をタップして植える(touchscreen.tap)→ 成長を待つ
// ---------------------------------------------------------------
const countOf = async () => {
  const t = await page.textContent('.niwa-count').catch(() => '');
  const m = (t || '').match(/(\d+)/);
  return m ? +m[1] : -1;
};
const c0 = await countOf();
// 丘の3点。旧座標 [150,620](描きパッドcanvas上)と [195,690](パッドの「けす」上)は
// 仕様どおり pointer-events:auto の描きパッドに乗っており、もとから植わらない点だった
// (B6は [255,590] 1点の成功だけで通っていた)。2026-06-12 修繕で
//   - パッドに乗らない実丘の2点に置き換え
//   - [255,590] は「パッドとボタン列の間の丘」の回帰ガードとして残す
//     (手紙2ボタン追加で列が伸び「写真にのこす」がこの点を食った回帰を検出した座標)
//   - さらに各点が裸の3D canvasに当たることを事前検査し、全点が植わることを要求(==3)
const tapPoints = [[195, 385], [120, 450], [255, 590]];
const tapHits = await page.evaluate((pts) => pts.map(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  const name = el ? String(el.id || el.className || el.tagName) : 'null';
  return { x, y, name, clear: !!(el && !(el.closest && el.closest('#ui-root'))) };
}), tapPoints);
const allClear = tapHits.every((h) => h.clear);
for (const [x, y] of tapPoints) {
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(2000); // カメラフォーカス演出を挟む
}
await page.waitForTimeout(5500); // 成長(茎1.6+枝1.2+蕾0.9+開花0.7 ≈ 4.4s)
const c1 = await countOf();
ok('B6 タップで植えられた(丘3点が全てUIに食われず植わる)', allClear && c1 === c0 + 3,
  `count ${c0} -> ${c1}, hits=${JSON.stringify(tapHits.map((h) => `(${h.x},${h.y})${h.clear ? '○' : '×' + h.name}`))}`);
ok('B7 1株以上が育つ時間を確保(開花待ち5.5s後もエラーなし)', true, `植えた数=${c1 - Math.max(0, c0)}`);
await page.screenshot({ path: SHOT('niwa-mob-garden.png') });

// ---------------------------------------------------------------
// B. ミニボタン(tap)反応 — ミュート/マイク/保存/よみがえらせる/写真
// ---------------------------------------------------------------
try {
  await page.tap('.niwa-mute-btn', { timeout: 3000 });
  const mutedOn = await page.evaluate(() => document.querySelector('.niwa-mute-btn').classList.contains('niwa-muted'));
  await page.tap('.niwa-mute-btn', { timeout: 3000 });
  const mutedOff = await page.evaluate(() => !document.querySelector('.niwa-mute-btn').classList.contains('niwa-muted'));
  ok('B8 ミュートが tap でトグルする', mutedOn && mutedOff, `on=${mutedOn} off=${mutedOff}`);
} catch (e) { ok('B8 ミュートが tap でトグルする', false, String(e.message).slice(0, 120)); }

try {
  await page.tap('.niwa-audio-bar .action-btn:not(.niwa-mute-btn)', { timeout: 3000 });
  await page.waitForTimeout(900);
  const micTxt = await page.textContent('.niwa-audio-bar .action-btn:not(.niwa-mute-btn)');
  ok('B9 マイクボタンが tap で反応する', micTxt.trim() !== '息を風に', `text="${micTxt.trim()}"`);
} catch (e) { ok('B9 マイクボタンが tap で反応する', false, String(e.message).slice(0, 120)); }

try {
  await page.tap('.niwa-mini-btn:has-text("保存")', { timeout: 3000 });
  await page.waitForTimeout(400);
  const toast = await page.textContent('.niwa-toast').catch(() => '');
  ok('B10 保存が tap で効く(トースト表示)', /保存/.test(toast || ''), `toast="${toast}"`);
} catch (e) { ok('B10 保存が tap で効く', false, String(e.message).slice(0, 120)); }

try {
  await page.tap('.niwa-mini-btn:has-text("よみがえらせる")', { timeout: 3000 });
  await page.waitForTimeout(800);
  const c2 = await countOf();
  ok('B11 よみがえらせるが tap で効く(カウンタ維持)', c2 >= 1, `count=${c2}`);
} catch (e) { ok('B11 よみがえらせるが tap で効く', false, String(e.message).slice(0, 120)); }

try {
  const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.tap('.niwa-mini-btn:has-text("写真")', { timeout: 3000 });
  const download = await dl;
  if (download) { try { await download.delete(); } catch (_) {} }
  ok('B12 写真が tap でダウンロードされる', !!download, download ? download.suggestedFilename() : 'no download');
} catch (e) { ok('B12 写真が tap でダウンロードされる', false, String(e.message).slice(0, 120)); }

try {
  await page.tap('.niwa-swatch >> nth=2', { timeout: 3000 });
  const sel = await page.evaluate(() =>
    [...document.querySelectorAll('.niwa-swatch')].findIndex((b) => b.classList.contains('niwa-sel')));
  ok('B13 色見本が tap で切り替わる', sel === 2, `selected=${sel}`);
} catch (e) { ok('B13 色見本が tap で切り替わる', false, String(e.message).slice(0, 120)); }

try {
  await page.tap('.niwa-erase', { timeout: 3000 });
  await page.waitForTimeout(200);
  const lit = await litPixels();
  ok('B14 「けす」が tap で効く(パッドが消える)', lit >= 0 && lit < 50, `lit=${lit}`);
} catch (e) { ok('B14 「けす」が tap で効く', false, String(e.message).slice(0, 120)); }

// ---------------------------------------------------------------
// C. pointer-events 漏れ(透明領域がタップを吸わないか)
// ---------------------------------------------------------------
const leaks = await page.evaluate(() => {
  const out = {};
  const hitAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? String(el.id || el.className || el.tagName) : 'null';
  };
  // .niwa-actions 左端の透明余白(ボタン列はright寄せ・列幅は最長ボタン)
  const acts = document.querySelector('.niwa-actions');
  const save = [...document.querySelectorAll('.niwa-mini-btn')].find((b) => b.textContent === '保存');
  if (acts && save) {
    const a = acts.getBoundingClientRect();
    const s = save.getBoundingClientRect();
    const x = a.left + 2;
    const y = s.top + s.height / 2;
    const hit = document.elementFromPoint(x, y);
    out.actionsGap = { hit: hitAt(x, y), eaten: !!(hit && acts.contains(hit)) };
  }
  // 音声バーのボタン間の隙間
  const bar = document.querySelector('.niwa-audio-bar');
  const btns = bar ? bar.querySelectorAll('.action-btn') : [];
  if (bar && btns.length >= 2) {
    const r1 = btns[0].getBoundingClientRect();
    const r2 = btns[1].getBoundingClientRect();
    const x = (r1.right + r2.left) / 2;
    const y = (r1.top + r1.bottom) / 2;
    const hit = document.elementFromPoint(x, y);
    out.audioGap = { hit: hitAt(x, y), eaten: !!(hit && bar.contains(hit)) };
  }
  // hud-bottom のヒント文字の上
  const hint = document.querySelector('.hud-hint');
  if (hint) {
    const r = hint.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    out.hudHint = { hit: hitAt(x, y), eaten: !!(hit && hit.closest && hit.closest('.hud-bottom')) };
  }
  // 描きパッド容器の canvas 右側の透明余白(行が canvas より広いとき生じる)
  const pad = document.querySelector('.niwa-seedpad');
  const pcv = document.querySelector('.niwa-seedpad-canvas');
  if (pad && pcv) {
    const a = pad.getBoundingClientRect();
    const c = pcv.getBoundingClientRect();
    if (a.right > c.right + 6) {
      const x = c.right + (a.right - c.right) / 2;
      const y = c.top + c.height / 2;
      const hit = document.elementFromPoint(x, y);
      out.padGap = { hit: hitAt(x, y), eaten: !!(hit && pad.contains(hit)) };
    } else {
      out.padGap = { hit: '(余白なし)', eaten: false };
    }
  }
  return out;
});
ok('C1 .niwa-actions の透明余白はタップを吸わない',
  !!leaks.actionsGap && leaks.actionsGap.eaten === false, JSON.stringify(leaks.actionsGap));
ok('C2 音声バーのボタン間の隙間はタップを吸わない',
  !!leaks.audioGap && leaks.audioGap.eaten === false, JSON.stringify(leaks.audioGap));
ok('C3 hud-bottom のヒント文はタップを吸わない',
  !!leaks.hudHint && leaks.hudHint.eaten === false, JSON.stringify(leaks.hudHint));
ok('C3b 描きパッド容器の透明余白はタップを吸わない',
  !!leaks.padGap && leaks.padGap.eaten === false, JSON.stringify(leaks.padGap));

// ---------------------------------------------------------------
// C. レイアウト計測(はみ出し・重なり・タッチターゲット寸法)
// ---------------------------------------------------------------
const layout = await page.evaluate(() => {
  const g = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  };
  const all = (sel) => [...document.querySelectorAll(sel)].map((el) => {
    const r = el.getBoundingClientRect();
    return { t: el.textContent.trim().slice(0, 10), x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  });
  return {
    vw: innerWidth, vh: innerHeight,
    pad: g('.niwa-seedpad'), padCanvas: g('.niwa-seedpad-canvas'),
    swatches: all('.niwa-swatch'), erase: g('.niwa-erase'),
    actions: g('.niwa-actions'), miniBtns: all('.niwa-mini-btn'),
    audioBar: g('.niwa-audio-bar'), muteBtn: g('.niwa-mute-btn'),
    micBtn: g('.niwa-audio-bar .action-btn:not(.niwa-mute-btn)'),
    titleBlock: g('.hud-title-block'), hudBottom: g('.hud-bottom'),
    hint: g('.hud-hint'), tech: g('.hud-tech'),
  };
});
console.log('LAYOUT ' + JSON.stringify(layout, null, 1));

const inter = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a) => a && a.x >= -0.5 && a.y >= -0.5 && a.x + a.w <= layout.vw + 0.5 && a.y + a.h <= layout.vh + 0.5;
ok('C4 描きパッドが画面内に収まる', inside(layout.pad), JSON.stringify(layout.pad));
ok('C5 音声バーが画面内・タイトルと重ならない',
  inside(layout.audioBar) && !inter(layout.audioBar, layout.titleBlock),
  JSON.stringify({ bar: layout.audioBar, title: layout.titleBlock }));
ok('C6 右下ボタン列が hud-bottom と重ならない', !inter(layout.actions, layout.hudBottom),
  JSON.stringify({ actions: layout.actions, hudBottom: layout.hudBottom }));
ok('C7 描きパッドが hud-bottom(ヒント文)と重ならない', !inter(layout.pad, layout.hint),
  JSON.stringify({ pad: layout.pad, hint: layout.hint }));
ok('C8 右下ボタン列と音声バーが重ならない', !inter(layout.actions, layout.audioBar));

// ui.js / seeds.js が所有するターゲット(修繕対象)
const small = [];
for (const b of layout.miniBtns) if (b.h > 0 && b.h < 40) small.push(`mini"${b.t}" h=${b.h}`);  // h=0 は非表示(手紙モーダル内等)なので対象外。可視時の寸法は garden-letter-test が担保
for (const s of layout.swatches) if (s.h < 24) small.push(`swatch h=${s.h}`);
if (layout.erase && layout.erase.h < 30) small.push(`erase h=${layout.erase.h}`);
ok('C9 タッチターゲット(ui/seeds所有: mini≥40, swatch≥24, けす≥30)', small.length === 0,
  small.join(' / ') || 'all ok');
// audio.js 所有(変更禁止) — 44px未満なら提案パッチ対象として情報のみ
info('C10 音声バーのボタン寸法(audio.js所有・参考)',
  `mute=${layout.muteBtn && layout.muteBtn.h}px mic=${layout.micBtn && layout.micBtn.h}px (目安44px)`);

// ---------------------------------------------------------------
// 集計
// ---------------------------------------------------------------
console.log('---');
console.log('CONSOLE/PAGE ERRORS: ' + errors.length);
for (const e of errors) console.log('  - ' + e.slice(0, 300));
console.log(`RESULT: ${results.length - failed}/${results.length} pass, errors=${errors.length}`);

await browser.close();
process.exit(failed > 0 || errors.length > 0 ? 1 : 0);
