// weather.js — 夜の天候がゆっくり移ろう（晴れ / 星屑の雨 / 薄霧、流れ星）
// 契約: default export { name, init, update } / 他モジュール非import / ctx経由のみ
import * as THREE from 'three';

const TAIL_N = 12;          // 流れ星の尾のスプライト数
const FIELD_R = 13;         // 星屑が降る範囲（丘の上空）

const W = {
  mode: 'clear',            // 'clear' | 'stardust' | 'mist'
  nextShift: 0,             // 次の遷移判定時刻
  level: { stardust: 0, mist: 0 },   // 現在のフェード値 0..1
  target: { stardust: 0, mist: 0 },
  // 流れ星
  meteor: null,             // { group, head, tail[], on, t0, dur, p0, dir, len }
  meteorNext: 0,
  // 星屑の雨
  dust: null, dustData: null, dustMat: null,
  // 薄霧
  mist: [],
  lastBurst: -10,
  started: false,
  timersSet: false,
};

function pickNextMode() {
  // 晴れ→たまに星屑の雨、星屑→まれに薄霧、霧→晴れに還る
  if (W.mode === 'clear') return Math.random() < 0.55 ? 'stardust' : 'clear';
  if (W.mode === 'stardust') return Math.random() < 0.28 ? 'mist' : 'clear';
  return 'clear';
}

function setMode(mode, ctx) {
  W.mode = mode;
  W.target.stardust = mode === 'stardust' ? 1 : 0;
  W.target.mist = mode === 'mist' ? 1 : 0;
  // 天候の移ろいを庭全体へ知らせる（audio が音色を変える）
  try { if (ctx) { ctx.state.weather = mode; ctx.bus.emit('weather:change', { mode }); } } catch (_) {}
}

// ---------- 流れ星 ----------
function makeMeteor(ctx) {
  const group = new THREE.Group();
  const head = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ctx.helpers.glowTexture('#f4f2ec'),
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  head.scale.set(1.6, 1.6, 1);
  group.add(head);
  const tail = [];
  for (let i = 0; i < TAIL_N; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ctx.helpers.glowTexture(i < 3 ? '#f4f2ec' : '#8ce8ff'),
      transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const k = 1 - i / TAIL_N;
    s.scale.set(0.18 + 0.5 * k, 0.18 + 0.5 * k, 1);   // 先端ほど太く、尾は細く
    group.add(s);
    tail.push(s);
  }
  group.visible = false;
  ctx.world.add(group);
  W.meteor = { group, head, tail, on: false, t0: 0, dur: 1.2, p0: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 0 }, len: 24 };
}

function launchMeteor(ctx, t) {
  const m = W.meteor;
  if (!m) return;
  const side = Math.random() < 0.5 ? -1 : 1;
  m.p0 = { x: side * -(10 + Math.random() * 22), y: 22 + Math.random() * 12, z: -52 + Math.random() * 28 };
  const d = { x: side * (0.7 + Math.random() * 0.4), y: -(0.45 + Math.random() * 0.25), z: 0.12 * (Math.random() - 0.5) };
  const n = Math.hypot(d.x, d.y, d.z);
  m.dir = { x: d.x / n, y: d.y / n, z: d.z / n };
  m.len = 20 + Math.random() * 12;
  m.dur = 1.0 + Math.random() * 0.45;
  m.t0 = t; m.on = true; m.group.visible = true;
  ctx.bus.emit('note', { pitch: 0.9, vol: 0.15 });
}

function updateMeteor(ctx, t) {
  const m = W.meteor;
  if (!m || !m.on) return;
  const k = (t - m.t0) / m.dur;
  if (k >= 1) { m.on = false; m.group.visible = false; return; }
  const env = Math.sin(Math.PI * Math.min(1, k)) * 0.9;   // ふっと現れ、ふっと消える
  const at = (q) => ({
    x: m.p0.x + m.dir.x * m.len * q,
    y: m.p0.y + m.dir.y * m.len * q,
    z: m.p0.z + m.dir.z * m.len * q,
  });
  const hp = at(k);
  m.head.position.set(hp.x, hp.y, hp.z);
  m.head.material.opacity = env;
  for (let i = 0; i < m.tail.length; i++) {
    const q = Math.max(0, k - (i + 1) * 0.016);
    const p = at(q);
    m.tail[i].position.set(p.x, p.y, p.z);
    m.tail[i].material.opacity = env * (1 - i / m.tail.length) * 0.55;
  }
}

// ---------- 星屑の雨 ----------
function makeDust(ctx) {
  const q = Math.max(0.5, Math.min(1, ctx.state.quality || 1));
  const n = Math.floor((80 + Math.floor(Math.random() * 61)) * q);   // 80〜140 × quality
  const pos = new Float32Array(n * 3);
  const data = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * FIELD_R;
    const d = {
      x: Math.cos(a) * r, z: Math.sin(a) * r,
      y: 1 + Math.random() * 13,
      vy: -(0.55 + Math.random() * 0.55),            // ゆっくり降る
      vx: 0.22 + Math.random() * 0.3,                // 斜めに流れる
      vz: 0.06 * (Math.random() - 0.5),
      sway: Math.random() * Math.PI * 2,
    };
    data.push(d);
    pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  W.dustMat = new THREE.PointsMaterial({
    color: 0xc9a8ff, size: 0.22, sizeAttenuation: true,
    map: ctx.helpers.glowTexture('#c9a8ff'),
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  W.dust = new THREE.Points(geo, W.dustMat);
  W.dust.visible = false;
  W.dustData = data;
  ctx.world.add(W.dust);
}

function updateDust(ctx, dt, t) {
  const lv = W.level.stardust;
  W.dust.visible = lv > 0.01;
  W.dustMat.opacity = 0.5 * lv;
  if (!W.dust.visible) return;
  const pos = W.dust.geometry.attributes.position;
  const d = W.dustData;
  for (let i = 0; i < d.length; i++) {
    const p = d[i];
    p.y += p.vy * dt;
    p.x += (p.vx + 0.06 * Math.sin(t * 0.7 + p.sway)) * dt;
    p.z += p.vz * dt;
    const g = ctx.helpers.groundY(p.x, p.z);
    if (p.y <= g + 0.06) {
      // 地面に触れて小さく消える — まれに着地の燐光（1秒に1回まで）
      if (Math.random() < 0.05 && t - W.lastBurst > 1 && lv > 0.5) {
        W.lastBurst = t;
        ctx.bus.emit('fx:burst', { x: p.x, y: g + 0.05, z: p.z, color: '#c9a8ff', n: 4 });
      }
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * FIELD_R;
      p.x = Math.cos(a) * r; p.z = Math.sin(a) * r;
      p.y = 10 + Math.random() * 5;
    }
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
}

// ---------- 薄霧 ----------
function makeMist(ctx) {
  const tints = ['#c9a8ff', '#8ce8ff', '#c9a8ff', '#8ce8ff', '#c9a8ff', '#8ce8ff'];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ctx.helpers.glowTexture(tints[i]),
      transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const a = (i / 6) * Math.PI * 2 + Math.random();
    const r = 3 + Math.random() * 8;
    const u = {
      sprite: s,
      cx: Math.cos(a) * r, cz: Math.sin(a) * r,
      base: 0.04 + Math.random() * 0.04,          // opacity 0.04〜0.08
      amp: 1.2 + Math.random() * 1.6,
      spd: 0.05 + Math.random() * 0.05,
      ph: Math.random() * Math.PI * 2,
      lift: 0.5 + Math.random() * 0.5,            // 地表近く、星の邪魔をしない高さ
    };
    s.scale.set(7 + Math.random() * 4, 2.0 + Math.random() * 1.2, 1);
    s.visible = false;
    ctx.world.add(s);
    W.mist.push(u);
  }
}

function updateMist(ctx, t) {
  const lv = W.level.mist;
  for (const u of W.mist) {
    u.sprite.visible = lv > 0.01;
    if (!u.sprite.visible) continue;
    const x = u.cx + Math.sin(t * u.spd + u.ph) * u.amp;
    const z = u.cz + Math.cos(t * u.spd * 0.8 + u.ph * 1.3) * u.amp;
    const y = ctx.helpers.groundY(x, z) + u.lift + 0.1 * Math.sin(t * 0.2 + u.ph);
    u.sprite.position.set(x, y, z);
    u.sprite.material.opacity = u.base * lv * (0.85 + 0.15 * Math.sin(t * 0.31 + u.ph));
  }
}

// ---------- 契約 ----------
function init(ctx) {
  try {
    makeMeteor(ctx);
    makeDust(ctx);
    makeMist(ctx);
    ctx.bus.on('app:start', () => { W.started = true; });
  } catch (e) {
    console.warn('[weather] init failed', e);
  }
}

function update(dt, t, ctx) {
  try {
    if (!W.timersSet) {
      W.timersSet = true;
      W.nextShift = t + 40 + Math.random() * 50;
      W.meteorNext = t + 20 + Math.random() * 30;
    }
    const started = W.started || ctx.state.started;
    // 状態機械 — app:start 前は晴れのまま
    if (t >= W.nextShift) {
      if (started) setMode(pickNextMode(), ctx);
      W.nextShift = t + 40 + Math.random() * 50;     // 40〜90秒で次の移ろい
    }
    // ゆるやかなフェード（数秒かけて移ろう）
    for (const k of ['stardust', 'mist']) {
      const dl = W.target[k] - W.level[k];
      const step = dt / 6;
      W.level[k] += Math.abs(dl) < step ? dl : Math.sign(dl) * step;
    }
    // 流れ星 — 晴れ・星屑の雨のとき、20〜50秒に1本
    if (started && W.mode !== 'mist' && t >= W.meteorNext && W.meteor && !W.meteor.on) {
      launchMeteor(ctx, t);
      W.meteorNext = t + 20 + Math.random() * 30;
    }
    updateMeteor(ctx, t);
    if (W.dust) updateDust(ctx, dt, t);
    updateMist(ctx, t);
  } catch (e) {
    console.warn('[weather] update failed', e);
  }
}

export default { name: 'weather', init, update };
