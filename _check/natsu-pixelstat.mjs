// natsu 磨きの定量比較 — スクショ2枚の「暖色(金)発光ピクセル」を数えて存在感の差を測る
// 使い方: node _check/natsu-pixelstat.mjs n9-natsu-before.png n9-natsu.png
// 判定: 金(#ffd98a)系 = r-b>25 かつ g-b>10 かつ r>120(星の白・光塵の青紫は弾かれる)
import { chromium } from 'playwright';

const files = process.argv.slice(2);
if (files.length < 2) { console.log('usage: node natsu-pixelstat.mjs <before.png> <after.png>'); process.exit(2); }

const browser = await chromium.launch();
const page = await browser.newPage();
const stats = [];
for (const f of files) {
  const s = await page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let warm = 0, warmLum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r > 120 && r - b > 25 && gg - b > 10) { warm++; warmLum += r + gg + b; }
    }
    return { warm, warmLum, px: c.width * c.height };
  }, 'http://localhost:8013/_check/' + f);
  stats.push(s);
  console.log(`${f}: 暖色発光 ${s.warm}px (${(100 * s.warm / s.px).toFixed(3)}%)  輝度和 ${s.warmLum}`);
}
await browser.close();
const ratio = stats[0].warm ? (stats[1].warm / stats[0].warm).toFixed(2) : 'inf';
console.log(`RATIO after/before = x${ratio}`);
