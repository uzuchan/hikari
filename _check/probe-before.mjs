import { chromium } from 'playwright';
const browser = await chromium.launch();

// --- 15-wataridori mobile before shot ---
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8013/demos/15-wataridori.html');
  await page.waitForTimeout(1200);
  // measure title block bottom vs label top
  const m = await page.evaluate(() => {
    const tb = document.querySelector('.hud-title-block').getBoundingClientRect();
    const la = document.querySelector('.sky-left').getBoundingClientRect();
    return { titleBottom: tb.bottom, titleRight: tb.right, labelTop: la.top, labelLeft: la.left, labelRight: la.right, gap: la.top - tb.bottom };
  });
  console.log('15 mobile metrics BEFORE:', JSON.stringify(m));
  await page.screenshot({ path: '_check/polish-15-before.png' });
  await ctx.close();
}

// --- 09 double-tap probe (touch emulation) ---
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8013/demos/09-constellation.html');
  await page.waitForTimeout(800);
  // pick 3 real stars to tap (CSS px)
  const pts = await page.evaluate(() => stars.slice(0, 40).filter(s => s.y > 150*DPR && s.y < (innerHeight-150)*DPR).slice(0,3).map(s => ({ x: s.x/DPR, y: s.y/DPR })));
  console.log('09 stars to tap:', JSON.stringify(pts));
  const cdp = await ctx.newCDPSession(page);
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  for (const p of pts) { await tap(p.x, p.y); await page.waitForTimeout(350); }
  const chainLen = await page.evaluate(() => chain.length);
  // double tap at last star
  await tap(pts[2].x, pts[2].y); await page.waitForTimeout(120); await tap(pts[2].x, pts[2].y);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ chain: chain.length, beasts: beasts.length }));
  console.log(`09 BEFORE: chain after 3 taps=${chainLen}, after double-tap: chain=${after.chain} beasts=${after.beasts} (beasts=0 → dblclickはタッチで死んでいる)`);
  console.log('09 console errors:', errors.length);
  await ctx.close();
}
await browser.close();
