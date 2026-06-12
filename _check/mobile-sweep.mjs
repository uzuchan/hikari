// demos 02〜18 スマホ縦画面(390x844, DPR3)全数検分スクリプト — 調査のみ・修正なし
// 使い方: node _check/mobile-sweep.mjs
// 各デモで console error 収集 + 機械チェック(横はみ出し/HUD寸法/重なり/ボタン寸法/固定幅疑い)
// + スクリーンショット _check/mob-sweep/NN.png 保存。最後に JSON レポートを出力。
import { chromium } from 'playwright';
import { mkdirSync, readdirSync } from 'fs';

const ROOT = '/Users/<redacted>/Desktop/dev/260611_hikari';
const BASE = 'http://localhost:8013';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

// demos/*.html を自動列挙(新作を足し忘れない)。19-niwa はディレクトリ構成のため対象外(専用スイートが担当)
const DEMOS = readdirSync('demos').filter(f => f.endsWith('.html')).map(f => f.replace('.html', '')).sort();
// マイク/カメラ起点のデモ: ボタンは押さない(中央タップ・ドラッグも誤爆防止で省略)
const MEDIA = new Set(['03-breath', '05-mirror', '07-pond', '12-nebula']);

mkdirSync(`${ROOT}/_check/mob-sweep`, { recursive: true });

const browser = await chromium.launch();
const report = [];

for (const slug of DEMOS) {
  const nn = slug.slice(0, 2);
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_UA,
  });
  const page = await ctx.newPage();
  const errors = [];
  const netFails = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', r => netFails.push(`${r.url()} (${r.failure()?.errorText})`));

  let navNote = '';
  try {
    await page.goto(`${BASE}/demos/${slug}.html`, { waitUntil: 'networkidle', timeout: 20000 });
  } catch (e) {
    navNote = `networkidle未達(続行): ${String(e).slice(0, 100)}`;
  }
  await page.waitForTimeout(8000); // 約8秒放置して定常状態に

  // ---------- 機械チェック ----------
  let metrics = null;
  try {
    metrics = await page.evaluate(() => {
      const cw = innerWidth, ch = innerHeight;
      const de = document.documentElement;
      const rect = el => {
        const r = el.getBoundingClientRect();
        return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) };
      };
      const tag = el => el.tagName.toLowerCase()
        + (el.id ? '#' + el.id : '')
        + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
      const inter = (a, b) => {
        const x = Math.min(a.right, b.right) - Math.max(a.x, b.x);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
        return (x > 2 && y > 2) ? { w: Math.round(x), h: Math.round(y) } : null;
      };

      // 1) 横はみ出し
      const hOverflow = de.scrollWidth > cw + 1 || document.body.scrollWidth > cw + 1;

      // 2) hud-hint 幅 / hud-tech 右はみ出し
      const hintEl = document.querySelector('.hud-hint');
      const hint = hintEl ? rect(hintEl) : null;
      const hintText = hintEl ? (hintEl.textContent || '').trim() : '';
      const techEl = document.querySelector('.hud-tech');
      const tech = techEl ? rect(techEl) : null;
      const techOverR = tech ? tech.right > cw + 1 : false;

      // 3) hud-top / hud-bottom 内要素の画面外・相互重なり
      const offscreen = [];
      const overlaps = [];
      for (const hudSel of ['.hud-top', '.hud-bottom']) {
        const hud = document.querySelector(hudSel);
        if (!hud) continue;
        const boxes = [...hud.children]
          .filter(k => k.getBoundingClientRect().width > 0)
          .map(k => ({ el: tag(k), box: rect(k) }));
        for (const b of boxes) {
          if (b.box.right > cw + 1 || b.box.x < -1 || b.box.bottom > ch + 1 || b.box.y < -1)
            offscreen.push({ hud: hudSel, el: b.el, box: b.box });
        }
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const ov = inter(boxes[i].box, boxes[j].box);
            if (ov) overlaps.push({ hud: hudSel, a: boxes[i].el, b: boxes[j].el, ov });
          }
      }
      if (hint && tech) {
        const ov = inter(hint, tech);
        if (ov) overlaps.push({ hud: 'hint×tech(明示)', a: '.hud-hint', b: '.hud-tech', ov });
      }

      // 4) ボタン寸法・押せる状態か(elementFromPoint ヒットテスト)
      const buttons = [...document.querySelectorAll('button, .action-btn, [role="button"]')].map(b => {
        const r = rect(b);
        const cs = getComputedStyle(b);
        const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity !== 0 && r.w > 0 && r.h > 0;
        let hit = false;
        if (visible) {
          const px = Math.min(cw - 1, Math.max(0, r.x + r.w / 2));
          const py = Math.min(ch - 1, Math.max(0, r.y + r.h / 2));
          const e = document.elementFromPoint(px, py);
          hit = !!e && (e === b || b.contains(e));
        }
        return { el: tag(b), text: (b.textContent || '').trim().slice(0, 24), box: r, visible, hit, tooSmall: visible && r.h < 36 };
      });

      // 5) 固定幅疑い: 幅>340px の block/flex/grid 要素で、viewportにほぼ収まっていないもの
      const fixedWidthSuspects = [];
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (!/block|flex|grid/.test(cs.display)) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 340) continue;
        const fullBleed = r.width >= cw * 0.95 && r.width <= cw * 1.02 && r.left >= -2 && r.right <= cw + 2;
        if (fullBleed) continue; // 100%幅の意図的な要素は除外
        if (r.right > cw + 1 || r.width > cw + 1 || r.left < -1) {
          fixedWidthSuspects.push({ el: tag(el), cssWidth: cs.width, left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
        }
      }

      // 6) 横はみ出し犯の一般リスト(診断用)
      const offenders = [];
      if (hOverflow || fixedWidthSuspects.length) {
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.right > cw + 1 || r.left < -1)) {
            offenders.push({ el: tag(el), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), text: (el.textContent || '').trim().slice(0, 18) });
          }
        }
      }

      return {
        cw, ch,
        scrollWidth: de.scrollWidth, bodyScrollWidth: document.body.scrollWidth,
        hOverflow,
        hint, hintText: hintText.slice(0, 60), hintNarrow: !!hint && hint.w < 100,
        tech, techOverR,
        hudTop: document.querySelector('.hud-top') ? rect(document.querySelector('.hud-top')) : null,
        hudTitle: document.querySelector('.hud-title') ? rect(document.querySelector('.hud-title')) : null,
        offscreen, overlaps, buttons,
        fixedWidthSuspects: fixedWidthSuspects.slice(0, 8),
        offenders: offenders.slice(0, 10),
      };
    });
  } catch (e) {
    navNote += ` | evaluate失敗: ${String(e).slice(0, 150)}`;
  }

  // ---------- スクリーンショット(定常状態・ビューポート1枚) ----------
  await page.screenshot({ path: `${ROOT}/_check/mob-sweep/${nn}.png` });

  // ---------- 軽い操作(メディア系以外): 中央タップ + 小ドラッグでエラー誘発確認 ----------
  const errBefore = errors.length;
  if (!MEDIA.has(slug)) {
    try {
      await page.touchscreen.tap(195, 420);
      await page.waitForTimeout(400);
      await page.mouse.move(140, 380);
      await page.mouse.down();
      await page.mouse.move(250, 460, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(1200);
    } catch (e) {
      errors.push(`INTERACT_FAIL: ${String(e).slice(0, 150)}`);
    }
  }
  const interactErrors = errors.slice(errBefore);

  report.push({
    nn, slug, navNote,
    errors: [...new Set(errors)],
    interactErrors: [...new Set(interactErrors)],
    netFails: [...new Set(netFails)].slice(0, 5),
    metrics,
    shot: `_check/mob-sweep/${nn}.png`,
  });
  await ctx.close();
  process.stderr.write(`done ${slug} (errors: ${[...new Set(errors)].length})\n`);
}

await browser.close();

// ---------- サマリ ----------
console.log('===== MOBILE SWEEP SUMMARY (390x844) =====');
for (const r of report) {
  const m = r.metrics || {};
  const flags = [
    r.errors.length ? `ERR:${r.errors.length}` : 'err0',
    m.hOverflow ? 'H-OVERFLOW' : 'ok',
    m.hint ? `hint:${m.hint.w}px${m.hintNarrow ? '(NARROW)' : ''}` : 'hint:なし',
    m.techOverR ? 'TECH-OVER-R' : 'tech:ok',
    (m.overlaps || []).length ? `overlap:${m.overlaps.length}` : '',
    (m.offscreen || []).length ? `offscreen:${m.offscreen.length}` : '',
    (m.buttons || []).some(b => b.tooSmall) ? 'BTN-SMALL' : '',
    (m.fixedWidthSuspects || []).length ? `fixedW:${m.fixedWidthSuspects.length}` : '',
  ].filter(Boolean).join(' | ');
  console.log(`${r.nn} ${r.slug}: ${flags}`);
}
console.log('\n===== FULL JSON =====');
console.log(JSON.stringify(report, null, 1));
