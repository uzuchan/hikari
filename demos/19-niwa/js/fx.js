// fx.js — 光の庭: 粒子バースト・漂う光塵・品質の自動調整
// 契約: default export { name:'fx', init, update } / 他モジュール非import / 連携は ctx のみ
import * as THREE from 'three';

const MAX_POOL = 300;     // バースト粒子プール上限
const DUST_N   = 80;      // 光塵の基準数（state.quality を乗算）
const GOLD     = '#ffd98a';

// ---- 内部状態 ----
let ctxRef = null;
let pool = [];            // バースト用スプライト（再利用、GC回避）
let dust = [];            // 漂う光塵
let dustGroup = null;
let burstGroup = null;

// パフォーマンス監視（直近60フレームの dt リングバッファ）
const FRAMES = 60;
const dtRing = new Float32Array(FRAMES);
let ringI = 0, ringFilled = 0;
let qualityCooldown = 0;  // 連続変更を防ぐ猶予（秒）

function makeSprite(color) {
  const mat = new THREE.SpriteMaterial({
    map: ctxRef.helpers.glowTexture(color),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0,
  });
  const s = new THREE.Sprite(mat);
  s.visible = false;
  s.userData = { vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 0.1 };
  return s;
}

// プールから粒を確保（空きがなければ最も古い粒を奪う）
function acquire() {
  for (const s of pool) if (!s.visible) return s;
  if (pool.length < MAX_POOL) {
    const s = makeSprite(GOLD);
    pool.push(s);
    burstGroup.add(s);
    return s;
  }
  let oldest = pool[0];
  for (const s of pool) if (s.userData.life < oldest.userData.life) oldest = s;
  return oldest;
}

function burst(data) {
  try {
    if (!ctxRef || !data) return;
    const x = +data.x || 0, y = +data.y || 0, z = +data.z || 0;
    const color = data.color || GOLD;
    const q = ctxRef.state.quality || 1;
    const n = Math.max(1, Math.round((data.n || 24) * q));
    const map = ctxRef.helpers.glowTexture(color);
    for (let i = 0; i < n; i++) {
      const s = acquire();
      if (!s) break;
      const a = Math.random() * Math.PI * 2;
      const r = 0.2 + Math.random() * 0.9;
      const u = s.userData;
      u.vx = Math.cos(a) * r;
      u.vz = Math.sin(a) * r;
      u.vy = 0.6 + Math.random() * 1.2;          // 上方へ漂う
      u.maxLife = 1.2 + Math.random() * 1.4;
      u.life = u.maxLife;
      u.size = 0.05 + Math.random() * 0.13;
      s.position.set(x, y, z);
      s.material.map = map;
      s.material.opacity = 0;
      s.scale.setScalar(u.size);
      s.visible = true;
    }
  } catch (e) { console.warn('[fx:burst]', e); }
}

// ---- 光塵 ----
function makeDust() {
  const palette = ctxRef.PALETTE || [GOLD];
  for (let i = 0; i < DUST_N; i++) {
    const color = palette[i % palette.length];
    const s = makeSprite(color);
    const u = s.userData;
    u.r = Math.sqrt(Math.random()) * 16;          // 庭（半径~18の丘）全体に
    u.a = Math.random() * Math.PI * 2;
    u.baseY = 0.3 + Math.random() * 3.2;
    u.phase = Math.random() * Math.PI * 2;
    u.speed = 0.05 + Math.random() * 0.12;
    u.size = 0.02 + Math.random() * 0.05;
    u.alpha = 0.18 + Math.random() * 0.3;
    s.material.opacity = u.alpha;
    s.scale.setScalar(u.size);
    s.visible = true;
    dust.push(s);
    dustGroup.add(s);
  }
}

// quality 変更時に光塵の表示数を間引く
function applyDustQuality() {
  const q = ctxRef ? (ctxRef.state.quality || 1) : 1;
  const visibleN = Math.round(DUST_N * q);
  for (let i = 0; i < dust.length; i++) dust[i].visible = i < visibleN;
}

function watchPerformance(dt) {
  dtRing[ringI] = dt * 1000;
  ringI = (ringI + 1) % FRAMES;
  if (ringFilled < FRAMES) { ringFilled++; return; }
  qualityCooldown -= dt;
  if (qualityCooldown > 0) return;

  let sum = 0;
  for (let i = 0; i < FRAMES; i++) sum += dtRing[i];
  const avg = sum / FRAMES;
  const st = ctxRef.state;

  if (avg > 22 && st.quality > 0.5) {
    st.quality = Math.max(0.5, Math.round((st.quality - 0.1) * 10) / 10);
    applyDustQuality();
    qualityCooldown = 2.0;          // 落としたら2秒様子を見る
  } else if (avg < 15 && st.quality < 1) {
    st.quality = Math.min(1, Math.round((st.quality + 0.1) * 10) / 10);
    applyDustQuality();
    qualityCooldown = 4.0;          // 戻すのはゆっくり
  }
}

export default {
  name: 'fx',

  init(ctx) {
    try {
      ctxRef = ctx;
      burstGroup = new THREE.Group();
      dustGroup = new THREE.Group();
      ctx.world.add(burstGroup);
      ctx.world.add(dustGroup);

      makeDust();
      applyDustQuality();

      ctx.bus.on('fx:burst', burst);
      ctx.bus.on('seed:planted', d => {
        try {
          const x = d ? +d.x || 0 : 0;
          const z = d ? +d.z || 0 : 0;
          const y = ctxRef.helpers.groundY(x, z) + 0.15;
          burst({ x, y, z, color: GOLD, n: 12 });   // 植えた場所に小さな金のバースト
        } catch (e) { console.warn('[fx:seed]', e); }
      });
      // 開花の瞬間、花の色で静かに散る（CONTRACT: plant:mature の聞く者）
      ctx.bus.on('plant:mature', d => {
        try {
          if (!d) return;
          burst({ x: +d.x || 0, y: +d.y || 0, z: +d.z || 0, color: d.color || GOLD, n: 18 });
        } catch (e) { console.warn('[fx:mature]', e); }
      });
      // 庭が消えたら、舞っていた粒も消す（CONTRACT: garden:cleared の聞く者）
      ctx.bus.on('garden:cleared', () => {
        try {
          for (const s of pool) {
            s.visible = false;
            s.material.opacity = 0;
            s.userData.life = 0;
          }
        } catch (e) { console.warn('[fx:cleared]', e); }
      });
    } catch (e) { console.warn('[fx:init]', e); }
  },

  update(dt, t, ctx) {
    try {
      if (!ctxRef) return;
      watchPerformance(dt);

      // バースト粒子: 上方へ漂って減衰消滅 → プールへ戻る
      for (const s of pool) {
        if (!s.visible) continue;
        const u = s.userData;
        u.life -= dt;
        if (u.life <= 0) { s.visible = false; s.material.opacity = 0; continue; }
        const k = u.life / u.maxLife;            // 1 → 0
        u.vx *= (1 - dt * 1.4);
        u.vz *= (1 - dt * 1.4);
        u.vy *= (1 - dt * 0.5);
        s.position.x += u.vx * dt;
        s.position.y += u.vy * dt;
        s.position.z += u.vz * dt;
        // ふっと現れて、すうっと消える
        s.material.opacity = Math.min(1, (1 - k) * 6) * k * 0.9;
        s.scale.setScalar(u.size * (0.6 + k * 0.7));
      }

      // 光塵: 風に流されながらゆっくり旋回・明滅
      const wind = (ctx && ctx.state.wind) || 0;
      for (const s of dust) {
        if (!s.visible) continue;
        const u = s.userData;
        u.a += dt * u.speed * (0.4 + wind * 1.6);
        const x = Math.cos(u.a) * u.r;
        const z = Math.sin(u.a) * u.r;
        const y = u.baseY + Math.sin(t * 0.4 + u.phase) * 0.5 + wind * 0.4;
        s.position.set(x, y, z);
        s.material.opacity = u.alpha * (0.6 + 0.4 * Math.sin(t * 0.8 + u.phase * 2));
      }
    } catch (e) { /* 1フレームの失敗で庭を止めない */ }
  },
};
