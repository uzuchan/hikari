// footprints.js — 訪問者の足あと。過去にこの庭を訪れた誰かの気配が、丘をしずかに歩いていく。
// 契約: default export { name, init, update } / 他モジュール非import / ctx経由のみ
import * as THREE from 'three';

const LS_KEY = 'niwa-visits-v1';
const POOL_MAX = 60;          // 足あとSpriteの総数（プール再利用）
const HILL_R = 15;            // 歩ける丘の半径（縁から縁へ）
const COLORS = ['#f4f2ec', '#c9a8ff'];

const S = {
  group: null,
  pool: [],                   // { sprite, active, born, life, baseOp }
  tex: {},                    // 色 -> glowTexture
  plants: [],                 // plant:mature の位置記憶 {x,z}
  visits: 0,                  // 過去の訪問数（今回を含まない）
  started: false,
  firstSpawned: false,        // 最初の訪問者を出したか
  walker: null,               // { pts, lens, total, dist, speed, stepGap, nextStep, side, color }
  nextVisit: -1,              // 次の訪問者の出現時刻（t基準）
};

function rand(a, b) { return a + Math.random() * (b - a); }

// ---------- 訪問記録 ----------
function loadVisits() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function recordVisit() {
  try {
    const arr = loadVisits();
    arr.push({ t: Date.now() });
    localStorage.setItem(LS_KEY, JSON.stringify(arr.slice(-20)));   // 最新20件のみ
  } catch (e) { /* 記録できなくても庭は続く */ }
}

// ---------- 経路（Catmull-Rom を等間隔サンプリング） ----------
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function makePath() {
  const a = Math.random() * Math.PI * 2;
  const a2 = a + Math.PI + rand(-0.7, 0.7);
  const from = { x: Math.cos(a) * HILL_R, z: Math.sin(a) * HILL_R };
  const to = { x: Math.cos(a2) * HILL_R, z: Math.sin(a2) * HILL_R };
  const dx = to.x - from.x, dz = to.z - from.z;
  const L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L;          // 進行方向
  const px = -uz, pz = ux;                 // 垂直方向

  // 成熟植物のうち経路の近くにあるものを「縫う」中継点に
  const mids = [];
  for (const p of S.plants) {
    const k = ((p.x - from.x) * ux + (p.z - from.z) * uz) / L;     // 経路上の位置 0..1
    if (k < 0.15 || k > 0.85) continue;
    const off = (p.x - from.x) * px + (p.z - from.z) * pz;         // 経路からの距離
    if (Math.abs(off) > 7) continue;
    // 植物そのものは踏まず、すぐ脇を通る
    const side = off >= 0 ? -1 : 1;
    mids.push({ k, x: p.x + px * side * 0.7, z: p.z + pz * side * 0.7 });
  }
  mids.sort((m, n) => m.k - n.k);
  let ctrl;
  if (mids.length) {
    ctrl = [from, ...mids.slice(0, 3).map(m => ({ x: m.x, z: m.z })), to];
  } else {
    // 植物がなければ緩い弧
    const bow = rand(2, 4) * (Math.random() < 0.5 ? -1 : 1);
    ctrl = [from,
      { x: from.x + dx * 0.33 + px * bow, z: from.z + dz * 0.33 + pz * bow },
      { x: from.x + dx * 0.66 + px * bow * 0.8, z: from.z + dz * 0.66 + pz * bow * 0.8 },
      to];
  }

  // 端点を複製して全体をサンプリング → 弧長テーブル
  const c = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  const pts = [], lens = [0];
  const SEG = 18;
  for (let i = 1; i < c.length - 2; i++) {
    for (let j = 0; j < SEG; j++) {
      const u = j / SEG;
      pts.push({ x: cr(c[i - 1].x, c[i].x, c[i + 1].x, c[i + 2].x, u),
                 z: cr(c[i - 1].z, c[i].z, c[i + 1].z, c[i + 2].z, u) });
    }
  }
  pts.push({ x: to.x, z: to.z });
  for (let i = 1; i < pts.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  }
  return { pts, lens, total: lens[lens.length - 1] };
}

function pathAt(w, d) {
  d = Math.max(0, Math.min(w.total, d));
  let i = 1;
  while (i < w.lens.length - 1 && w.lens[i] < d) i++;
  const l0 = w.lens[i - 1], l1 = w.lens[i];
  const u = l1 > l0 ? (d - l0) / (l1 - l0) : 0;
  const a = w.pts[i - 1], b = w.pts[i];
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u,
           ux: (b.x - a.x), uz: (b.z - a.z) };
}

// ---------- 足あとプール ----------
function claimSprite(ctx, t) {
  // 未使用を探す → なければ新規（上限まで）→ それも無理なら最古を再利用
  for (const e of S.pool) if (!e.active) return e;
  if (S.pool.length < POOL_MAX) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: S.tex[COLORS[0]], transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sprite.visible = false;
    S.group.add(sprite);
    const e = { sprite, active: false, born: 0, life: 1, baseOp: 0.25 };
    S.pool.push(e);
    return e;
  }
  let oldest = S.pool[0];
  for (const e of S.pool) if (e.born < oldest.born) oldest = e;
  return oldest;
}

function placeFootprint(ctx, t, x, z, dirx, dirz, side, color) {
  const n = Math.hypot(dirx, dirz) || 1;
  const ux = dirx / n, uz = dirz / n;
  const px = -uz, pz = ux;
  const ox = px * side * 0.13, oz = pz * side * 0.13;   // 左右交互のずれ
  const life = rand(20, 30);
  // ふた粒ペア：つま先とかかと
  const grains = [[0.06, 0.085], [-0.05, 0.06]];        // [進行方向オフセット, スケール]
  for (const [along, sc] of grains) {
    const e = claimSprite(ctx, t);
    if (!e) return;
    const fx = x + ox + ux * along, fz = z + oz + uz * along;
    e.sprite.position.set(fx, ctx.helpers.groundY(fx, fz) + 0.03, fz);
    e.sprite.scale.setScalar(sc);
    e.sprite.material.map = S.tex[color];
    e.sprite.material.opacity = 0;
    e.sprite.visible = true;
    e.active = true; e.born = t; e.life = life; e.baseOp = 0.25;
  }
}

function updatePool(dt, t) {
  for (const e of S.pool) {
    if (!e.active) continue;
    const age = t - e.born;
    if (age >= e.life) {
      e.active = false; e.sprite.visible = false; e.sprite.material.opacity = 0;
      continue;
    }
    const fadeIn = Math.min(1, age / 0.8);
    const fadeOut = 1 - age / e.life;                   // 20〜30秒かけて淡く
    e.sprite.material.opacity = e.baseOp * fadeIn * fadeOut * fadeOut;
  }
}

// ---------- 見えない訪問者 ----------
function visitInterval() {
  // 過去訪問が多いほど気持ち早く（最大で約3割短く）
  const k = Math.max(0.7, 1 - Math.min(S.visits, 15) * 0.02);
  return rand(30, 70) * k;
}

function spawnWalker(ctx, t) {
  const path = makePath();
  const w = {
    ...path, dist: 0,
    speed: rand(0.75, 1.0),
    stepGap: rand(0.65, 0.85),
    nextStep: rand(0.3, 0.8),
    side: Math.random() < 0.5 ? 1 : -1,
    color: COLORS[(Math.random() * COLORS.length) | 0],
  };
  // 再訪の気配：過去の訪問が2回以上なら、最初の訪問者の出現で遠い音をひとつ
  if (!S.firstSpawned && S.visits >= 2) {
    try { ctx.bus.emit('note', { pitch: 0.6, vol: 0.12 }); } catch (e) { /* noop */ }
  }
  S.firstSpawned = true;
  return w;
}

function updateWalker(dt, t, ctx) {
  if (!S.started) return;
  if (S.nextVisit < 0) {
    // app:start 直後：再訪なら少し早めに最初の訪問者
    S.nextVisit = t + (S.visits >= 2 ? rand(6, 14) : rand(20, 45));
  }
  if (!S.walker) {
    if (t >= S.nextVisit) {
      S.walker = spawnWalker(ctx, t);
      S.nextVisit = t + S.walker.total / S.walker.speed + visitInterval();   // 最大同時1人
    }
    return;
  }
  const w = S.walker;
  w.dist += w.speed * dt;
  // quality が低いときは歩幅を広げて足あとを間引く
  const gap = w.stepGap * (ctx.state.quality < 0.75 ? 1.5 : 1);
  while (w.nextStep <= w.dist && w.nextStep <= w.total) {
    const p = pathAt(w, w.nextStep);
    placeFootprint(ctx, t, p.x, p.z, p.ux, p.uz, w.side, w.color);
    w.side = -w.side;
    w.nextStep += gap;
  }
  if (w.dist >= w.total) S.walker = null;   // 縁まで歩ききって、気配は消える
}

// ---------- 契約 ----------
function init(ctx) {
  try {
    S.group = new THREE.Group();
    ctx.world.add(S.group);
    for (const c of COLORS) S.tex[c] = ctx.helpers.glowTexture(c);
    S.visits = loadVisits().length;          // 過去の訪問数（今回より前）

    ctx.bus.on('app:start', () => {
      try {
        if (!S.started) { S.started = true; recordVisit(); }
      } catch (e) { console.warn('[footprints] app:start', e); }
    });
    ctx.bus.on('plant:mature', (d) => {
      try {
        if (d && typeof d.x === 'number' && typeof d.z === 'number') {
          S.plants.push({ x: d.x, z: d.z });
          if (S.plants.length > 64) S.plants.shift();
        }
      } catch (e) { /* noop */ }
    });
    ctx.bus.on('garden:cleared', () => { S.plants = []; });
  } catch (e) {
    console.warn('[footprints] init failed', e);
  }
}

function update(dt, t, ctx) {
  try {
    if (!(dt > 0)) return;
    updateWalker(dt, t, ctx);
    updatePool(dt, t);
  } catch (e) {
    console.warn('[footprints] update failed', e);
  }
}

export default { name: 'footprints', init, update };
