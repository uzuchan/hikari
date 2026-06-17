// 全27デモを desktop で開き、3.5秒落ち着かせてスクショ。品質目視用。
import { chromium } from 'playwright';
import { readdirSync, mkdirSync } from 'fs';
mkdirSync('_check/q', { recursive: true });
const demos = readdirSync('demos').filter(f => f.endsWith('.html')).sort();
demos.push('19-niwa/index.html');
const b = await chromium.launch();
const out = [];
for (const f of demos) {
  const slug = f.replace('/index.html','').replace('.html','');
  const ctx = await b.newContext({ viewport:{width:1280,height:800} });
  const p = await ctx.newPage();
  const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)));
  try {
    await p.goto(`http://localhost:8013/demos/${f}`,{waitUntil:'networkidle',timeout:20000});
    if (f.includes('19-niwa')) { try { await p.click('.niwa-intro-enter',{timeout:4000}); await p.waitForTimeout(1500);} catch(e){} }
    await p.waitForTimeout(3500);
    await p.screenshot({ path:`_check/q/${slug}.png` });
    out.push(`${slug}: err=${errs.length}`);
  } catch(e){ out.push(`${slug}: FATAL ${String(e).slice(0,60)}`); }
  await ctx.close();
}
console.log(out.join('\n'));
await b.close();
