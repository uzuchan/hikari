// 19 光の庭 — camera.js
// 球面座標の軌道カメラ。ドラッグで回転 / ホイール・ピンチでズーム / 放置で微ドリフト。
// カメラの position / lookAt はこのモジュールが所有する（CONTRACT.md 準拠）。

const CENTER = { x: 0, y: 1.5, z: 0 };   // 基本の注視点（やや高め＝空が画面に入る）
const R_MIN = 5, R_MAX = 16;
const R_INTRO = 13, R_GARDEN = 9.6;
const PHI_MIN = 0.35, PHI_MAX = 1.42;    // 極角クランプ（地面に潜らない）
const IDLE_SEC = 12, DRIFT_SPEED = 0.02; // rad/s

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
// 指数平滑（フレームレート非依存）
const damp = (cur, goal, lambda, dt) => cur + (goal - cur) * (1 - Math.exp(-lambda * dt));

const S = {
  theta: 0,            // 方位角（現在値）
  phi: 1.38,           // 極角（現在値）。低めの視点で空の割合を増やす
  radius: R_INTRO,
  thetaGoal: 0,
  phiGoal: 1.38,
  radiusGoal: R_INTRO,
  lastInput: 0,        // 最後に入力があった時刻（t秒）
  nowT: 0,
  // ドラッグ / ピンチ
  pointers: new Map(), // pointerId -> {x, y}
  dragging: false,
  pinchDist: 0,
  // seed:planted フォーカス演出
  focus: null,         // { x, y, z, t }  t=経過秒
  look: { ...CENTER }, // 現在の注視点
};

// フォーカスのタイムライン: 1.8s で寄る → 1.2s 留まる → 3.0s で中央へ戻る
const FOCUS_IN = 1.8, FOCUS_HOLD = 1.2, FOCUS_OUT = 3.0;

function focusWeight(t) {
  if (t < FOCUS_IN) return easeInOut(t / FOCUS_IN);
  if (t < FOCUS_IN + FOCUS_HOLD) return 1;
  const u = (t - FOCUS_IN - FOCUS_HOLD) / FOCUS_OUT;
  if (u >= 1) return 0;
  return 1 - easeInOut(u);
}

function markInput() { S.lastInput = S.nowT; }

function init(ctx) {
  try {
    const canvas = ctx.renderer && ctx.renderer.domElement;
    if (!canvas) return;

    const onCanvas = (e) => e.target === canvas; // UI要素上の操作は無視

    // ---- ドラッグ / ピンチ（pointerイベント） ----
    window.addEventListener('pointerdown', (e) => {
      try {
        if (!onCanvas(e)) return;
        S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (S.pointers.size === 1) S.dragging = true;
        if (S.pointers.size === 2) {
          const [a, b] = [...S.pointers.values()];
          S.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
          S.dragging = false; // 2本指中は回転しない
        }
        markInput();
      } catch (err) { console.warn('[camera] pointerdown', err); }
    });

    window.addEventListener('pointermove', (e) => {
      try {
        const p = S.pointers.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;

        if (S.pointers.size === 2) {
          // ピンチでズーム
          const [a, b] = [...S.pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (S.pinchDist > 0) {
            S.radiusGoal = clamp(S.radiusGoal * (S.pinchDist / Math.max(d, 1)), R_MIN, R_MAX);
          }
          S.pinchDist = d;
          markInput();
        } else if (S.dragging && ctx.state.pointer.down) {
          // ドラッグで方位角 / 極角
          S.thetaGoal -= dx * 0.005;
          S.phiGoal = clamp(S.phiGoal - dy * 0.004, PHI_MIN, PHI_MAX);
          markInput();
        }
      } catch (err) { console.warn('[camera] pointermove', err); }
    });

    const release = (e) => {
      S.pointers.delete(e.pointerId);
      if (S.pointers.size < 2) S.pinchDist = 0;
      if (S.pointers.size === 0) S.dragging = false;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    // ---- ホイールでズーム ----
    window.addEventListener('wheel', (e) => {
      try {
        if (!onCanvas(e)) return;
        e.preventDefault();
        S.radiusGoal = clamp(S.radiusGoal + e.deltaY * 0.008, R_MIN, R_MAX);
        markInput();
      } catch (err) { console.warn('[camera] wheel', err); }
    }, { passive: false });

    // ---- イベントバス ----
    ctx.bus.on('app:start', () => {
      S.radiusGoal = R_GARDEN; // intro の 13 からゆっくり寄る
    });

    ctx.bus.on('seed:planted', (data) => {
      try {
        const x = (data && data.x) || 0, z = (data && data.z) || 0;
        let y = CENTER.y;
        try { y = ctx.helpers.groundY(x, z) + 0.8; } catch (_) {}
        S.focus = { x, y, z, t: 0 };
      } catch (err) { console.warn('[camera] seed:planted', err); }
    });
  } catch (e) {
    console.warn('[camera] init failed', e);
  }
}

function update(dt, t, ctx) {
  try {
    S.nowT = t;
    if (!S.lastInput) S.lastInput = t;

    // ---- 放置で微ドリフト ----
    const idle = t - S.lastInput;
    if (idle > IDLE_SEC) {
      const ramp = Math.min(1, (idle - IDLE_SEC) / 4); // 4秒かけて滑らかに始動
      S.thetaGoal += DRIFT_SPEED * ramp * dt;
    }

    // ---- 注視点（seed:planted フォーカス） ----
    let lookGoal = CENTER;
    if (S.focus) {
      S.focus.t += dt;
      const w = focusWeight(S.focus.t);
      if (S.focus.t >= FOCUS_IN + FOCUS_HOLD + FOCUS_OUT) {
        S.focus = null;
      } else {
        lookGoal = {
          x: CENTER.x + (S.focus.x - CENTER.x) * w,
          y: CENTER.y + (S.focus.y - CENTER.y) * w,
          z: CENTER.z + (S.focus.z - CENTER.z) * w,
        };
      }
    }
    S.look.x = damp(S.look.x, lookGoal.x, 4, dt);
    S.look.y = damp(S.look.y, lookGoal.y, 4, dt);
    S.look.z = damp(S.look.z, lookGoal.z, 4, dt);

    // ---- 角度・半径のスムーズ補間 ----
    S.theta = damp(S.theta, S.thetaGoal, 6, dt);
    S.phi = clamp(damp(S.phi, S.phiGoal, 6, dt), PHI_MIN, PHI_MAX);
    S.radius = damp(S.radius, S.radiusGoal, 2.2, dt);

    // ---- 球面座標 → カメラ位置 ----
    const sinP = Math.sin(S.phi);
    let px = S.look.x + S.radius * sinP * Math.sin(S.theta);
    let py = S.look.y + S.radius * Math.cos(S.phi);
    let pz = S.look.z + S.radius * sinP * Math.cos(S.theta);

    // 地形より下に潜らない保険
    try {
      const gy = ctx.helpers.groundY(px, pz);
      if (py < gy + 0.5) py = gy + 0.5;
    } catch (_) {}

    ctx.camera.position.set(px, py, pz);
    ctx.camera.lookAt(S.look.x, S.look.y, S.look.z);
  } catch (e) {
    console.warn('[camera] update failed', e);
  }
}

export default { name: 'camera', init, update };
