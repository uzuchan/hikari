// terrain.js — 夜の丘・池・星空・月・地表の微光（光の庭）
// 契約: default export { name, init, update } / 他モジュール非import / ctx経由のみ
import * as THREE from 'three';

// ---------- 地形の式（groundY と完全一致させる唯一の定義） ----------
const R = 18;                 // 丘の半径
const POND = { x: 4.6, z: -3.2, r: 1.55 };  // 池の中心と水面半径

function heightAt(x, z) {
  const r = Math.hypot(x, z);
  // なだらかなドーム
  let h = 1.35 * Math.exp(-(r * r) / (2 * 9.5 * 9.5));
  // 静かな起伏
  h += 0.20 * Math.sin(x * 0.42 + 1.7) * Math.cos(z * 0.36 - 0.6);
  h += 0.10 * Math.sin(x * 0.85 - z * 0.72 + 0.4);
  // 池のくぼみ
  const pd = Math.hypot(x - POND.x, z - POND.z);
  h -= 0.55 * Math.exp(-(pd * pd) / (2 * 1.5 * 1.5));
  // 縁は夜に溶ける
  const e = Math.min(1, Math.max(0, (r - 12) / (R - 11)));
  h -= e * e * 3.2;
  return h;
}

// ---------- モジュール内部状態 ----------
const S = {
  stars: [],        // [{ points, speed, phase, base }]
  pondGlow: null,   // 水面の発光スプライト
  pondMat: null,    // 水面マテリアル
  moonPath: null,   // 水面の月の道
  glimmer: null,    // 地表の微光 Points
  glimmerData: null,
};

function makeStars(ctx, count, size, speed, phase, tint) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // 上半球の遠方ドーム
    const u = Math.random(), v = Math.random();
    const th = u * Math.PI * 2;
    const ph = Math.acos(1 - v * 0.92);          // 天頂寄り〜地平線少し下まで
    const rad = 120 + Math.random() * 30;
    pos[i * 3] = rad * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = rad * Math.cos(ph) - 6;
    pos[i * 3 + 2] = rad * Math.sin(ph) * Math.sin(th);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: tint, size, sizeAttenuation: true,
    map: ctx.helpers.glowTexture('#f4f2ec'),
    transparent: true, opacity: 0.7, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  ctx.world.add(points);
  S.stars.push({ points, speed, phase, base: 0.7 });
}

function init(ctx) {
  try {
    const q = Math.max(0.5, ctx.state.quality || 1);

    // ---------- groundY 差し替え（地形の式と完全一致） ----------
    ctx.helpers.groundY = (x, z) => heightAt(x, z);

    // ---------- 丘 ----------
    const geo = new THREE.PlaneGeometry(R * 2 + 8, R * 2 + 8, 96, 96);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, heightAt(p.getX(i), p.getZ(i)));
    }
    geo.computeVertexNormals();
    const hill = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x0a0d20,            // ほぼ黒の藍（sRGB出力で持ち上がる分を見込む）
      emissive: 0x010208,         // ごくかすかな内側の灯
      emissiveIntensity: 0.4,
      roughness: 1, metalness: 0,
    }));
    ctx.world.add(hill);

    // ---------- 池 ----------
    const waterY = heightAt(POND.x, POND.z) + 0.16;
    S.pondMat = new THREE.MeshBasicMaterial({
      color: 0x0d1626, transparent: true, opacity: 0.85, depthWrite: false,
    });
    const pond = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 40), S.pondMat);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(POND.x, waterY, POND.z);
    ctx.world.add(pond);

    // 水面の反射風の発光（ゆっくり明滅）
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ctx.helpers.glowTexture('#8ce8ff'),
      transparent: true, opacity: 0.16, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    glow.scale.set(POND.r * 3.4, POND.r * 1.8, 1);
    glow.position.set(POND.x, waterY + 0.12, POND.z);
    ctx.world.add(glow);
    S.pondGlow = glow;

    // 月の道（水面に落ちる細い光）
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(POND.r * 0.28, POND.r * 1.7),
      new THREE.MeshBasicMaterial({
        map: ctx.helpers.glowTexture('#f4f2ec'),
        transparent: true, opacity: 0.12, depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    path.rotation.x = -Math.PI / 2;
    path.rotation.z = 0.5;
    path.position.set(POND.x + 0.2, waterY + 0.02, POND.z + 0.1);
    ctx.world.add(path);
    S.moonPath = path;

    // ---------- 星空ドーム（3層・位相違いで瞬く） ----------
    makeStars(ctx, Math.floor(420 * q), 1.5, 0.31, 0.0, 0xf4f2ec);
    makeStars(ctx, Math.floor(300 * q), 1.0, 0.53, 2.1, 0xc9d6ff);
    makeStars(ctx, Math.floor(160 * q), 2.1, 0.17, 4.2, 0xffd98a);

    // ---------- 月 ----------
    const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ctx.helpers.glowTexture('#cfe0ff'),
      transparent: true, opacity: 0.5, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    moonHalo.scale.set(26, 26, 1);
    moonHalo.position.set(-16, 20, -50);
    ctx.world.add(moonHalo);

    const moonCore = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ctx.helpers.glowTexture('#f4f2ec'),
      transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    moonCore.scale.set(7.5, 7.5, 1);
    moonCore.position.copy(moonHalo.position);
    ctx.world.add(moonCore);

    // ---------- 地表に漂う微光 ----------
    const n = Math.floor(110 * q);
    const gp = new Float32Array(n * 3);
    const data = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 12.5;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      data.push({
        x, z,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.5,
        drift: 0.12 + Math.random() * 0.25,
        lift: 0.12 + Math.random() * 0.3,
      });
      gp[i * 3] = x;
      gp[i * 3 + 1] = heightAt(x, z) + 0.2;
      gp[i * 3 + 2] = z;
    }
    const ggeo = new THREE.BufferGeometry();
    ggeo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
    S.glimmer = new THREE.Points(ggeo, new THREE.PointsMaterial({
      color: 0xc9a8ff, size: 0.3, sizeAttenuation: true,
      map: ctx.helpers.glowTexture('#c9a8ff'),
      transparent: true, opacity: 0.5, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    S.glimmerData = data;
    ctx.world.add(S.glimmer);
  } catch (e) {
    console.warn('[terrain] init failed', e);
  }
}

function update(dt, t, ctx) {
  try {
    // 星の瞬き — 層ごとに位相の違う静かな呼吸
    for (const s of S.stars) {
      s.points.material.opacity =
        s.base * (0.72 + 0.28 * Math.sin(t * s.speed + s.phase));
    }
    // 池の揺らぎ — 反射光がゆっくり明滅し、月の道がたゆたう
    if (S.pondGlow) {
      S.pondGlow.material.opacity = 0.12 + 0.07 * Math.sin(t * 0.6) + 0.03 * Math.sin(t * 1.7 + 1.2);
      const w = POND.r * (3.4 + 0.25 * Math.sin(t * 0.43));
      S.pondGlow.scale.set(w, POND.r * 1.8, 1);
    }
    if (S.pondMat) {
      S.pondMat.opacity = 0.8 + 0.08 * Math.sin(t * 0.5 + 0.7);
    }
    if (S.moonPath) {
      S.moonPath.material.opacity = 0.09 + 0.05 * Math.sin(t * 0.8 + 2.0);
      S.moonPath.rotation.z = 0.5 + 0.06 * Math.sin(t * 0.27);
    }
    // 地表の微光 — ふわりと浮き沈み
    if (S.glimmer) {
      const pos = S.glimmer.geometry.attributes.position;
      const d = S.glimmerData;
      for (let i = 0; i < d.length; i++) {
        const g = d[i];
        const x = g.x + Math.sin(t * 0.13 + g.phase) * g.drift;
        const z = g.z + Math.cos(t * 0.11 + g.phase * 1.3) * g.drift;
        pos.setXYZ(i, x,
          heightAt(x, z) + 0.18 + g.lift * (0.6 + 0.4 * Math.sin(t * g.speed + g.phase)),
          z);
      }
      pos.needsUpdate = true;
      S.glimmer.material.opacity = 0.42 + 0.12 * Math.sin(t * 0.35);
    }
  } catch (e) {
    console.warn('[terrain] update failed', e);
  }
}

export default { name: 'terrain', init, update };
