// 庭の手紙 検証: 3株植えて手紙に → 新しい文脈でURLハッシュ開封 / 貼り付け開封 / 壊れた手紙
// サーバは http://localhost:8013 を再利用（並走テストと共有可）。なければ自前で起動。
import { chromium } from 'playwright';
import http from 'http';
import { spawn } from 'child_process';

const BASE = 'http://localhost:8013';
const URL_ = BASE + '/demos/19-niwa/index.html';

async function ensureServer() {
  const alive = await new Promise((res) => {
    const rq = http.get(BASE + '/index.html', (r) => { r.resume(); res(r.statusCode === 200); });
    rq.on('error', () => res(false));
    rq.setTimeout(1500, () => { rq.destroy(); res(false); });
  });
  if (alive) return null;
  const proc = spawn('python3', ['-m', 'http.server', '8013', '--directory', '/Users/<redacted>/Desktop/dev/260611_hikari'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1500));
  return proc;
}

// 手紙コードを Node 側で復号（形式: "n1." + base64url(JSON [[x,z,ci,h,b,s],…])）
function decodeLetter(code) {
  let b = code.slice(3).replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  return JSON.parse(Buffer.from(b, 'base64').toString('utf8'));
}

const serverProc = await ensureServer();
const browser = await chromium.launch();
const errors = [];
const track = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] PAGEERROR: ${e.message}`));
};
const plantCount = async (page) => {
  const txt = await page.textContent('.niwa-count').catch(() => '');
  const m = (txt || '').match(/(\d+)/);
  return m ? +m[1] : -1;
};
const fails = [];
const expect = (cond, label) => { console.log((cond ? 'ok  ' : 'NG  ') + label); if (!cond) fails.push(label); };

// ============ A: 庭をつくり、手紙を書く ============
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pA = await ctxA.newPage(); track(pA, 'A');
await pA.goto(URL_, { waitUntil: 'networkidle', timeout: 30000 });
await pA.waitForTimeout(3500);
await pA.click('text=庭へ入る');
await pA.waitForTimeout(2500);

// 種を描く（初期色 = PALETTE[0]）→ 丘の3か所に植える
const pad = await pA.$('.niwa-seedpad-canvas');
if (!pad) { console.log('FATAL: seedpad not found'); process.exit(1); }
const b = await pad.boundingBox();
await pA.mouse.move(b.x + 28, b.y + 110);
await pA.mouse.down();
for (let i = 0; i < 13; i++) {
  await pA.mouse.move(b.x + 28 + i * 9, b.y + 110 + Math.sin(i * 0.9) * 42, { steps: 2 });
}
await pA.mouse.up();
for (const [x, y] of [[640, 480], [520, 560], [780, 520]]) {
  await pA.mouse.click(x, y, { delay: 40 });
  await pA.waitForTimeout(900);
}
await pA.waitForTimeout(800);
const countA = await plantCount(pA);
expect(countA === 3, `A: 3株植えた (count=${countA})`);

// 「庭を手紙に」→ モーダルからコードとリンクを取得
await pA.click('.niwa-actions >> text=庭を手紙に');
await pA.waitForTimeout(700);
const code = await pA.inputValue('.niwa-letter-code');
const link = await pA.inputValue('.niwa-letter-link');
expect(code.startsWith('n1.'), `A: コードが n1. で始まる (${code.slice(0, 24)}…)`);
expect(link.includes('#garden=' + code), 'A: リンク行に #garden=コード を併記');
const rowsA = decodeLetter(code);
console.log('    code:', code);
console.log('    rowsA:', JSON.stringify(rowsA));
expect(rowsA.length === 3, `A: コードは3株ぶん (rows=${rowsA.length})`);
await pA.screenshot({ path: '_check/n10-letter.png' });
await pA.click('.niwa-letter-write >> text=とじる');
await pA.waitForTimeout(300);
await ctxA.close();

// ============ B: 新しい文脈（localStorage空）で URL ハッシュから自動開封 ============
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pB = await ctxB.newPage(); track(pB, 'B');
await pB.goto(URL_ + '#garden=' + code, { waitUntil: 'networkidle', timeout: 30000 });
await pB.waitForTimeout(3500);
const storedB = await pB.evaluate(() => localStorage.getItem('niwa-garden-v1'));
expect(storedB === null, 'B: localStorage は空（まっさらな受け取り手）');
await pB.click('text=庭へ入る');
await pB.waitForTimeout(3000);   // 入庭後 900ms で自動開封
const countB = await plantCount(pB);
const toastB = await pB.textContent('.niwa-toast');
const hashB = await pB.evaluate(() => location.hash);
expect(countB === 3, `B: 自動開封で3株咲いた (count=${countB})`);
expect((toastB || '').includes('とどいた庭'), `B: トースト「とどいた庭がひらきました」 (got: ${toastB})`);
expect(hashB === '', `B: ハッシュは履歴に残らない (hash="${hashB}")`);
await pB.waitForTimeout(1500);
await pB.screenshot({ path: '_check/n10-letter-opened.png' });

// B から再び手紙にして、数・色が一致することを確認
await pB.click('.niwa-actions >> text=庭を手紙に');
await pB.waitForTimeout(700);
const codeB = await pB.inputValue('.niwa-letter-code');
const rowsB = decodeLetter(codeB);
console.log('    rowsB:', JSON.stringify(rowsB));
expect(rowsB.length === 3, `B: 再手紙も3株 (rows=${rowsB.length})`);
expect(rowsA.map((r) => r[2]).join() === rowsB.map((r) => r[2]).join(),
  `B: 色(colorIdx)が一致 [${rowsA.map((r) => r[2])}] = [${rowsB.map((r) => r[2])}]`);
expect(codeB === code, 'B: 再エクスポートのコードが完全一致（往復で無劣化）');
await pB.click('.niwa-letter-write >> text=とじる');
await ctxB.close();

// ============ C: 素の状態で貼り付け開封 → 壊れた手紙は優しく断る ============
const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pC = await ctxC.newPage(); track(pC, 'C');
await pC.goto(URL_, { waitUntil: 'networkidle', timeout: 30000 });
await pC.waitForTimeout(3500);
await pC.click('text=庭へ入る');
await pC.waitForTimeout(2000);
await pC.click('.niwa-actions >> text=手紙をひらく');
await pC.fill('.niwa-letter-paste', code);
await pC.click('.niwa-letter-open >> text=咲かせる');
await pC.waitForTimeout(1000);
const countC = await plantCount(pC);
const openVisC = await pC.isVisible('.niwa-letter-open');
expect(countC === 3, `C: 貼り付け→咲かせるで3株 (count=${countC})`);
expect(!openVisC, 'C: 開封成功でモーダルがとじる');

// 壊れたコード — 断られ、庭は無傷、console error 0 のまま
const errsBefore = errors.length;
await pC.click('.niwa-actions >> text=手紙をひらく');
await pC.fill('.niwa-letter-paste', 'n1.xxxx');
await pC.click('.niwa-letter-open >> text=咲かせる');
await pC.waitForTimeout(800);
const toastC = await pC.textContent('.niwa-toast');
const countC2 = await plantCount(pC);
expect((toastC || '').includes('読めない手紙'), `C: 壊れた手紙は「読めない手紙」と断る (got: ${toastC})`);
expect(countC2 === 3, `C: 壊れた手紙でも庭は無傷 (count=${countC2})`);
expect(errors.length === errsBefore, 'C: 壊れた手紙で console error が増えない');
await pC.click('.niwa-letter-open >> text=とじる');
await ctxC.close();

// ============ D: モバイル(390×844) — モーダルが収まる・空の庭は手紙にしない ============
const ctxD = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const pD = await ctxD.newPage(); track(pD, 'D');
await pD.goto(URL_, { waitUntil: 'networkidle', timeout: 30000 });
await pD.waitForTimeout(3500);
await pD.click('text=庭へ入る');
await pD.waitForTimeout(2000);
await pD.click('.niwa-actions >> text=庭を手紙に');   // 空の庭
await pD.waitForTimeout(500);
const toastD = await pD.textContent('.niwa-toast');
const writeVisD = await pD.isVisible('.niwa-letter-write');
expect((toastD || '').includes('まだ手紙にする花が'), `D: 空の庭は「まだ手紙にする花がありません」 (got: ${toastD})`);
expect(!writeVisD, 'D: 空の庭ではモーダルを開かない');
await pD.click('.niwa-actions >> text=手紙をひらく');
await pD.waitForTimeout(500);
const box = await pD.locator('.niwa-letter-open .niwa-letter-panel').boundingBox();
const fits = box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844;
expect(fits, `D: モバイルでモーダルが画面内 (${box && Math.round(box.width)}x${box && Math.round(box.height)})`);
await pD.screenshot({ path: '_check/n10-letter-mob.png' });
await ctxD.close();

await browser.close();
if (serverProc) { try { serverProc.kill(); } catch (e) {} }

console.log('---');
console.log('CONSOLE/PAGE ERRORS:', errors.length);
errors.forEach((e) => console.log(' -', e.slice(0, 240)));
if (errors.length) fails.push('console errors');
console.log(fails.length ? `FAIL (${fails.length}): ${fails.join(' / ')}` : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
