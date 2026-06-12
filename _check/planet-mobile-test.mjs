// 01-planet スマホ縦レイアウト修繕の検証
// 使い方: node _check/planet-mobile-test.mjs
// 3条件(390x844 モバイル / 360x800 モバイル / 1280x800 デスクトップ回帰)で
// console error / 横はみ出し / hud-hint 幅 / hud-tech はみ出し / 縦積みと重なり / タッチターゲット を機械チェック。
// 390x844 ではタッチ操作通し(描く→送る→住人が増える→惑星ドラッグ回転)も行い、
// _check/planet-mob.png と _check/planet-desktop.png を保存する。
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const ROOT = '/Users/<redacted>/Desktop/dev/260611_hikari';
const BASE = 'http://localhost:8013';
const URL = `${BASE}/demos/01-planet.html`;
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

const CONDS = [
  { name: 'mobile 390x844 (iPhone)', viewport: { width: 390, height: 844 }, mobile: true, touchFlow: true, shot: `${ROOT}/_check/planet-mob.png` },
  { name: 'mobile 360x800',          viewport: { width: 360, height: 800 }, mobile: true },
  { name: 'desktop 1280x800 (回帰)', viewport: { width: 1280, height: 800 }, mobile: false, shot: `${ROOT}/_check/planet-desktop.png` },
];

await ensureServer();
const browser = await chromium.launch();
let failures = 0;

for (const cond of CONDS) {
  const ctx = await browser.newContext({
    viewport: cond.viewport,
    ...(cond.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: IPHONE_UA } : {}),
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));

  try { await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 }); } catch { /* load済みなら続行 */ }
  await page.waitForTimeout(1800);

  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const r = s => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, w: b.width, h: b.height };
    };
    let techTagMaxRight = -1;
    document.querySelectorAll('.hud-tech .tech-tag').forEach(t => {
      techTagMaxRight = Math.max(techTagMaxRight, t.getBoundingClientRect().right);
    });
    return {
      vw: innerWidth, vh: innerHeight,
      scrollW: Math.max(de.scrollWidth, document.body.scrollWidth),
      hint: r('.hud-hint'), tech: r('.hud-tech'), techTagMaxRight,
      world: r('.world'), pad: r('.pad-col'), hud: r('.hud-bottom'),
      draw: r('#draw'), swatch: r('.swatch'), send: r('#send'),
      mintLeft: !!document.querySelector('[data-c="#b8ffc2"]'),
      violetIn: !!document.querySelector('[data-c="#c9a8ff"]'),
      dwellers: (typeof dwellers !== 'undefined') ? dwellers.length : -1,
    };
  });

  const checks = [];
  const ok = (name, pass, detail = '') => { checks.push({ name, pass, detail }); if (!pass) failures++; };

  ok('console/pageerror 0件', errors.length === 0, errors.slice(0, 3).join(' | '));
  ok('横はみ出しなし (scrollWidth<=vw)', m.scrollW <= m.vw, `scrollW=${m.scrollW} vw=${m.vw}`);
  ok('.hud-hint が普通の横書き幅 (>=180px)', !!m.hint && m.hint.w >= 180, `w=${m.hint && Math.round(m.hint.w)}`);
  ok('.hud-tech 右はみ出し(overR)なし', !!m.tech && m.tech.right <= m.vw + 0.5 && m.techTagMaxRight <= m.vw + 0.5,
    `tech.right=${m.tech && Math.round(m.tech.right)} tagMaxRight=${Math.round(m.techTagMaxRight)}`);
  ok('PALETTE: #b8ffc2 撤去 / #c9a8ff 採用', !m.mintLeft && m.violetIn);
  ok('Three.js 起動 (seed住人あり)', m.dwellers >= 1, `dwellers=${m.dwellers}`);

  if (cond.mobile) {
    ok('縦積み: 惑星(world)が上・iPad(pad-col)が下', m.world.bottom <= m.pad.top + 2 && m.world.top < m.pad.top,
      `world.bottom=${Math.round(m.world.bottom)} pad.top=${Math.round(m.pad.top)}`);
    ok('縦積み: pad-col と hud-bottom が重ならない', m.pad.bottom <= m.hud.top + 2,
      `pad.bottom=${Math.round(m.pad.bottom)} hud.top=${Math.round(m.hud.top)}`);
    ok('hud-bottom が画面内に収まる', m.hud.bottom <= m.vh + 1, `hud.bottom=${Math.round(m.hud.bottom)} vh=${m.vh}`);
    ok('惑星がおおよそ上半分 (>=40%)', m.world.h >= m.vh * 0.40, `worldH=${Math.round(m.world.h)} (${Math.round(m.world.h / m.vh * 100)}%)`);
    ok('#draw 正方形維持', Math.abs(m.draw.w - m.draw.h) < 2, `${Math.round(m.draw.w)}x${Math.round(m.draw.h)}`);
    ok('スウォッチ指サイズ (>=36px)', m.swatch.w >= 36 && m.swatch.h >= 36, `${Math.round(m.swatch.w)}x${Math.round(m.swatch.h)}`);
    ok('送るボタン指サイズ (高さ>=38px)', m.send.h >= 38, `h=${Math.round(m.send.h)}`);
  } else {
    ok('デスクトップ回帰: 左pad-col(360px) + 右worldの2カラム維持',
      m.pad.left < 10 && Math.round(m.pad.w) === 360 && m.world.left >= 350 && m.world.h >= m.vh - 2,
      `pad=${Math.round(m.pad.w)}px world.left=${Math.round(m.world.left)} worldH=${Math.round(m.world.h)}`);
  }

  // ---------- 390x844 タッチ操作通し ----------
  if (cond.touchFlow) {
    const cdp = await ctx.newCDPSession(page);
    async function touchStroke(points) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: points[0][0], y: points[0][1] }] });
      for (const [x, y] of points.slice(1)) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }

    // 1) #draw に指で丸を描く
    const d = m.draw;
    const cx0 = d.left + d.w / 2, cy0 = d.top + d.h / 2, rad = Math.min(d.w, d.h) * 0.3;
    const circle = [];
    for (let a = 0; a <= Math.PI * 2 + 0.15; a += Math.PI / 10) circle.push([cx0 + Math.cos(a) * rad, cy0 + Math.sin(a) * rad]);
    await touchStroke(circle);
    const inked = await page.evaluate(() => (typeof hasInk !== 'undefined') ? hasInk : null);
    ok('タッチで #draw に描ける (hasInk=true)', inked === true, `hasInk=${inked}`);

    // 2) 「惑星へ送る」をタップ → 住人が増える
    const before = await page.evaluate(() => dwellers.length);
    await page.tap('#send');
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => dwellers.length);
    ok('「惑星へ送る」で住人が惑星に出る', after === before + 1, `dwellers ${before} -> ${after}`);
    const cleared = await page.evaluate(() => hasInk);
    ok('送信後パッドがクリアされる', cleared === false, `hasInk=${cleared}`);

    // 3) 惑星を指ドラッグで回す
    const w = m.world;
    const ry0 = await page.evaluate(() => world.rotation.y);
    const dragPts = [];
    for (let i = 0; i <= 10; i++) dragPts.push([w.left + w.w * 0.72 - i * 14, w.top + w.h * 0.55]);
    await touchStroke(dragPts);
    await page.waitForTimeout(250);
    const ry1 = await page.evaluate(() => world.rotation.y);
    ok('惑星ドラッグで回転する', ry1 < ry0 - 0.2, `rotation.y ${ry0.toFixed(3)} -> ${ry1.toFixed(3)}`);
    ok('タッチ通しでもエラー0件', errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.waitForTimeout(900); // pop が消えてから撮影
  }

  if (cond.shot) await page.screenshot({ path: cond.shot });

  console.log(`\n=== ${cond.name} ===`);
  for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\nFAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
