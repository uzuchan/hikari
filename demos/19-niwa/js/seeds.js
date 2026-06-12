// seeds.js — 描きパッドで光の種を描き、地面タップで植える
import * as THREE from 'three';

const PAD = 180;            // パッドのCSSピクセル
const TAP_MAX_DIST = 9;     // タップ判定: 移動量(px)
const TAP_MAX_TIME = 500;   // タップ判定: 時間(ms)
const HILL_RADIUS = 17.5;   // 丘の有効半径

let ctx = null;
let lastDna = null;
let padEl = null;
let drawCv = null, drawCx = null, dpr = 1;
let currentColor = null;
let stroke = null;          // { pts: [{x,y,t}], drawing }
let groundDown = null;      // { x, y, t }  画面タップ判定用
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

function injectStyle() {
  const st = document.createElement('style');
  st.textContent = `
  .niwa-seedpad {
    position: fixed; left: 14px; bottom: 96px;
    display: flex; flex-direction: column; gap: 8px;
    opacity: 0; pointer-events: none;
    transition: opacity 1.2s ease;
  }
  .niwa-seedpad.niwa-on { opacity: 1; pointer-events: auto; }
  /* 容器は素通し(inlineでnone)。触れる場所だけ戻す — 透明な余白が庭タップを吸わないように */
  .niwa-seedpad.niwa-on .niwa-seedpad-canvas,
  .niwa-seedpad.niwa-on .niwa-seedpad-row { pointer-events: auto; }
  .niwa-seedpad-canvas {
    width: ${PAD}px; height: ${PAD}px;
    border: 1px solid rgba(244,242,236,0.22);
    border-radius: 14px;
    background: rgba(7,7,11,0.82);
    backdrop-filter: blur(4px);
    touch-action: none; cursor: crosshair;
    box-shadow: 0 0 28px rgba(0,0,0,0.5);
  }
  .niwa-seedpad-row { display: flex; align-items: center; gap: 7px; }
  .niwa-swatch {
    width: 18px; height: 18px; border-radius: 50%;
    border: 1px solid rgba(244,242,236,0.25);
    cursor: pointer; padding: 0;
    transition: box-shadow 0.3s, transform 0.3s;
  }
  .niwa-swatch.niwa-sel {
    box-shadow: 0 0 12px currentColor, 0 0 4px currentColor;
    transform: scale(1.2);
    border-color: rgba(244,242,236,0.7);
  }
  .niwa-erase {
    margin-left: auto;
    font-size: 11px; padding: 4px 12px; letter-spacing: 0.2em;
  }
  .niwa-seedpad-label {
    font-size: 10px; letter-spacing: 0.25em;
    color: rgba(244,242,236,0.45);
  }
  /* スマホ縦: 色見本と「けす」を指で押せる大きさに(デスクトップは不変) */
  @media (max-width: 480px) {
    .niwa-swatch { width: 26px; height: 26px; }
    .niwa-erase { font-size: 12px; padding: 8px 14px; }
  }
  /* 共通@media(shared.css)で全幅化した hud-hint と重ならない高さへ */
  @media (max-width: 640px) {
    .niwa-seedpad { bottom: 124px; }
  }`;
  document.head.appendChild(st);
}

function buildPad() {
  padEl = document.createElement('div');
  padEl.className = 'niwa-seedpad';
  // #ui-root > * { pointer-events:auto }（ID指定）が .niwa-seedpad の none に勝つため
  // inline で打ち消す（ui.js / audio.js と同じ手）。canvas と色見本の行だけ CSS で auto に戻す。
  padEl.style.pointerEvents = 'none';

  const label = document.createElement('div');
  label.className = 'niwa-seedpad-label';
  label.textContent = '種をえがく';
  padEl.appendChild(label);

  drawCv = document.createElement('canvas');
  drawCv.className = 'niwa-seedpad-canvas';
  dpr = Math.min(devicePixelRatio || 1, 2);
  drawCv.width = PAD * dpr; drawCv.height = PAD * dpr;
  drawCx = drawCv.getContext('2d');
  padEl.appendChild(drawCv);

  const row = document.createElement('div');
  row.className = 'niwa-seedpad-row';
  const swatches = [];
  ctx.PALETTE.forEach((col, i) => {
    const b = document.createElement('button');
    b.className = 'niwa-swatch' + (i === 0 ? ' niwa-sel' : '');
    b.style.background = col; b.style.color = col;
    b.setAttribute('aria-label', col);
    b.addEventListener('pointerdown', e => e.stopPropagation());
    b.addEventListener('click', () => {
      currentColor = col;
      swatches.forEach(s => s.classList.remove('niwa-sel'));
      b.classList.add('niwa-sel');
    });
    swatches.push(b);
    row.appendChild(b);
  });
  const erase = document.createElement('button');
  erase.className = 'action-btn niwa-erase';
  erase.textContent = 'けす';
  erase.addEventListener('pointerdown', e => e.stopPropagation());
  erase.addEventListener('click', () => {
    drawCx.clearRect(0, 0, drawCv.width, drawCv.height);
    lastDna = null;
  });
  row.appendChild(erase);
  padEl.appendChild(row);

  ctx.dom.root.appendChild(padEl);
  currentColor = ctx.PALETTE[0];
  bindPadDrawing();
}

function bindPadDrawing() {
  drawCv.addEventListener('pointerdown', e => {
    if (!ctx.state.started) return;
    e.stopPropagation();
    drawCv.setPointerCapture(e.pointerId);
    const r = drawCv.getBoundingClientRect();
    stroke = { pts: [{ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }] };
  });
  drawCv.addEventListener('pointermove', e => {
    if (!stroke) return;
    e.stopPropagation();
    const r = drawCv.getBoundingClientRect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
    const q = stroke.pts[stroke.pts.length - 1];
    if (Math.hypot(p.x - q.x, p.y - q.y) < 1.5) return;
    stroke.pts.push(p);
    // 発光する線
    drawCx.save();
    drawCx.scale(dpr, dpr);
    drawCx.strokeStyle = currentColor;
    drawCx.lineWidth = 2.2;
    drawCx.lineCap = 'round';
    drawCx.shadowColor = currentColor;
    drawCx.shadowBlur = 9;
    drawCx.beginPath();
    drawCx.moveTo(q.x, q.y);
    drawCx.lineTo(p.x, p.y);
    drawCx.stroke();
    drawCx.restore();
  });
  const finish = e => {
    if (!stroke) return;
    e.stopPropagation();
    try {
      if (stroke.pts.length >= 3) {
        lastDna = strokeToDna(stroke.pts, currentColor);
        ctx.bus.emit('seed:drawn', { dna: lastDna });
      }
    } catch (err) { console.warn('[seeds] dna calc', err); }
    stroke = null;
  };
  drawCv.addEventListener('pointerup', finish);
  drawCv.addEventListener('pointercancel', finish);
}

// 描線 → dna { color, height:0.6..1.6, branches:2..6, sway:0..1 }
function strokeToDna(pts, color) {
  let totalLen = 0;
  let turns = 0;
  let prevAngle = null;
  const speeds = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const len = Math.hypot(dx, dy);
    totalLen += len;
    const dtMs = Math.max(1, pts[i].t - pts[i - 1].t);
    speeds.push(len / dtMs);
    if (len > 3) {
      const ang = Math.atan2(dy, dx);
      if (prevAngle !== null) {
        let d = Math.abs(ang - prevAngle);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d > 0.55) turns++;
      }
      prevAngle = ang;
    }
  }
  // 総延長 → height (描ききった長い線ほど背が高い)
  const height = clamp(0.6 + totalLen / 450, 0.6, 1.6);
  // 方向転換 → branches
  const branches = Math.round(clamp(2 + turns * 0.5, 2, 6));
  // 速さのばらつき(変動係数) → sway
  let sway = 0;
  if (speeds.length > 1) {
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    if (mean > 0.0001) {
      const varc = speeds.reduce((a, b) => a + (b - mean) * (b - mean), 0) / speeds.length;
      sway = clamp(Math.sqrt(varc) / mean, 0, 1);
    }
  }
  return { color, height, branches, sway };
}

function randomDna() {
  const P = ctx.PALETTE;
  return {
    color: P[Math.floor(Math.random() * P.length)],
    height: 0.7 + Math.random() * 0.8,
    branches: 2 + Math.floor(Math.random() * 5),
    sway: Math.random(),
  };
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// 3D画面の地面タップ → seed:planted
function bindGroundTap() {
  addEventListener('pointerdown', e => {
    if (!ctx.state.started) { groundDown = null; return; }
    if (padEl && padEl.contains(e.target)) { groundDown = null; return; }
    if (e.target.closest && e.target.closest('#ui-root')) { groundDown = null; return; }
    groundDown = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  addEventListener('pointerup', e => {
    const d = groundDown; groundDown = null;
    if (!d || !ctx.state.started) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_MAX_DIST) return; // ドラッグは植えない
    if (performance.now() - d.t > TAP_MAX_TIME) return;                      // 長押しも除外
    try {
      raycaster.setFromCamera({ x: ctx.state.pointer.x, y: ctx.state.pointer.y }, ctx.camera);
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return;
      const { x, z } = hitPoint;
      if (Math.hypot(x, z) > HILL_RADIUS) return; // 丘の外
      const dna = lastDna || randomDna();
      ctx.bus.emit('seed:planted', { x, z, dna });
    } catch (err) { console.warn('[seeds] plant', err); }
  });
}

export default {
  name: 'seeds',

  init(c) {
    try {
      ctx = c;
      injectStyle();
      buildPad();
      bindGroundTap();
      ctx.bus.on('app:start', () => { try { padEl.classList.add('niwa-on'); } catch (e) {} });
    } catch (e) {
      console.warn('[seeds] init failed', e);
    }
  },

  update(dt, t, c) {
    try {
      // started になったのにイベントを取り逃した場合の保険
      if (padEl && c.state.started && !padEl.classList.contains('niwa-on')) {
        padEl.classList.add('niwa-on');
      }
    } catch (e) {}
  },
};
