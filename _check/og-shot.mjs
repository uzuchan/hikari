// og.png 撮影: ギャラリーのヒーロー部（星空 + タイトル hikari）を 1200×630 で収める。
// 撮影専用のスタイル注入でマストヘッドを天地中央へ（サイト本体は無改変）。
// DSF2 で撮り、後段の sips で 1200×630 に縮小して文字を滑らかにする。
import { chromium } from 'playwright';

const BASE = 'http://localhost:8013';
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });

// 撮影専用レイアウト: カード群と脚注を消し、マストヘッドだけを天地中央に
await page.addStyleTag({ content: `
  .wrap { padding: 0 32px !important; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  header.masthead { margin-bottom: 0 !important; }
  section.group, footer.note { display: none !important; }
`});

await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(900); // 星のまたたきが落ち着いた1フレームを待つ

await page.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/assets/og.png' });

// ついでに favicon.svg を 128px でラスタライズして目視用に
const fav = await browser.newPage({ viewport: { width: 128, height: 128 } });
await fav.goto(`${BASE}/assets/favicon.svg`);
await fav.waitForTimeout(200);
await fav.screenshot({ path: '/Users/<redacted>/Desktop/dev/260611_hikari/_check/favicon-check.png' });

await browser.close();
console.log('og.png captured. console/page errors during shot:', errors.length, errors);
