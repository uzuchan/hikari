// 光の庭 — ui.js
// intro オーバーレイ / HUD / 保存・読込 / 植物カウンタ
// 連携はすべて ctx（bus / state）経由。他モジュールは import しない。

const STYLE = `
.niwa-intro {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 26px;
  background: radial-gradient(ellipse at 50% 62%, rgba(20, 20, 34, 0.92), rgba(10, 10, 15, 0.985) 70%);
  opacity: 1;
  transition: opacity 1.6s ease;
}
.niwa-intro.niwa-fading { opacity: 0; pointer-events: none; }
.niwa-intro-title {
  font-family: var(--serif, serif);
  font-weight: 500;
  font-size: clamp(34px, 7vw, 56px);
  letter-spacing: 0.32em;
  text-indent: 0.32em;
  color: var(--glow-white, #f4f2ec);
  text-shadow: 0 0 28px rgba(244, 242, 236, 0.5), 0 0 80px rgba(201, 168, 255, 0.25);
  animation: niwa-breathe 5.2s ease-in-out infinite;
}
@keyframes niwa-breathe {
  0%, 100% { text-shadow: 0 0 24px rgba(244, 242, 236, 0.4), 0 0 70px rgba(201, 168, 255, 0.18); }
  50%      { text-shadow: 0 0 36px rgba(244, 242, 236, 0.6), 0 0 100px rgba(201, 168, 255, 0.32); }
}
.niwa-intro-line {
  font-size: 13px;
  letter-spacing: 0.22em;
  line-height: 2.1;
  color: rgba(244, 242, 236, 0.55);
  text-align: center;
}
.niwa-intro-enter {
  margin-top: 10px;
  font-family: var(--serif, serif);
  font-size: 14px;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  color: var(--glow-gold, #ffd98a);
  background: transparent;
  border: 1px solid rgba(255, 217, 138, 0.45);
  border-radius: 999px;
  padding: 13px 40px;
  cursor: pointer;
  transition: background 0.4s, box-shadow 0.4s, color 0.4s;
}
.niwa-intro-enter:hover {
  background: rgba(255, 217, 138, 0.08);
  box-shadow: 0 0 32px rgba(255, 217, 138, 0.25);
}
.niwa-hud {
  transition: opacity 1.2s ease;
}
.niwa-hud.niwa-dimmed { opacity: 0.25; }
.niwa-actions {
  position: fixed;
  right: 26px;
  bottom: 118px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none;
}
.niwa-mini-btn {
  pointer-events: auto;
  font-family: var(--sans, sans-serif);
  font-size: 11px;
  letter-spacing: 0.18em;
  color: var(--dim, rgba(244, 242, 236, 0.45));
  background: rgba(244, 242, 236, 0.04);
  border: 1px solid rgba(244, 242, 236, 0.18);
  border-radius: 999px;
  padding: 6px 16px;
  cursor: pointer;
  transition: color 0.3s, border-color 0.3s, box-shadow 0.3s;
}
.niwa-mini-btn:hover {
  color: var(--glow-white, #f4f2ec);
  border-color: rgba(244, 242, 236, 0.4);
  box-shadow: 0 0 18px rgba(244, 242, 236, 0.12);
}
/* 手紙の2ボタンの包み。デスクトップは contents で「縦積みのまま」(見た目不変) */
.niwa-actions-pair { display: contents; }
.niwa-count {
  font-family: var(--serif, serif);
  font-size: 11px;
  letter-spacing: 0.2em;
  color: var(--dimmer, rgba(244, 242, 236, 0.25));
  padding: 4px 2px;
}
.niwa-toast {
  position: fixed;
  left: 50%;
  bottom: 132px;
  transform: translateX(-50%);
  z-index: 60; /* 手紙モーダル(45)の上でも読めるように */
  font-family: var(--serif, serif);
  font-size: 13px;
  letter-spacing: 0.22em;
  color: var(--glow-gold, #ffd98a);
  text-shadow: 0 0 18px rgba(255, 217, 138, 0.4);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.7s ease;
}
.niwa-toast.niwa-show { opacity: 1; }
/* --- 庭の手紙（書く / ひらく モーダル） --- */
.niwa-letter {
  position: fixed;
  inset: 0;
  z-index: 45;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(6, 6, 10, 0.62);
  backdrop-filter: blur(3px);
}
.niwa-letter-panel {
  width: min(92vw, 540px);
  max-height: 86vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 13px;
  background: rgba(12, 12, 19, 0.94);
  border: 1px solid rgba(244, 242, 236, 0.16);
  border-radius: 18px;
  padding: 26px 28px;
  box-shadow: 0 0 70px rgba(0, 0, 0, 0.65), 0 0 44px rgba(201, 168, 255, 0.07);
}
.niwa-letter-title {
  font-family: var(--serif, serif);
  font-size: 18px;
  letter-spacing: 0.3em;
  color: var(--glow-gold, #ffd98a);
  text-shadow: 0 0 16px rgba(255, 217, 138, 0.35);
}
.niwa-letter-line {
  font-size: 11.5px;
  letter-spacing: 0.14em;
  line-height: 1.9;
  color: var(--dim, rgba(244, 242, 236, 0.45));
}
.niwa-letter-label {
  font-size: 10px;
  letter-spacing: 0.25em;
  color: var(--dimmer, rgba(244, 242, 236, 0.25));
  margin-bottom: 5px;
}
.niwa-letter-row { display: flex; align-items: flex-end; gap: 8px; }
.niwa-letter-ta {
  flex: 1;
  width: 100%;
  min-width: 0;
  resize: none;
  outline: none;
  display: block;
  background: rgba(244, 242, 236, 0.045);
  border: 1px solid rgba(244, 242, 236, 0.15);
  border-radius: 10px;
  padding: 9px 11px;
  color: var(--glow-cyan, #8ce8ff);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.65;
  letter-spacing: 0.03em;
  word-break: break-all;
}
.niwa-letter-ta::placeholder { color: rgba(244, 242, 236, 0.22); }
.niwa-letter-ta:focus { border-color: rgba(140, 232, 255, 0.4); }
.niwa-letter-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
.niwa-letter-bloom { color: var(--glow-gold, #ffd98a); border-color: rgba(255, 217, 138, 0.45); }
.niwa-letter-bloom:hover {
  color: var(--glow-gold, #ffd98a);
  border-color: rgba(255, 217, 138, 0.75);
  box-shadow: 0 0 18px rgba(255, 217, 138, 0.22);
}
/* --- スマホ縦(〜480px)。重なり回避とタッチターゲット拡大。デスクトップは不変 --- */
@media (max-width: 480px) {
  /* 音声バー(audio.jsが top:70/right:26 に置く)と「PROTOTYPE 19」が重ならないよう短く */
  .niwa-hud .hud-no { font-size: 10px; letter-spacing: 0.2em; }
  .niwa-hud .hud-title { font-size: 22px; }
  /* もどるリンクの指あたりを広く(レイアウトはほぼ不変) */
  .niwa-hud .hud-back { padding: 8px 12px 8px 0; margin-bottom: 2px; }
  /* ミニボタンを指で押せる大きさ(44px目安)に */
  .niwa-mini-btn { font-size: 12px; padding: 11px 18px; min-height: 42px; }
  /* hud-bottom(ヒント・タグ)に接しないよう少し上へ */
  .niwa-actions { bottom: 136px; }
  /* 手紙の2ボタンは横並び1行に圧縮(5段→4段)。列が伸びて丘のタップ領域を
     塞いだ回帰の修繕: 列の上端を下げ、保存(細い)の段の左に開けた丘を返す。
     幅は描きパッド(右端194px)に触れない163px程度に収める。min-height 42 は維持 */
  .niwa-count { order: -2; }
  .niwa-actions-pair { display: flex; gap: 6px; order: -1; }
  .niwa-actions-pair .niwa-mini-btn {
    font-size: 11px;
    letter-spacing: 0.1em;
    padding: 11px 5px;
    white-space: nowrap;
  }
  /* 中央下はパッドとボタン列で塞がるため、トーストは空(上)へ逃がす */
  .niwa-toast { bottom: auto; top: 132px; max-width: 86vw; }
}
/* --- 〜640px: 手紙モーダルが画面に収まるように(seeds.js の @media と同じ閾値) --- */
@media (max-width: 640px) {
  .niwa-letter { padding: 12px; }
  .niwa-letter-panel { width: 94vw; max-height: 82vh; padding: 20px 18px; gap: 11px; }
  .niwa-letter-title { font-size: 16px; }
  .niwa-letter-row { flex-wrap: wrap; }
  .niwa-letter-ta { font-size: 10px; }
  .niwa-letter .niwa-mini-btn { font-size: 12px; padding: 10px 16px; min-height: 42px; }
}
`;

function el(tag, cls, text) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text != null) d.textContent = text;
  return d;
}

let refs = {
  hudEls: [],
  countEl: null,
  toastEl: null,
  toastTimer: 0,
  lastCount: -1,
  importSrc: null,   // 'hash' | 'paste' — garden:imported のトースト文言の出し分け
};

function photoFilename(d) {
  const p = (n) => String(n).padStart(2, '0');
  return 'hikari-niwa-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
    + '-' + p(d.getHours()) + p(d.getMinutes()) + '.png';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 1000);
}

function showToast(msg) {
  const t = refs.toastEl;
  if (!t) return;
  t.textContent = msg;
  t.classList.add('niwa-show');
  clearTimeout(refs.toastTimer);
  refs.toastTimer = setTimeout(() => t.classList.remove('niwa-show'), 2200);
}

// クリップボードへ。navigator.clipboard 不可なら textarea 選択にフォールバック
function copyText(text, ta, okMsg) {
  const fallback = () => {
    try {
      ta.focus();
      ta.select();
      if (ta.setSelectionRange) ta.setSelectionRange(0, String(text).length);
      const ok = document.execCommand && document.execCommand('copy');
      showToast(ok ? okMsg : 'うつせませんでした…長押しで選んでください');
    } catch (e) { showToast('うつせませんでした…長押しで選んでください'); }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast(okMsg), fallback);
    } else fallback();
  } catch (e) { fallback(); }
}

// 貼られた文章から手紙のことばを取り出す（URLごと貼られても #garden= の中身を拾う）
function extractCode(text) {
  let s = String(text == null ? '' : text).trim();
  const m = s.match(/#garden=([^&\s'"]+)/);
  if (m) {
    s = m[1];
    try { s = decodeURIComponent(s); } catch (e) {}
  }
  return s.trim();
}

export default {
  name: 'ui',

  init(ctx) {
    try {
      const root = (ctx && ctx.dom && ctx.dom.root) || document.body;
      const bus = ctx && ctx.bus;
      const state = ctx && ctx.state;

      // ---- style 注入 ----
      const style = document.createElement('style');
      style.textContent = STYLE;
      document.head.appendChild(style);

      // ---- HUD 上 ----
      const hudTop = el('div', 'hud-top niwa-hud niwa-dimmed');
      // #ui-root > * { pointer-events:auto }（ID指定）が shared.css の
      // .hud-top { pointer-events:none } に勝ってしまうため、inline で打ち消す。
      // 内側の .hud-title-block / .niwa-mini-btn 等が各自 auto に戻す。
      hudTop.style.pointerEvents = 'none';
      const block = el('div', 'hud-title-block');
      const back = el('a', 'hud-back', '← もどる');
      back.href = '../../index.html';
      block.appendChild(back);
      block.appendChild(el('div', 'hud-no', 'PROTOTYPE 19'));
      block.appendChild(el('div', 'hud-title', '光の庭'));
      hudTop.appendChild(block);
      root.appendChild(hudTop);

      // ---- HUD 下 ----
      const hudBottom = el('div', 'hud-bottom niwa-hud niwa-dimmed');
      hudBottom.style.pointerEvents = 'none';
      hudBottom.appendChild(el('div', 'hud-hint',
        '左下に種を描いて、丘に触れると植わります。風が庭を揺らします。'));
      const tech = el('div', 'hud-tech');
      const row1 = el('div', 'tech-row');
      row1.appendChild(el('span', 'tech-label', '試作'));
      row1.appendChild(el('span', 'tech-tag', 'Three.js modules'));
      const row2 = el('div', 'tech-row');
      row2.appendChild(el('span', 'tech-label', '本実装'));
      row2.appendChild(el('span', 'tech-tag primary', 'Unity URP (C#)'));
      tech.appendChild(row1);
      tech.appendChild(row2);
      hudBottom.appendChild(tech);
      root.appendChild(hudBottom);

      // ---- 右下の小さな操作列 ----
      const actions = el('div', 'niwa-actions niwa-hud niwa-dimmed');
      actions.style.pointerEvents = 'none'; // ボタンは .niwa-mini-btn が auto に戻す
      const countEl = el('div', 'niwa-count', '灯る草花 — 0');
      const saveBtn = el('button', 'niwa-mini-btn', '保存');
      const loadBtn = el('button', 'niwa-mini-btn', 'よみがえらせる');
      saveBtn.addEventListener('click', () => {
        try {
          if (bus) bus.emit('garden:save');
          showToast('庭を保存しました ✦');
        } catch (e) { console.warn('[ui] save', e); }
      });
      loadBtn.addEventListener('click', () => {
        try { if (bus) bus.emit('garden:load'); }
        catch (e) { console.warn('[ui] load', e); }
      });
      const photoBtn = el('button', 'niwa-mini-btn', '写真にのこす');
      photoBtn.addEventListener('click', () => {
        try {
          const r = ctx && ctx.renderer;
          const canvas = r && r.domElement;
          if (!r || !canvas || !ctx.scene || !ctx.camera) {
            showToast('写真にできませんでした');
            return;
          }
          // preserveDrawingBuffer なしのため、描画直後にバッファを読む
          r.render(ctx.scene, ctx.camera);
          const filename = photoFilename(new Date());
          if (canvas.toBlob) {
            canvas.toBlob((blob) => {
              try {
                if (!blob) { showToast('写真にできませんでした'); return; }
                downloadBlob(blob, filename);
                showToast('庭を写真にのこしました ✦');
              } catch (e) {
                console.warn('[ui] photo', e);
                showToast('写真にできませんでした');
              }
            }, 'image/png');
          } else {
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = filename;
            a.click();
            showToast('庭を写真にのこしました ✦');
          }
        } catch (e) {
          console.warn('[ui] photo', e);
          showToast('写真にできませんでした');
        }
      });
      const letterBtn = el('button', 'niwa-mini-btn', '庭を手紙に');
      letterBtn.addEventListener('click', () => {
        try { if (bus) bus.emit('garden:export'); }   // plants が garden:exported を返す
        catch (e) { console.warn('[ui] letter', e); }
      });
      const openLetterBtn = el('button', 'niwa-mini-btn', '手紙をひらく');
      openLetterBtn.addEventListener('click', () => {
        try { openImportModal(); } catch (e) { console.warn('[ui] open letter', e); }
      });
      // 手紙の2ボタンは包んでおく(スマホ縦で横並び1行に圧縮するため。
      // デスクトップは display:contents で従来どおり縦積み)
      const letterPair = el('div', 'niwa-actions-pair');
      letterPair.appendChild(letterBtn);
      letterPair.appendChild(openLetterBtn);
      actions.appendChild(countEl);
      actions.appendChild(saveBtn);
      actions.appendChild(loadBtn);
      actions.appendChild(photoBtn);
      actions.appendChild(letterPair);
      root.appendChild(actions);

      refs.hudEls = [hudTop, hudBottom, actions];
      refs.countEl = countEl;

      // ---- トースト ----
      const toast = el('div', 'niwa-toast');
      toast.style.pointerEvents = 'none';
      root.appendChild(toast);
      refs.toastEl = toast;

      // ---- 庭の手紙（書く / ひらく） ----
      // モーダル内の pointer 操作がカメラ回転・植え付けへ漏れないよう止める
      function makeLetterOverlay(extraCls, title, line) {
        const ov = el('div', 'niwa-letter ' + extraCls);
        ov.style.display = 'none';
        ov.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (e.target === ov) ov.style.display = 'none';   // 暗がりをタップしてもとじる
        });
        ov.addEventListener('pointermove', (e) => e.stopPropagation());
        ov.addEventListener('pointerup', (e) => e.stopPropagation());
        const panel = el('div', 'niwa-letter-panel');
        panel.appendChild(el('div', 'niwa-letter-title', title));
        const ln = el('div', 'niwa-letter-line', line);
        ln.style.whiteSpace = 'pre-line';
        panel.appendChild(ln);
        ov.appendChild(panel);
        root.appendChild(ov);
        return { ov, panel };
      }
      function letterField(panel, label, cls, rows, okMsg) {
        const field = el('div', 'niwa-letter-field');
        field.appendChild(el('div', 'niwa-letter-label', label));
        const row = el('div', 'niwa-letter-row');
        const ta = document.createElement('textarea');
        ta.className = 'niwa-letter-ta ' + cls;
        ta.rows = rows;
        ta.readOnly = true;
        ta.spellcheck = false;
        row.appendChild(ta);
        const btn = el('button', 'niwa-mini-btn', 'うつす');
        btn.addEventListener('click', () => { try { copyText(ta.value, ta, okMsg); } catch (e) {} });
        row.appendChild(btn);
        field.appendChild(row);
        panel.appendChild(field);
        return ta;
      }

      // 書く: コード + 共有リンクの2行、それぞれ「うつす」
      const lw = makeLetterOverlay('niwa-letter-write', '庭の手紙',
        'このことばを渡すと、受けとった人の夜に\nおなじ庭が咲きます。');
      const codeTa = letterField(lw.panel, 'ことば', 'niwa-letter-code', 4, 'ことばをうつしました ✦');
      const linkTa = letterField(lw.panel, 'ひらくリンク', 'niwa-letter-link', 2, 'リンクをうつしました ✦');
      const lwFoot = el('div', 'niwa-letter-foot');
      const lwClose = el('button', 'niwa-mini-btn', 'とじる');
      lwClose.addEventListener('click', () => { lw.ov.style.display = 'none'; });
      lwFoot.appendChild(lwClose);
      lw.panel.appendChild(lwFoot);

      // ひらく: 貼り付け → 咲かせる
      const lo = makeLetterOverlay('niwa-letter-open', '手紙をひらく',
        'とどいた ことば、またはリンクを ここへ。');
      const pasteTa = document.createElement('textarea');
      pasteTa.className = 'niwa-letter-ta niwa-letter-paste';
      pasteTa.rows = 4;
      pasteTa.spellcheck = false;
      pasteTa.placeholder = 'n1. ではじまる ことば、または #garden= のリンク';
      lo.panel.appendChild(pasteTa);
      const loFoot = el('div', 'niwa-letter-foot');
      const bloomBtn = el('button', 'niwa-mini-btn niwa-letter-bloom', '咲かせる');
      bloomBtn.addEventListener('click', () => {
        try {
          const code = extractCode(pasteTa.value);
          if (!code) { showToast('手紙が空のようです'); return; }
          refs.importSrc = 'paste';
          if (bus) bus.emit('garden:import', { code });
        } catch (e) { console.warn('[ui] bloom', e); }
      });
      const loClose = el('button', 'niwa-mini-btn', 'とじる');
      loClose.addEventListener('click', () => { lo.ov.style.display = 'none'; });
      loFoot.appendChild(bloomBtn);
      loFoot.appendChild(loClose);
      lo.panel.appendChild(loFoot);

      function openLetterModal(code) {
        codeTa.value = code;
        linkTa.value = location.origin + location.pathname + '#garden=' + code;
        lo.ov.style.display = 'none';
        lw.ov.style.display = 'flex';
      }
      function openImportModal() {
        pasteTa.value = '';
        lw.ov.style.display = 'none';
        lo.ov.style.display = 'flex';
        try { pasteTa.focus(); } catch (e) {}
      }

      if (bus) {
        bus.on('garden:exported', (d) => {
          try {
            if (!d || !d.code || !(d.count > 0)) { showToast('まだ手紙にする花がありません'); return; }
            openLetterModal(d.code);
          } catch (e) { console.warn('[ui] exported', e); }
        });
        bus.on('garden:imported', (d) => {
          try {
            const src = refs.importSrc;
            refs.importSrc = null;
            if (d && d.ok) {
              lo.ov.style.display = 'none';
              pasteTa.value = '';
              showToast(src === 'hash' ? 'とどいた庭がひらきました ✦' : '手紙の庭が咲きました ✦');
            } else {
              showToast('読めない手紙のようです…');   // 壊れたコードは優しく断る（庭は無傷）
            }
          } catch (e) { console.warn('[ui] imported', e); }
        });
      }

      // URL に #garden= があれば覚えておき、入庭後にひらく（intro はそのまま）
      let pendingCode = null;
      try {
        const hm = (location.hash || '').match(/#garden=([^&]+)/);
        if (hm) {
          pendingCode = hm[1];
          try { pendingCode = decodeURIComponent(pendingCode); } catch (e) {}
        }
      } catch (e) {}

      // ---- intro オーバーレイ ----
      const intro = el('div', 'niwa-intro');
      intro.appendChild(el('div', 'niwa-intro-title', '光の庭'));
      intro.appendChild(el('div', 'niwa-intro-line',
        '夜の丘に、光の種をひとつ。\n描いたかたちが、灯る草花になる。'));
      const enter = el('button', 'niwa-intro-enter', '庭へ入る');
      intro.appendChild(enter);
      root.appendChild(intro);
      intro.querySelector('.niwa-intro-line').style.whiteSpace = 'pre-line';

      let entered = false;
      enter.addEventListener('click', () => {
        if (entered) return;
        entered = true;
        try {
          intro.classList.add('niwa-fading');
          intro.style.pointerEvents = 'none'; // フェード中の透明な幕が入力を遮らないように
          setTimeout(() => { try { intro.remove(); } catch (e) {} }, 1700);
          if (state) state.started = true;
          refs.hudEls.forEach((h) => h.classList.remove('niwa-dimmed'));
          if (bus) bus.emit('app:start');
          // とどいた手紙（URL ハッシュ）を自動でひらく
          if (pendingCode && bus) {
            const code = pendingCode;
            pendingCode = null;
            setTimeout(() => {
              try {
                refs.importSrc = 'hash';
                bus.emit('garden:import', { code });
              } catch (e) { console.warn('[ui] letter open', e); }
              // 成否にかかわらずハッシュは履歴に残さない
              try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
            }, 900);
          }
        } catch (e) { console.warn('[ui] start', e); }
      });
    } catch (e) {
      console.warn('[ui] init failed', e);
    }
  },

  update(dt, t, ctx) {
    try {
      const n = (ctx && ctx.state && ctx.state.plantCount) | 0;
      if (n !== refs.lastCount && refs.countEl) {
        refs.lastCount = n;
        refs.countEl.textContent = '灯る草花 — ' + n;
      }
    } catch (e) {
      // 静かに握る（毎フレームの警告は出さない）
    }
  },
};
