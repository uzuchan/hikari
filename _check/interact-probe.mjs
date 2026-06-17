// 描画系デモに実際に線を描いて、使用時の見栄えを撮る
import { chromium } from 'playwright';
const b = await chromium.launch();
async function draw(slug, strokes) {
  const ctx = await b.newContext({ viewport:{width:1280,height:800} });
  const p = await ctx.newPage();
  const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:8013/demos/${slug}.html`,{waitUntil:'networkidle'});
  await p.waitForTimeout(1200);
  for (const s of strokes) {
    await p.mouse.move(s[0][0], s[0][1]); await p.mouse.down();
    for (let i=1;i<s.length;i++){ await p.mouse.move(s[i][0], s[i][1], {steps:6}); await p.waitForTimeout(20); }
    await p.mouse.up(); await p.waitForTimeout(500);
  }
  await p.waitForTimeout(2000);
  await p.screenshot({ path:`_check/q/${slug}-used.png` });
  await ctx.close();
  return `${slug}: err=${errs.length}`;
}
const arc=(cx,cy,r,n)=>Array.from({length:n},(_, i)=>{const a=-Math.PI*0.8+i/(n-1)*Math.PI*1.6;return [cx+Math.cos(a)*r, cy+Math.sin(a)*r];});
console.log(await draw('04-spirit', [arc(640,400,180,24)]));
console.log(await draw('08-sand', [[[300,300],[980,320]],[[320,420],[960,460]],[[400,250],[420,560]],[[760,260],[740,580]]]));
console.log(await draw('13-ito-koto', [[[300,250],[500,600]],[[600,250],[800,600]],[[850,300],[1000,550]]]));
console.log(await draw('17-mizukagami', [arc(640,250,150,24)]));
await b.close();
