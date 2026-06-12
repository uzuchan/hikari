// audio.js — 光の庭の音 / 環境ドローン・ペンタトニックのプラック・マイク→風
//            + 風のノイズ層・夜の虫の鈴・天候連動（星屑のシマー / 薄霧のくぐもり）
//            + 季節連動（season:change）— 夜の虫・鈴の趣が春夏秋冬で移ろう
// 契約: default export {name,'init','update'}。他モジュール非import。連携は ctx(bus/state) のみ。
// AudioContext が作れない環境でも、視覚（windの自動ゆらぎ）だけで成立するよう全面防御。
// すべての音は master（とその後段の mistFilter）を経由する＝ミュートで全部消える。

// ---- 内部状態（モジュールローカル） ----
let ac = null;            // AudioContext（app:start 後に生成）
let master = null;        // マスターゲイン
let delaySend = null;     // プラック残響用ディレイへの送り
let muted = false;
let lastNoteAt = 0;       // 連打クールダウン用 (ms)

let analyser = null;      // マイク AnalyserNode
let micData = null;
let micActive = false;
let micWind = 0;          // マイク由来の風（平滑値）

let windT = Math.random() * 100;  // フォールバック揺らぎの時刻
let clockT = 0;           // 音スケジューラ用の積算秒（dt の和）

// 風の音（ループノイズ → bandpass → gain → master）
let windGain = null;
let windFilter = null;
let lastWindParamAt = -1; // setTargetAtTime の呼び過ぎを防ぐスロットル

// 夜の虫・鈴の層
let nextChimeT = -1;

// 季節連動（season:change / state.season）
let seasonMode = null;    // null = 初回の春が来るまで（デフォルトの趣のまま）
let droneO2 = null;       // ドローンのうなり用オシレータ。季節でごくわずかに揺らす

// 天候連動
let weatherMode = 'clear';  // 'clear' | 'stardust' | 'mist'
let mistFilter = null;      // master 後段の常設ローパス（平常 ~18000Hz / 霧 ~2200Hz）
let shimmerGain = null;     // 星屑の雨のシマー層のフェード用
let nextShimmerT = 0;

// Aマイナーペンタトニック 2オクターブ（A3起点: A C D E G）
const SEMITONES = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
const BASE_FREQ = 220; // A3

function freqFromPitch(pitch) {
  const p = Math.min(1, Math.max(0, +pitch || 0));
  const idx = Math.min(SEMITONES.length - 1, Math.floor(p * SEMITONES.length));
  return BASE_FREQ * Math.pow(2, SEMITONES[idx] / 12);
}

// ---- 夜の虫・鈴の季節テーブル ----
// semis: BASE_FREQ(A3=220Hz) からの半音。Aマイナーペンタトニックの高域のみ
// wait: 次の一粒までの秒 [min,max] / dec: 減衰秒 / gain: ひと粒の大きさ / atk: 立ち上がり秒
const CHIME_DEFAULT = {   // 季節がまだ訪れていない夜（従来の趣そのまま）
  wait: [4, 14], semis: [36, 39, 41, 43, 46, 48],          // 1760〜3520Hz
  dec: [0.45, 1.15], gain: [0.018, 0.04], atk: 0.006, type: 'sine',
};
const SEASON_CHIME = {
  haru:  { wait: [4, 11],  semis: [39, 41, 43, 46, 48],    // 2093〜3520Hz 明るくやわらかい鈴
           dec: [0.5, 1.1],  gain: [0.018, 0.04],  atk: 0.006, type: 'sine' },
  natsu: { wait: [2.5, 8], semis: [41, 43, 46, 48],        // 2349〜3520Hz 「リッ」と短い虫の粒
           dec: [0.3, 0.6],  gain: [0.012, 0.026], atk: 0.003, type: 'triangle' },
  aki:   { wait: [6, 16],  semis: [34, 36, 39, 41, 43],    // 1568〜2637Hz 乾いた澄んだ鈴
           dec: [0.8, 1.4],  gain: [0.016, 0.034], atk: 0.008, type: 'sine' },
  fuyu:  { wait: [10, 24], semis: [43, 46, 48, 51],        // 2637〜4186Hz まれに一粒、最も高く小さく
           dec: [1.2, 2.0],  gain: [0.008, 0.018], atk: 0.012, type: 'sine' },
};
const SEASON_BEAT = { haru: 0.35, natsu: 0.5, aki: 0.28, fuyu: 0.18 };  // ドローンのうなり速さ[Hz]

function chimeSpec() { return (seasonMode && SEASON_CHIME[seasonMode]) || CHIME_DEFAULT; }
function chimeWait() { const c = chimeSpec(); return c.wait[0] + Math.random() * (c.wait[1] - c.wait[0]); }

// 季節を音へ反映（bus: season:change が本線 / state.season は保険）
function applySeason(season) {
  if (!season || !SEASON_CHIME[season] || season === seasonMode) return;
  seasonMode = season;
  // 次の一粒を新しい季節の呼吸で予約し直す（夏はすぐ細かく、冬は遠くまばらに）
  if (nextChimeT >= 0) nextChimeT = clockT + chimeWait();
  // ドローンのうなりも季節でごくわずかに（春0.35 / 夏0.5 / 秋0.28 / 冬0.18 Hz）
  if (ac && droneO2) {
    try { droneO2.frequency.setTargetAtTime(55 + (SEASON_BEAT[season] || 0.35), ac.currentTime, 8); } catch (_) {}
  }
}

// ---- AudioContext と環境ドローン ----
function setupAudio() {
  if (ac) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    if (ac.state === 'suspended') ac.resume().catch(() => {});

    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.25;
    // master の後段に常設ローパス。平常時はほぼ素通し、薄霧の間だけ閉じて音をくぐもらせる
    try {
      mistFilter = ac.createBiquadFilter();
      mistFilter.type = 'lowpass';
      mistFilter.frequency.value = 18000;
      mistFilter.Q.value = 0.0001;
      master.connect(mistFilter);
      mistFilter.connect(ac.destination);
    } catch (e) {
      mistFilter = null;
      master.connect(ac.destination);
    }

    // 残響感: 軽いフィードバックディレイ
    delaySend = ac.createGain();
    delaySend.gain.value = 0.35;
    const delay = ac.createDelay(1.0);
    delay.delayTime.value = 0.28;
    const fb = ac.createGain();
    fb.gain.value = 0.3;
    const wet = ac.createGain();
    wet.gain.value = 0.5;
    delaySend.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(master);

    startDrone();
    startWindNoise();
    setupShimmer();
    applyWeather(weatherMode);   // 生成前に天候が変わっていた場合の追従
  } catch (e) {
    console.warn('[audio] AudioContext 生成失敗（視覚のみで続行）', e);
    ac = null;
  }
}

function startDrone() {
  try {
    const droneGain = ac.createGain();
    droneGain.gain.value = 0;
    droneGain.connect(master);
    // ふわっと立ち上げ
    droneGain.gain.setTargetAtTime(0.16, ac.currentTime, 4);

    // 低いサイン2本 — わずかにずらして「うなり」を作る
    const o1 = ac.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = 55;          // A1
    const o2 = ac.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 55 + (SEASON_BEAT[seasonMode] || 0.35);  // うなり ~0.35Hz（季節で僅かに変わる）
    droneO2 = o2;
    const g2 = ac.createGain();
    g2.gain.value = 0.7;
    o1.connect(droneGain);
    o2.connect(g2);
    g2.connect(droneGain);

    // ゆっくりの LFO で全体をたゆたわせる
    const lfo = ac.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(droneGain.gain);

    o1.start(); o2.start(); lfo.start();
  } catch (e) {
    console.warn('[audio] ドローン起動失敗', e);
  }
}

// ---- 風の音（ループするノイズ → bandpass。state.wind に毎フレーム追従） ----
function startWindNoise() {
  try {
    // 2秒のノイズバッファを自前生成（外部ファイル不使用）
    const len = Math.floor(ac.sampleRate * 2);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    windFilter = ac.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 240;
    windFilter.Q.value = 0.9;

    windGain = ac.createGain();
    windGain.gain.value = 0;          // 無風時はほぼ無音

    src.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    src.start();
  } catch (e) {
    console.warn('[audio] 風ノイズ起動失敗', e);
    windGain = null; windFilter = null;
  }
}

// update から呼ぶ: wind(0..1) に gain とフィルタ周波数を滑らかに追従させる
function followWind(w) {
  if (!ac || !windGain || !windFilter) return;
  if (clockT - lastWindParamAt < 0.08) return;   // ~12Hz に間引き（timelineの肥大防止）
  lastWindParamAt = clockT;
  try {
    const k = w * w;                              // 弱い息では鳴らない曲線
    windGain.gain.setTargetAtTime(0.08 * k, ac.currentTime, 0.12);
    windFilter.frequency.setTargetAtTime(240 + 1700 * w, ac.currentTime, 0.15);
  } catch (_) {}
}

// ---- 夜の虫・鈴（高域のごく小さな音。風が強い間は鳴きやむ。趣は季節で移ろう） ----
function chime() {
  if (!ac || !master) return;
  try {
    // ペンタトニック高音域から、季節の窓で1音
    const c = chimeSpec();
    const semi = c.semis[Math.floor(Math.random() * c.semis.length)];
    const f = BASE_FREQ * Math.pow(2, semi / 12);
    const t0 = ac.currentTime;
    const dec = c.dec[0] + Math.random() * (c.dec[1] - c.dec[0]);

    const osc = ac.createOscillator();
    osc.type = c.type;
    osc.frequency.value = f;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(c.gain[0] + Math.random() * (c.gain[1] - c.gain[0]), t0 + c.atk);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + c.atk + dec);
    osc.connect(env);

    // ランダムなパン（StereoPannerNode が無ければ省略）
    let out = env;
    if (typeof ac.createStereoPanner === 'function') {
      const pan = ac.createStereoPanner();
      pan.pan.value = (Math.random() * 2 - 1) * 0.8;
      env.connect(pan);
      out = pan;
    }
    out.connect(master);
    if (delaySend) out.connect(delaySend);        // かすかな残響

    osc.start(t0);
    osc.stop(t0 + c.atk + dec + 0.25);
    osc.onended = () => { try { osc.disconnect(); env.disconnect(); out.disconnect(); } catch (_) {} };
  } catch (e) {
    console.warn('[audio] 鈴の音失敗', e);
  }
}

// ---- 天候連動（weather:change） ----
function setupShimmer() {
  try {
    shimmerGain = ac.createGain();
    shimmerGain.gain.value = 0;      // weather:change でフェードイン/アウト
    shimmerGain.connect(master);
  } catch (e) {
    shimmerGain = null;
  }
}

// 星屑の雨のあいだ、まばらに重ねる高域のきらめき1粒
function shimmerNote() {
  if (!ac || !shimmerGain) return;
  try {
    const semi = SEMITONES[Math.floor(Math.random() * SEMITONES.length)] + 24 + (Math.random() < 0.4 ? 12 : 0);
    const f = BASE_FREQ * Math.pow(2, semi / 12);
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.012 + Math.random() * 0.014, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3 + Math.random() * 0.5);
    osc.connect(env);
    let out = env;
    if (typeof ac.createStereoPanner === 'function') {
      const pan = ac.createStereoPanner();
      pan.pan.value = Math.random() * 2 - 1;
      env.connect(pan);
      out = pan;
    }
    out.connect(shimmerGain);
    osc.start(t0);
    osc.stop(t0 + 1.0);
    osc.onended = () => { try { osc.disconnect(); env.disconnect(); out.disconnect(); } catch (_) {} };
  } catch (_) {}
}

// 天候モードを音へ反映（AudioContext 未生成でもモードだけ覚えておく）
function applyWeather(mode) {
  weatherMode = mode || 'clear';
  if (!ac) return;
  try {
    const t0 = ac.currentTime;
    if (shimmerGain) {
      // 星屑の雨: シマー層をゆっくりフェードイン、晴れたらフェードアウト
      shimmerGain.gain.setTargetAtTime(weatherMode === 'stardust' ? 1 : 0, t0, weatherMode === 'stardust' ? 2.5 : 1.8);
    }
    if (mistFilter) {
      // 薄霧: 音をくぐもらせ、明けたら開く
      mistFilter.frequency.setTargetAtTime(weatherMode === 'mist' ? 2200 : 18000, t0, weatherMode === 'mist' ? 2.5 : 3.5);
    }
  } catch (_) {}
}

// ---- プラック音 ----
function pluck(pitch, vol) {
  if (!ac || !master) return;
  const now = performance.now();
  if (now - lastNoteAt < 60) return;   // 連打クールダウン 60ms
  lastNoteAt = now;
  try {
    const v = Math.min(1, Math.max(0, +vol || 0.5));
    const f = freqFromPitch(pitch);
    const t0 = ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.12 + 0.28 * v, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);

    osc.connect(env);
    env.connect(master);
    if (delaySend) env.connect(delaySend);
    osc.start(t0);
    osc.stop(t0 + 1.0);
    osc.onended = () => { try { osc.disconnect(); env.disconnect(); } catch (_) {} };
  } catch (e) {
    console.warn('[audio] pluck失敗', e);
  }
}

// ---- マイク → 風 ----
async function enableMic(btn) {
  try {
    setupAudio();                      // クリックも操作起点なのでここで生成可
    if (!ac) throw new Error('no AudioContext');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const src = ac.createMediaStreamSource(stream);
    analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    micData = new Uint8Array(analyser.frequencyBinCount);
    src.connect(analyser);             // destination へは繋がない（ハウリング防止）
    micActive = true;
    btn.textContent = '風をきいている …';
    btn.classList.add('niwa-mic-on');
  } catch (e) {
    console.warn('[audio] マイク不可（自動の風で続行）', e);
    btn.textContent = 'マイクは使えないみたい';
    setTimeout(() => { try { btn.textContent = '息を風に'; } catch (_) {} }, 2400);
  }
}

function readMicWind() {
  if (!micActive || !analyser) return null;
  try {
    analyser.getByteFrequencyData(micData);
    let sum = 0;
    for (let i = 1; i < 24; i++) sum += micData[i];  // 低域＝息のエネルギー
    const lvl = Math.min(1, (sum / 24 / 255) * 1.8);
    micWind += (lvl - micWind) * (lvl > micWind ? 0.25 : 0.04); // 立ち上がり速く減衰ゆっくり
    return Math.min(1, Math.max(0, micWind));
  } catch (e) {
    return null;
  }
}

// Perlin風: 周期の違うサインの重ねでゆっくり 0〜0.25 を漂う
function autoWind(t) {
  const n = 0.5
    + 0.30 * Math.sin(t * 0.13)
    + 0.22 * Math.sin(t * 0.047 + 1.7)
    + 0.18 * Math.sin(t * 0.211 + 4.2);
  return Math.min(0.25, Math.max(0, n * 0.25));
}

// ---- UI（マイクとミュート） ----
function buildUI(ctx) {
  try {
    const root = ctx && ctx.dom && ctx.dom.root;
    if (!root) return;
    const style = document.createElement('style');
    style.textContent = `
      .niwa-audio-bar { position: fixed; top: 70px; right: 26px; z-index: 11;
        display: flex; align-items: center; gap: 8px; pointer-events: none; }
      .niwa-audio-bar .action-btn { pointer-events: auto; }
      .niwa-mic-on { border-color: rgba(140,232,255,0.55) !important;
        box-shadow: 0 0 18px rgba(140,232,255,0.25); }
      .niwa-mute-btn { padding: 9px 12px !important; line-height: 0; }
      .niwa-mute-btn svg { display: block; stroke: currentColor; fill: none;
        stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round;
        width: 16px; height: 16px; opacity: 0.85; }
      .niwa-muted { opacity: 0.45; }
      @media (max-width: 480px) {
        .niwa-audio-bar .action-btn { padding: 13px 22px; }
        .niwa-mute-btn { padding: 13px 14px !important; }
      }
    `;
    root.appendChild(style);

    const bar = document.createElement('div');
    bar.className = 'niwa-audio-bar';
    // #ui-root > * { pointer-events:auto }（ID指定）がクラスの none に勝つため inline で打ち消す
    bar.style.pointerEvents = 'none';

    const micBtn = document.createElement('button');
    micBtn.className = 'action-btn';
    micBtn.textContent = '息を風に';
    micBtn.addEventListener('click', () => { if (!micActive) enableMic(micBtn); });

    // 細線SVGのスピーカー。muted=true で斜線が入る
    const speakerSvg = (m) =>
      `<svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.5 6 L5 6 L8.5 3.2 L8.5 12.8 L5 10 L2.5 10 Z"/>
        ${m
          ? '<line x1="11" y1="5" x2="14.5" y2="11"/>'
          : '<path d="M10.8 6.2 Q12 8 10.8 9.8"/><path d="M12.4 4.8 Q14.2 8 12.4 11.2"/>'}
      </svg>`;

    const muteBtn = document.createElement('button');
    muteBtn.className = 'action-btn niwa-mute-btn';
    muteBtn.innerHTML = speakerSvg(false);
    muteBtn.title = '音を消す / もどす';
    muteBtn.setAttribute('aria-label', '音を消す / もどす');
    muteBtn.addEventListener('click', () => {
      muted = !muted;
      muteBtn.classList.toggle('niwa-muted', muted);
      muteBtn.innerHTML = speakerSvg(muted);
      try {
        if (ac && master) master.gain.setTargetAtTime(muted ? 0 : 0.25, ac.currentTime, 0.2);
      } catch (_) {}
    });

    bar.appendChild(muteBtn);
    bar.appendChild(micBtn);
    root.appendChild(bar);
  } catch (e) {
    console.warn('[audio] UI構築失敗', e);
  }
}

// ---- モジュール本体 ----
export default {
  name: 'audio',

  init(ctx) {
    try {
      buildUI(ctx);
      if (ctx && ctx.bus) {
        ctx.bus.on('app:start', () => { try { setupAudio(); } catch (_) {} });
        ctx.bus.on('note', (d) => {
          try { pluck(d && d.pitch, d && d.vol); } catch (_) {}
        });
        // 庭の出来事にも、ささやかな音を添える
        ctx.bus.on('seed:planted', () => {
          try { pluck(0.15 + Math.random() * 0.2, 0.4); } catch (_) {}
        });
        ctx.bus.on('plant:mature', () => {
          try { pluck(0.65 + Math.random() * 0.3, 0.5); } catch (_) {}
        });
        // 天候の移ろい（weather が emit）→ シマー層と霧のくぐもり
        ctx.bus.on('weather:change', (d) => {
          try { applyWeather(d && d.mode); } catch (_) {}
        });
        // 季節の移ろい（seasons が emit）→ 夜の虫・鈴の趣を替える
        ctx.bus.on('season:change', (d) => {
          try { applySeason(d && d.season); } catch (_) {}
        });
      }
    } catch (e) {
      console.warn('[audio] init失敗（視覚のみで続行）', e);
    }
  },

  update(dt, t, ctx) {
    try {
      const d = (typeof dt === 'number' && isFinite(dt)) ? Math.min(dt, 0.1) : 0.016;
      windT += d;
      clockT += d;
      const mic = readMicWind();
      const w = (mic !== null) ? mic : autoWind(windT);
      if (ctx && ctx.state) ctx.state.wind = w;

      // 風の音 — 息を吹くと風が「聞こえる」
      followWind(w);

      // bus を聞き逃した場合の保険: state.weather / state.season からも追従
      const wm = ctx && ctx.state && ctx.state.weather;
      if (wm && wm !== weatherMode) applyWeather(wm);
      const sn = ctx && ctx.state && ctx.state.season;
      if (sn && sn !== seasonMode) applySeason(sn);

      if (ac) {
        // 夜の虫・鈴 — 間合いも音色も季節しだい（初回の春までは4〜14秒）。風が強い間（w>0.5）は鳴きやむ
        if (nextChimeT < 0) nextChimeT = clockT + chimeWait();
        if (w > 0.5) {
          nextChimeT = Math.max(nextChimeT, clockT + 3);   // 風がやんでから戻ってくる
        } else if (clockT >= nextChimeT) {
          chime();
          nextChimeT = clockT + chimeWait();
        }
        // 星屑の雨のシマー — 短い高音をまばらに（フェードは shimmerGain が担当）
        if (weatherMode === 'stardust' && clockT >= nextShimmerT) {
          shimmerNote();
          nextShimmerT = clockT + 0.5 + Math.random() * 1.6;
        }
      }
    } catch (e) {
      // updateは毎フレームなので静かに握る
    }
  },
};
