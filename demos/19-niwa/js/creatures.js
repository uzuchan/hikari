// creatures.js — 蛍の群れと白い精霊。夜の庭に小さな命を灯す。
import * as THREE from 'three';

const FIREFLY_MAX = 44;          // 基本個体数（state.quality を乗算して可視数を決める）
const HILL_R = 16;               // 漂える半径
const TAIL_LEN = 26;             // 精霊の尾の節数

let group = null;                // ctx.world に add するルート
let fireflies = [];              // {sprite, pos, vel, phase, blinkSpeed, born, mate, mateUntil, wanderSeed}
let attractors = [];             // plant:mature の位置リスト {x,y,z}
let started = false;
let startTime = -1;

// 精霊
let spirit = null;               // {head, tail:[sprite...], trail:[Vector3...], from, to, t0, dur, noted}
let spiritTimer = 20 + Math.random() * 15;   // 次の精霊までの秒数
let spiritTex = null;

let pairTimer = 6;               // 寄り添いペアを組み替えるタイマー

function rand(a, b) { return a + Math.random() * (b - a); }

function makeFirefly(ctx, i) {
  const colors = ['#ffd98a', '#ffd98a', '#ffd98a', '#8ce8ff', '#ffaad4'];
  const color = colors[i % colors.length];
  const mat = new THREE.SpriteMaterial({
    map: ctx.helpers.glowTexture(color),
    transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  const r = Math.sqrt(Math.random()) * HILL_R * 0.8;
  const a = Math.random() * Math.PI * 2;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const pos = new THREE.Vector3(x, ctx.helpers.groundY(x, z) + rand(0.5, 2.2), z);
  sprite.position.copy(pos);
  sprite.scale.setScalar(0.22);
  group.add(sprite);
  return {
    sprite, pos,
    vel: new THREE.Vector3(rand(-0.2, 0.2), rand(-0.05, 0.05), rand(-0.2, 0.2)),
    phase: Math.random() * Math.PI * 2,       // 個体ごとの明滅位相
    blinkSpeed: rand(1.6, 2.6),
    born: rand(0, 14),                        // app:start からの出現遅延（徐々に現れる）
    wanderSeed: Math.random() * 100,
    mate: -1, mateUntil: 0,                   // 寄り添い相手 index と期限
  };
}

function makeSpirit(ctx) {
  // 庭の縁から縁へ、ゆっくり横切る経路
  const a = Math.random() * Math.PI * 2;
  const from = new THREE.Vector3(Math.cos(a) * 22, rand(2.2, 4.5), Math.sin(a) * 22);
  const a2 = a + Math.PI + rand(-0.7, 0.7);
  const to = new THREE.Vector3(Math.cos(a2) * 22, rand(2.0, 4.2), Math.sin(a2) * 22);

  if (!spiritTex) spiritTex = ctx.helpers.glowTexture('#f4f2ec');
  const head = new THREE.Sprite(new THREE.SpriteMaterial({
    map: spiritTex, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  head.scale.setScalar(0.9);
  head.position.copy(from);
  group.add(head);

  const tail = [];
  const trail = [];
  for (let i = 0; i < TAIL_LEN; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: spiritTex, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.setScalar(0.55 * (1 - i / TAIL_LEN) + 0.08);
    s.position.copy(from);
    group.add(s);
    tail.push(s);
    trail.push(from.clone());
  }
  return { head, tail, trail, from, to, t0: -1, dur: rand(16, 24), noted: false };
}

function disposeSpirit() {
  if (!spirit || !group) return;
  try {
    group.remove(spirit.head); spirit.head.material.dispose();
    for (const s of spirit.tail) { group.remove(s); s.material.dispose(); }
  } catch (e) { /* noop */ }
  spirit = null;
}

function updateFireflies(dt, t, ctx) {
  const visible = Math.round(FIREFLY_MAX * Math.min(1, Math.max(0.3, ctx.state.quality || 1)));
  const elapsed = startTime >= 0 ? t - startTime : -1;
  const wind = ctx.state.wind || 0;

  // 寄り添いペアの組み替え：たまに近い2匹を選んで位相を同期させる
  pairTimer -= dt;
  if (pairTimer <= 0 && fireflies.length > 4) {
    pairTimer = rand(7, 14);
    const i = (Math.random() * fireflies.length) | 0;
    let best = -1, bestD = 9;
    for (let j = 0; j < fireflies.length; j++) {
      if (j === i || fireflies[j].mate >= 0) continue;
      const d = fireflies[i].pos.distanceTo(fireflies[j].pos);
      if (d < bestD) { bestD = d; best = j; }
    }
    if (best >= 0 && fireflies[i].mate < 0) {
      fireflies[i].mate = best; fireflies[best].mate = i;
      fireflies[i].mateUntil = fireflies[best].mateUntil = t + rand(6, 11);
    }
  }

  const force = new THREE.Vector3();
  for (let i = 0; i < fireflies.length; i++) {
    const f = fireflies[i];
    const on = started && i < visible && elapsed > f.born;
    if (!on) {
      f.sprite.material.opacity = Math.max(0, f.sprite.material.opacity - dt * 0.8);
      f.sprite.visible = f.sprite.material.opacity > 0.01;
      continue;
    }
    f.sprite.visible = true;

    // --- 運動：ふわふわ漂う（個体ごとのノイズ的ゆらぎ） ---
    const s = f.wanderSeed;
    force.set(
      Math.sin(t * 0.7 + s) * 0.35 + Math.cos(t * 0.31 + s * 2) * 0.2 + wind * 0.4,
      Math.sin(t * 0.9 + s * 3) * 0.22,
      Math.cos(t * 0.6 + s) * 0.35 + Math.sin(t * 0.27 + s * 2) * 0.2
    );

    // 成熟植物への弱い引力（最も近い灯りへ）
    if (attractors.length) {
      let near = null, nd = 1e9;
      for (const p of attractors) {
        const d = (f.pos.x - p.x) ** 2 + (f.pos.z - p.z) ** 2;
        if (d < nd) { nd = d; near = p; }
      }
      if (near) {
        const dx = near.x - f.pos.x, dy = (near.y + 0.6) - f.pos.y, dz = near.z - f.pos.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
        const pull = d > 1.4 ? 0.5 / d : -0.15;   // 近すぎたら少し離れる
        force.x += dx / d * pull; force.y += dy / d * pull * 0.6; force.z += dz / d * pull;
      }
    }

    // 寄り添い：相手のそばへ
    if (f.mate >= 0) {
      if (t > f.mateUntil) { const m = fireflies[f.mate]; if (m) m.mate = -1; f.mate = -1; }
      else {
        const m = fireflies[f.mate];
        if (m) {
          force.x += (m.pos.x - f.pos.x) * 0.5;
          force.y += (m.pos.y - f.pos.y) * 0.5;
          force.z += (m.pos.z - f.pos.z) * 0.5;
        }
      }
    }

    f.vel.addScaledVector(force, dt);
    f.vel.multiplyScalar(Math.max(0, 1 - dt * 0.9));   // 減衰
    const sp = f.vel.length();
    if (sp > 0.9) f.vel.multiplyScalar(0.9 / sp);
    f.pos.addScaledVector(f.vel, dt);

    // 丘の外・地面下・高すぎを優しく戻す
    const rr = Math.hypot(f.pos.x, f.pos.z);
    if (rr > HILL_R) { f.vel.x -= f.pos.x / rr * dt * 1.5; f.vel.z -= f.pos.z / rr * dt * 1.5; }
    const gy = ctx.helpers.groundY(f.pos.x, f.pos.z);
    if (f.pos.y < gy + 0.3) { f.pos.y = gy + 0.3; f.vel.y = Math.abs(f.vel.y) * 0.5; }
    if (f.pos.y > gy + 3.2) f.vel.y -= dt * 0.6;
    f.sprite.position.copy(f.pos);

    // --- 明滅：個体位相、寄り添い中は相手と同期 ---
    let ph = f.phase;
    if (f.mate >= 0 && fireflies[f.mate]) {
      const m = fireflies[f.mate];
      ph = (f.phase + m.phase) * 0.5;          // 互いの中間位相へ収束（同じ値を共有）
      f.phase += (ph - f.phase) * dt * 2;
    }
    const blink = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * f.blinkSpeed + ph), 2.2);
    const fadeIn = Math.min(1, (elapsed - f.born) / 3);
    f.sprite.material.opacity = blink * 0.85 * fadeIn;
    f.sprite.scale.setScalar(0.16 + blink * 0.12);
  }
}

function updateSpirit(dt, t, ctx) {
  if (!spirit) {
    if (!started) return;
    spiritTimer -= dt;
    if (spiritTimer <= 0) {
      spirit = makeSpirit(ctx);
      spiritTimer = rand(30, 55);              // 次の出現（数十秒に一度・1体ずつ）
    }
    return;
  }
  if (spirit.t0 < 0) spirit.t0 = t;
  const k = (t - spirit.t0) / spirit.dur;
  if (k >= 1) { disposeSpirit(); return; }

  // ゆるい弧を描いて横切る
  const p = spirit.from.clone().lerp(spirit.to, k);
  p.y += Math.sin(k * Math.PI) * 1.4 + Math.sin(t * 0.8) * 0.15;
  spirit.head.position.copy(p);

  // 端のフェード（淡く現れ、淡く消える）
  const edge = Math.min(1, Math.min(k, 1 - k) * 6);
  spirit.head.material.opacity = 0.5 * edge;

  // 通過の真ん中でひとつ、遠い音
  if (!spirit.noted && k > 0.45) {
    spirit.noted = true;
    try { ctx.bus.emit('note', { pitch: 0.8, vol: 0.2 }); } catch (e) { /* noop */ }
  }

  // 尾：頭の軌跡をなぞる
  spirit.trail.unshift(p.clone());
  spirit.trail.length = TAIL_LEN;
  for (let i = 0; i < TAIL_LEN; i++) {
    const s = spirit.tail[i];
    s.position.copy(spirit.trail[i] || p);
    s.material.opacity = 0.30 * (1 - i / TAIL_LEN) * edge;
  }
}

export default {
  name: 'creatures',

  init(ctx) {
    try {
      group = new THREE.Group();
      ctx.world.add(group);
      fireflies = [];
      for (let i = 0; i < FIREFLY_MAX; i++) fireflies.push(makeFirefly(ctx, i));

      ctx.bus.on('app:start', () => { started = true; });
      ctx.bus.on('plant:mature', (d) => {
        if (d && typeof d.x === 'number') {
          attractors.push({ x: d.x, y: d.y || 0, z: d.z });
          if (attractors.length > 64) attractors.shift();
        }
      });
      ctx.bus.on('garden:cleared', () => { attractors = []; });
    } catch (e) { console.warn('[creatures] init', e); }
  },

  update(dt, t, ctx) {
    try {
      if (started && startTime < 0) startTime = t;
      updateFireflies(dt, t, ctx);
      updateSpirit(dt, t, ctx);
    } catch (e) { console.warn('[creatures] update', e); }
  },
};
