// ギャラリー(index.html)のスマホ実機向け検分スクリプト
// 使い方: node _check/mobile-gallery-check.mjs
// 3条件のデバイスエミュレーションで index.html を検査し、
// console error / 横はみ出し / 主要要素の bounding box / カードタップ遷移 を機械チェック、
// フルページスクリーンショットを _check/ に保存する。
// 末尾で demos/19-niwa と demos/01-planet を縦390x844で軽く抜き取り検査。
import { chromium } from 'playwright';

const BASE = 'http://localhost:8013';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

const CONDITIONS = [
  { name: 'iphone-portrait',  viewport: { width: 390, height: 844 }, dpr: 3,   ua: IPHONE_UA,  shot: '_check/mob-iphone-portrait.png' },
  { name: 'android-portrait', viewport: { width: 360, height: 800 }, dpr: 2.6, ua: ANDROID_UA, shot: '_check/mob-android-portrait.png' },
  { name: 'iphone-landscape', viewport: { width: 844, height: 390 }, dpr: 3,   ua: IPHONE_UA,  shot: '_check/mob-iphone-landscape.png' },
];

const browser = await chromium.launch();
const report = { conditions: [], demos: [] };

function attachErrorCollectors(page, sink) {
  page.on('console', m => { if (m.type() === 'error') sink.push(`console.error: ${m.text()}`); });
  page.on('pageerror', e => sink.push(`pageerror: ${e.message}`));
  page.on('requestfailed', r => {
    // フォント等CDNの失敗も記録(参考)
    sink.push(`requestfailed: ${r.url()} (${r.failure()?.errorText})`);
  });
}

async function gotoSettled(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  } catch {
    // networkidle に届かなくても続行(load 済みのはず)
  }
  await page.waitForTimeout(2200);
}

// ---------- ギャラリー3条件 ----------
for (const cond of CONDITIONS) {
  const ctx = await browser.newContext({
    viewport: cond.viewport,
    deviceScaleFactor: cond.dpr,
    isMobile: true,
    hasTouch: true,
    userAgent: cond.ua,
  });
  const page = await ctx.newPage();
  const errors = [];
  attachErrorCollectors(page, errors);

  await gotoSettled(page, `${BASE}/index.html`);

  const metrics = await page.evaluate(() => {
    const de = document.documentElement;
    const cw = de.clientWidth;
    const r2 = el => {
      const r = el.getBoundingClientRect();
      const sy = window.scrollY;
      return { x: Math.round(r.x), y: Math.round(r.y + sy), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) };
    };

    // 横はみ出し元の特定(ビューポート右端を越える要素 / 左に食み出す要素)
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > cw + 1 || r.left < -1)) {
        offenders.push({
          sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
          left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
          text: (el.textContent || '').trim().slice(0, 24),
        });
      }
    }

    // 主要要素の bounding box
    const h1 = document.querySelector('.masthead h1');
    const sub = document.querySelector('.masthead-sub');
    const groups = [...document.querySelectorAll('.group-head')].map(gh => {
      const h2 = gh.querySelector('h2');
      const tech = gh.querySelector('.group-tech');
      return { h2text: h2.textContent, h2: r2(h2), tech: r2(tech), head: r2(gh) };
    });
    const cards = [...document.querySelectorAll('a.card')].map(c => ({
      href: c.getAttribute('href'),
      box: r2(c),
      overflowR: c.getBoundingClientRect().right > cw + 1,
    }));

    // カード内 .ct タグがカード外へはみ出していないか
    const ctOverflow = [];
    for (const c of document.querySelectorAll('a.card')) {
      const cr = c.getBoundingClientRect();
      for (const t of c.querySelectorAll('.ct')) {
        const tr = t.getBoundingClientRect();
        if (tr.right > cr.right + 1) ctOverflow.push({ card: c.getAttribute('href'), tag: t.textContent.trim(), over: Math.round(tr.right - cr.right) });
      }
    }

    return {
      innerWidth, clientWidth: cw,
      scrollWidth: de.scrollWidth,
      hOverflow: de.scrollWidth > innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offenders: offenders.slice(0, 12),
      h1: h1 ? r2(h1) : null,
      sub: sub ? r2(sub) : null,
      groups, cards, ctOverflow,
      fontH1: h1 ? getComputedStyle(h1).fontSize : null,
    };
  });

  await page.screenshot({ path: cond.shot, fullPage: true });

  // カードタップで遷移できるか(最初のカード)
  let tap = { ok: false, url: '', error: '' };
  try {
    const first = page.locator('a.card').first();
    const href = await first.getAttribute('href');
    await first.tap();
    await page.waitForURL(u => u.toString().includes('demos/'), { timeout: 8000 });
    tap = { ok: true, url: page.url(), expected: href };
  } catch (e) {
    tap = { ok: false, url: page.url(), error: String(e).slice(0, 200) };
  }

  report.conditions.push({ name: cond.name, viewport: cond.viewport, errors, metrics, tap, shot: cond.shot });
  await ctx.close();
}

// ---------- demos 抜き取り (390x844 縦) ----------
const DEMO_CHECKS = [
  // 旧 clickSel '.niwa-enter, .action-btn, button' は誤セレクタ(イントロ幕下に解決しタイムアウト)と白黒判定済み
  { path: 'demos/19-niwa/index.html', shot: '_check/mob-niwa.png', clickSel: '.niwa-intro-enter', wait: 3000 },
  { path: 'demos/01-planet.html',     shot: '_check/mob-01.png',   clickSel: '',                                  wait: 4000 },
];

for (const d of DEMO_CHECKS) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, userAgent: IPHONE_UA,
  });
  const page = await ctx.newPage();
  const errors = [];
  attachErrorCollectors(page, errors);
  await gotoSettled(page, `${BASE}/${d.path}`);
  await page.waitForTimeout(d.wait);

  let clicked = '';
  if (d.clickSel) {
    try {
      const el = page.locator(d.clickSel).first();
      if (await el.count() && await el.isVisible()) {
        clicked = await el.textContent() || d.clickSel;
        await el.tap();
        await page.waitForTimeout(3000);
      }
    } catch (e) { clicked = `CLICK_FAIL: ${String(e).slice(0, 120)}`; }
  }

  // HUD のはみ出し・重なり簡易チェック
  const hud = await page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const boxes = [];
    for (const sel of ['.hud-top', '.hud-bottom', '.hud-title', '.hud-hint', '.hud-tech']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      boxes.push({ sel, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), overR: r.right > cw + 1 });
    }
    return { clientWidth: cw, scrollWidth: document.documentElement.scrollWidth, boxes };
  });

  await page.screenshot({ path: d.shot });
  report.demos.push({ path: d.path, errors, clicked, hud, shot: d.shot });
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
