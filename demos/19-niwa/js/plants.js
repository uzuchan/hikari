// plants.js — 光の庭: 発光植物（成長・開花・揺れ・保存/復元）
import * as THREE from 'three';

const STORE_KEY = 'niwa-garden-v1';
const MAX_PLANTS = 60;
const T_STEM = 1.6;     // 茎が伸びる時間
const T_BRANCH = 1.2;   // 枝分かれの時間
const T_BUD = 0.9;      // つぼみが膨らむ時間
const T_BLOOM = 0.7;    // 開花の時間

const plants = [];
let C = null; // ctx

const ease = k => 1 - Math.pow(1 - Math.min(Math.max(k, 0), 1), 3);

function safeDna(dna, palette) {
  dna = dna || {};
  return {
    color: (typeof dna.color === 'string') ? dna.color : palette[0],
    height: THREE.MathUtils.clamp(+dna.height || 1, 0.6, 1.6),
    branches: Math.round(THREE.MathUtils.clamp(+dna.branches || 3, 2, 6)),
    sway: THREE.MathUtils.clamp(+dna.sway || 0.5, 0, 1),
  };
}

function buildPlant(x, z, dna, mature) {
  const y = C.helpers.groundY(x, z);
  const col = new THREE.Color(dna.color);
  const h = dna.height;
  const group = new THREE.Group();
  group.position.set(x, y, z);

  // 茎 — ゆるく曲がる TubeGeometry（根元ピボットで scale.y 成長）
  const bend = (Math.random() - 0.5) * 0.25 * h;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(bend * 0.4, h * 0.45, (Math.random() - 0.5) * 0.1),
    new THREE.Vector3(bend, h, 0),
  ]);
  const stemMat = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.85), transparent: true, opacity: 0.9 });
  const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.022 * h, 5), stemMat);
  group.add(stem);
  const topLocal = curve.getPoint(1);

  // 茎の頂のほのかな光
  const crown = new THREE.Sprite(new THREE.SpriteMaterial({
    map: C.helpers.glowTexture(dna.color), color: col,
    transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  crown.position.copy(topLocal);
  crown.scale.setScalar(0.28 * h);
  group.add(crown);

  // 枝 — Line。先端につぼみ(Sphere)と花(glowスプライト)
  const branches = [];
  const lineMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.8 });
  const budMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95 });
  const budGeo = new THREE.SphereGeometry(0.035 * h, 8, 6);
  for (let i = 0; i < dna.branches; i++) {
    const bg = new THREE.Group();
    const attach = 0.55 + 0.4 * (i / Math.max(1, dna.branches - 1)); // 茎の上部に分散
    bg.position.copy(curve.getPoint(attach));
    bg.rotation.y = (i / dna.branches) * Math.PI * 2 + Math.random() * 0.8;
    const L = h * (0.22 + Math.random() * 0.16);
    const pts = [];
    for (let s = 0; s <= 4; s++) {
      const k = s / 4;
      pts.push(new THREE.Vector3(k * L * 0.85, k * k * L * 0.6 + k * L * 0.25, 0));
    }
    bg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    const tip = pts[pts.length - 1];
    const bud = new THREE.Mesh(budGeo, budMat);
    bud.position.copy(tip);
    bud.scale.setScalar(0.001);
    bg.add(bud);
    const flower = new THREE.Sprite(new THREE.SpriteMaterial({
      map: C.helpers.glowTexture(dna.color), color: col,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    flower.position.copy(tip);
    flower.scale.setScalar(0.001);
    bg.add(flower);
    bg.scale.setScalar(0.001);
    branches.push({ group: bg, bud, flower, delay: i * 0.12 });
    group.add(bg);
  }

  const bloomAt = T_STEM + T_BRANCH + T_BUD + 0.4 + Math.random() * 1.2;
  const p = {
    group, x, z, dna, stem, crown, branches,
    topY: y + topLocal.y, age: mature ? bloomAt + T_BLOOM + 9 : 0,
    bloomAt, matured: !!mature, silent: !!mature,
    phase: Math.random() * Math.PI * 2,
  };
  if (mature) applyGrowth(p, 0); // 成長済みの形に整える
  C.world.add(group);
  plants.push(p);
  C.state.plantCount = plants.length;
  return p;
}

function applyGrowth(p, t) {
  const a = p.age;
  p.stem.scale.y = Math.max(0.001, ease(a / T_STEM));
  p.crown.position.y = p.stem.scale.y * (p.topY - p.group.position.y);
  for (const b of p.branches) {
    const kb = ease((a - T_STEM - b.delay) / T_BRANCH);
    b.group.scale.setScalar(Math.max(0.001, kb));
    const kBud = ease((a - T_STEM - T_BRANCH - b.delay) / T_BUD);
    b.bud.scale.setScalar(Math.max(0.001, kBud * (1 + 0.3 * Math.sin(t * 2 + b.delay * 10))));
    const kf = ease((a - p.bloomAt) / T_BLOOM);
    const pulse = p.matured ? (0.9 + 0.18 * Math.sin(t * 1.7 + p.phase + b.delay * 9)) : 1;
    b.flower.scale.setScalar(Math.max(0.001, kf * 0.22 * p.dna.height * pulse));
    b.flower.material.opacity = kf * (0.55 + 0.3 * Math.sin(t * 1.3 + p.phase + b.delay * 7));
  }
  p.crown.material.opacity = 0.35 + 0.2 * Math.sin(t * 1.1 + p.phase);
}

function disposePlant(p) {
  p.group.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose(); // glowTextureはindex.html側のキャッシュなので触らない
  });
  C.world.remove(p.group);
}

function removeOldest() {
  const p = plants.shift();
  if (!p) return;
  C.bus.emit('fx:burst', { x: p.x, y: p.topY, z: p.z, color: p.dna.color, n: 26 });
  disposePlant(p);
  C.state.plantCount = plants.length;
}

function clearAll() {
  while (plants.length) disposePlant(plants.pop());
  C.state.plantCount = 0;
}

function saveGarden() {
  try {
    const data = plants.map(p => ({ x: p.x, z: p.z, dna: p.dna }));
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch (e) { console.warn('[plants] save failed', e); }
}

// 庭をデータ行 [{x,z,dna}] で差し替えて咲かせる（load / 手紙の import の共通経路）
function replaceGarden(data) {
  clearAll();
  C.bus.emit('garden:cleared');
  for (const r of data.slice(0, MAX_PLANTS)) {
    if (r && isFinite(r.x) && isFinite(r.z)) {
      const p = buildPlant(+r.x, +r.z, safeDna(r.dna, C.PALETTE), true);
      C.bus.emit('plant:mature', { x: p.x, y: p.topY, z: p.z, color: p.dna.color });
    }
  }
}

function loadGarden() {
  let data = [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) data = JSON.parse(raw);
    if (!Array.isArray(data)) data = [];
  } catch (e) { console.warn('[plants] load failed', e); data = []; }
  replaceGarden(data);
}

// ---- 庭の手紙: "n1." + base64url( JSON [[x,z,colorIdx,height,branches,sway], …] ) ----
const round2 = v => Math.round(v * 100) / 100;

function encodeGarden() {
  const rows = plants.map(p => [
    round2(p.x), round2(p.z),
    Math.max(0, C.PALETTE.indexOf(p.dna.color)),
    round2(p.dna.height), p.dna.branches, round2(p.dna.sway),
  ]);
  const b64 = btoa(JSON.stringify(rows)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return 'n1.' + b64;
}

// 壊れたコードは throw せず null（「読めない手紙」）。庭には触れない。
function decodeGarden(code) {
  try {
    if (typeof code !== 'string') return null;
    let s = code.trim();
    const m = s.match(/#garden=([^&\s'"]+)/);   // URLごと渡されても中身を拾う
    if (m) s = m[1];
    if (s.slice(0, 3) !== 'n1.' || s.length < 4) return null;
    let b64 = s.slice(3).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const rows = JSON.parse(atob(b64));
    if (!Array.isArray(rows)) return null;
    const out = [];
    for (const r of rows.slice(0, MAX_PLANTS)) {   // 上限を超える分は読み捨て
      if (!Array.isArray(r)) continue;
      let x = +r[0], z = +r[1];
      if (!isFinite(x) || !isFinite(z)) continue;
      const d = Math.hypot(x, z);
      if (d > 17.5) { x *= 17.5 / d; z *= 17.5 / d; }   // 丘の外の座標は縁へ寄せる
      const ci = Math.min(Math.max(Math.round(+r[2]) || 0, 0), C.PALETTE.length - 1);
      out.push({ x, z, dna: { color: C.PALETTE[ci], height: +r[3], branches: +r[4], sway: +r[5] } });
    }
    return out.length ? out : null;   // 読める株がひとつもない手紙も「読めない」
  } catch (e) { return null; }
}

// import は localStorage を書かない（残したければ従来どおり「保存」）
function importGarden(code) {
  const rows = decodeGarden(code);
  if (!rows) { C.bus.emit('garden:imported', { ok: false, count: 0 }); return; }
  replaceGarden(rows);
  C.bus.emit('garden:imported', { ok: true, count: plants.length });
}

export default {
  name: 'plants',

  init(ctx) {
    try {
      C = ctx;
      ctx.bus.on('seed:planted', d => {
        try {
          if (!d || !isFinite(d.x) || !isFinite(d.z)) return;
          if (plants.length >= MAX_PLANTS) removeOldest();
          buildPlant(+d.x, +d.z, safeDna(d.dna, ctx.PALETTE), false);
        } catch (e) { console.warn('[plants] plant failed', e); }
      });
      ctx.bus.on('garden:save', () => { try { saveGarden(); } catch (e) { console.warn(e); } });
      ctx.bus.on('garden:load', () => { try { loadGarden(); } catch (e) { console.warn(e); } });
      ctx.bus.on('garden:export', () => {
        try {
          const code = plants.length ? encodeGarden() : null;   // 空の庭は code:null（uiが優しく断る）
          ctx.bus.emit('garden:exported', { code, count: plants.length });
        } catch (e) { console.warn('[plants] export', e); }
      });
      ctx.bus.on('garden:import', d => {
        try { importGarden(d && d.code); }
        catch (e) {
          console.warn('[plants] import', e);
          try { ctx.bus.emit('garden:imported', { ok: false, count: 0 }); } catch (e2) {}
        }
      });
    } catch (e) { console.warn('[plants] init failed', e); }
  },

  update(dt, t, ctx) {
    try {
      if (!C) return;
      const wind = (ctx.state && +ctx.state.wind) || 0;
      for (const p of plants) {
        p.age += dt;

        // 開花の瞬間
        if (!p.matured && p.age >= p.bloomAt) {
          p.matured = true;
          if (!p.silent) {
            ctx.bus.emit('plant:mature', { x: p.x, y: p.topY, z: p.z, color: p.dna.color });
            ctx.bus.emit('note', {
              pitch: THREE.MathUtils.clamp((p.dna.height - 0.6), 0, 1),
              vol: 0.4 + 0.3 * p.dna.sway,
            });
          }
        }

        applyGrowth(p, t);

        // 風と時間で揺れる（根元ピボット）
        const amp = p.dna.sway * (0.045 + wind * 0.14);
        p.group.rotation.z = Math.sin(t * (1.1 + p.dna.sway * 0.7) + p.phase) * amp;
        p.group.rotation.x = Math.cos(t * 0.8 + p.phase * 1.3) * amp * 0.6;
      }
    } catch (e) { console.warn('[plants] update', e); }
  },
};
