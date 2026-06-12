// seasons.js — 庭に春夏秋冬の気配がめぐる。花びら、立ちのぼる微光、木の葉、雪。
// 契約: default export { name, init, update } / 他モジュール非import / ctx経由のみ
import * as THREE from 'three';

const FIELD_R = 13;                       // 気配が降る・立ちのぼる範囲（丘の上空）
const EDGE = 17;                          // ここを越えて流された粒は還す
const DUR_MIN = 75, DUR_MAX = 120;        // 1季節の長さ（秒）
const ORDER = ['haru', 'natsu', 'aki', 'fuyu'];

// 季節ごとの仕様。n は最大粒数（× state.quality で間引く）。op はフェード全開時の不透明度
const SPEC = {
  haru: {   // 桜色の花びら — ゆっくり舞い落ち、風に横へ流される
    pitch: 0.5, kind: 'fall',
    groups: [{ color: '#ffaad4', n: 55, size: 0.17, op: 0.4 }],
    vy: [0.22, 0.48], sway: [0.45, 1.1], spin: [0.5, 1.3],
    wind: 1.6, flutter: 0.3, y0: [1.2, 9], topY: [6.5, 10.5],
  },
  natsu: {  // 金色の温かい微光 — 地表からゆっくり立ちのぼり、ほたるのように緩く明滅する
    pitch: 0.7, kind: 'rise',
    groups: [{ color: '#ffd98a', n: 52, size: 0.15, op: 0.38 }],
    vy: [0.1, 0.28], wob: [0.25, 0.75], top: [1.8, 4.2],
    twinkle: [0.8, 1.6],   // 明滅の角速度(rad/s)。周期4〜8秒の呼吸
  },
  aki: {    // 琥珀と薄紫の木の葉 — サインで左右に揺れながら落ちる
    pitch: 0.35, kind: 'fall',
    groups: [{ color: '#ffd98a', n: 26, size: 0.2, op: 0.38 },
             { color: '#c9a8ff', n: 20, size: 0.19, op: 0.36 }],
    vy: [0.26, 0.56], sway: [0.7, 1.8], spin: [0.7, 1.7],
    wind: 0.5, flutter: 0.35, y0: [1.2, 8.5], topY: [6, 10],
  },
  fuyu: {   // 白銀と氷青の雪 — まっすぐ静かに降り、地表で消える
    pitch: 0.85, kind: 'fall',
    groups: [{ color: '#f4f2ec', n: 38, size: 0.13, op: 0.42 },
             { color: '#8ce8ff', n: 26, size: 0.12, op: 0.4 }],
    vy: [0.3, 0.68], sway: [0, 0.06], spin: [0.2, 0.5],
    wind: 0, flutter: 0, y0: [1.5, 12], topY: [9, 13],
  },
};

const S = {
  season: null,        // 現在の季節名（開始前は null）
  nextShift: 0,        // 次の季節への遷移時刻
  startAt: -1,         // 最初の春が訪れる時刻（app:start の少し後）
  started: false,
  layers: [],          // { season, groups, fade, target, inDur, outDur }
  warned: false,
};

function rand(a, b) { return a + Math.random() * (b - a); }
function quality(ctx) { return Math.max(0.5, Math.min(1, ctx.state.quality || 1)); }

// ---------- 粒子レイヤー ----------
function makeGroup(ctx, spec, g) {
  const n = Math.max(4, Math.floor(g.n * quality(ctx)));
  const pos = new Float32Array(n * 3);
  const data = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * FIELD_R;
    const p = { bx: Math.cos(a) * r, z: Math.sin(a) * r, ph: Math.random() * Math.PI * 2 };
    if (spec.kind === 'rise') {
      p.g = ctx.helpers.groundY(p.bx, p.z);
      p.y = p.g + Math.random() * rand(...spec.top);   // 初回は途中まで立ちのぼった状態で散らす
      p.vy = rand(...spec.vy);
      p.wob = rand(...spec.wob);
      p.top = rand(...spec.top);
      if (spec.twinkle) { p.tw = rand(...spec.twinkle); p.tp = Math.random() * Math.PI * 2; }
    } else {
      p.y = rand(...spec.y0);
      p.vy = rand(...spec.vy);
      p.sw = rand(...spec.sway);
      p.sp = rand(...spec.spin);
    }
    data.push(p);
    pos[i * 3] = p.bx; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (spec.twinkle) {   // 粒ごとの明滅は頂点色の明度で表す（バッファは生成時に1回だけ確保）
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  const mat = new THREE.PointsMaterial({
    color: g.color, size: g.size, sizeAttenuation: true,
    map: ctx.helpers.glowTexture(g.color),
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: !!spec.twinkle,
  });
  const pts = new THREE.Points(geo, mat);
  pts.visible = false;
  ctx.world.add(pts);
  return { pts, geo, mat, data, maxOp: g.op };
}

function buildLayer(season, ctx) {
  const spec = SPEC[season];
  return {
    season,
    groups: spec.groups.map(g => makeGroup(ctx, spec, g)),
    fade: 0, target: 1,
    inDur: rand(8, 12),        // ゆっくり訪れ
    outDur: rand(5, 8),        // すこし早めに退いて、合計8〜15秒で交代する
  };
}

function disposeLayer(ctx, L) {
  for (const g of L.groups) {
    try {
      ctx.world.remove(g.pts);
      g.geo.dispose();
      g.mat.dispose();         // map は index.html の共有キャッシュなので dispose しない
    } catch (e) { /* noop */ }
  }
  L.groups.length = 0;
}

function respawnTop(p, spec) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * FIELD_R;
  p.bx = Math.cos(a) * r; p.z = Math.sin(a) * r;
  p.y = rand(...spec.topY);
}

// 落ちる粒（春・秋・冬）— bx を芯に、サインのスウェイを足した x を描く
function updateFall(g, spec, dt, t, ctx) {
  const wind = Math.max(0, Math.min(1, ctx.state.wind || 0));
  const drift = spec.wind * (0.12 + wind);
  const pos = g.pts.geometry.attributes.position;
  for (let i = 0; i < g.data.length; i++) {
    const p = g.data[i];
    const f = 1 - spec.flutter * (0.5 + 0.5 * Math.sin(t * 1.2 + p.ph));   // 揺れの端で落下がゆるむ
    p.y -= p.vy * f * dt;
    p.bx += drift * dt;
    const x = p.bx + Math.sin(t * p.sp + p.ph) * p.sw;
    if (p.y <= ctx.helpers.groundY(x, p.z) + 0.05 || Math.abs(p.bx) > EDGE || Math.abs(p.z) > EDGE) {
      respawnTop(p, spec);     // 地表に触れて、音もなく消える
      pos.setXYZ(i, p.bx, p.y, p.z);
      continue;
    }
    pos.setXYZ(i, x, p.y, p.z);
  }
  pos.needsUpdate = true;
}

// 立ちのぼる粒（夏）— 地表から生まれ、ほたるの呼吸で明滅しながらひと息ぶん昇って還る
function updateRise(g, spec, dt, t, ctx) {
  const pos = g.pts.geometry.attributes.position;
  const col = g.pts.geometry.attributes.color || null;   // 明滅用（twinkle 指定の季節のみ）
  for (let i = 0; i < g.data.length; i++) {
    const p = g.data[i];
    p.y += p.vy * dt;
    if (p.y - p.g > p.top) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * FIELD_R;
      p.bx = Math.cos(a) * r; p.z = Math.sin(a) * r;
      p.g = ctx.helpers.groundY(p.bx, p.z);
      p.y = p.g + 0.05;
    }
    pos.setXYZ(i, p.bx + Math.sin(t * 0.5 + p.ph) * p.wob, p.y, p.z);
    if (col) {
      const b = 0.65 + 0.35 * Math.sin(t * p.tw + p.tp);   // 0.3〜1.0 のごく緩い明滅
      col.setXYZ(i, b, b, b);
    }
  }
  pos.needsUpdate = true;
  if (col) col.needsUpdate = true;
}

function tickLayers(dt, t, ctx) {
  for (let i = S.layers.length - 1; i >= 0; i--) {
    const L = S.layers[i];
    const dl = L.target - L.fade;
    const step = dt / (L.target > L.fade ? L.inDur : L.outDur);
    L.fade += Math.abs(dl) < step ? dl : Math.sign(dl) * step;
    if (L.target === 0 && L.fade <= 0.001) {
      disposeLayer(ctx, L);
      S.layers.splice(i, 1);
      continue;
    }
    const spec = SPEC[L.season];
    const visible = L.fade > 0.01;
    for (const g of L.groups) {
      g.pts.visible = visible;
      g.mat.opacity = g.maxOp * L.fade;
    }
    if (!visible) continue;
    for (const g of L.groups) {
      if (spec.kind === 'rise') updateRise(g, spec, dt, t, ctx);
      else updateFall(g, spec, dt, t, ctx);
    }
  }
}

// ---------- 季節の状態機械 ----------
function setSeason(season, ctx) {
  for (const L of S.layers) L.target = 0;          // 前の季節は静かに退く
  S.layers.push(buildLayer(season, ctx));          // 次の季節がゆっくり満ちる
  S.season = season;
  ctx.state.season = season;
  ctx.bus.emit('season:change', { season });
  ctx.bus.emit('note', { pitch: SPEC[season].pitch, vol: 0.15 });   // 季節の変わり目に鈴ひとつ
}

// ---------- 契約 ----------
function init(ctx) {
  try {
    ctx.bus.on('app:start', () => { S.started = true; });
  } catch (e) {
    console.warn('[seasons] init failed', e);
  }
}

function update(dt, t, ctx) {
  try {
    if (!(dt > 0)) return;
    const started = S.started || (ctx.state && ctx.state.started);
    if (!S.season) {
      if (!started) return;                        // intro の前に季節はめぐらない
      if (S.startAt < 0) S.startAt = t + 3;        // 庭が開いて、ひと呼吸おいて春
      if (t < S.startAt) return;
      setSeason('haru', ctx);
      S.nextShift = t + rand(DUR_MIN, DUR_MAX);
    } else if (t >= S.nextShift) {
      setSeason(ORDER[(ORDER.indexOf(S.season) + 1) % ORDER.length], ctx);
      S.nextShift = t + rand(DUR_MIN, DUR_MAX);
    }
    tickLayers(dt, t, ctx);
  } catch (e) {
    if (!S.warned) { S.warned = true; console.warn('[seasons] update', e); }
  }
}

export default { name: 'seasons', init, update };
