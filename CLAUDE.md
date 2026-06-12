# hikari — インタラクティブ試作スタジオ

> 暗闇に光を灯す、ブラウザ完結のインタラクティブ試作集。
> コンセプトは「**1日10試作**」。1枚のHTMLで遊べる叩き台をつくり、各々に「本実装で使う技術」を添える。

このファイルは Claude が**自律的に**新しい試作を量産するための仕様書です。
新しいデモを作る／直すときは、まずここを読んでから着手すること。

---

## 0. Claude への基本指針（自動運転の原則）

1. **作る前に既存を読む。** `index.html`・`shared.css`・近いカテゴリの `demos/*.html` を1つ開いてから書く。我流より既存の語彙を真似る。
2. **1デモ = 1 self-contained HTML。** ビルド工程なし。`demos/NN-slug.html` を開けばその場で動く。外部依存は CDN(unpkg) のみ。
3. **必ず動かして確かめる。** 書いたら `/preview` で起動し、コンソールエラーゼロ・60fps・操作が効くことを目視。動かないものは「完成」と呼ばない。
4. **index.html に登録するまでが1タスク。** カードを足して初めて世界に存在する。
5. **量産は分担。** 複数デモを一度に頼まれたら `/build-batch`（複数エージェントのルーティーン）で並列に作る。`docs/BUILD-ROUTINE.md` 参照。
6. **詩情を削らない。** これは技術デモであると同時に作品集。タイトル・ヒント・色は世界観の一部。`docs/STACK.md` の語彙とトーンを守る。

---

## 1. ディレクトリ構成

```
260611_hikari/
├── CLAUDE.md            ← この仕様書（最初に読む）
├── index.html           ← 試作一覧。新デモはここにカード登録する
├── shared.css           ← 共通デザインシステム（色・フォント・HUD）。原則ここを増やす
├── demos/
│   ├── 01-planet.html   ← 1ファイル完結の試作。命名は NN-英小文字slug
│   └── …
├── _template/
│   ├── demo-2d.html     ← Canvas2D の出発点（コピーして使う）
│   └── demo-3d.html     ← Three.js の出発点（3D・AR向け）
├── docs/
│   ├── STACK.md         ← 試作⇄本実装で使うアプリ／ライブラリ一覧
│   └── BUILD-ROUTINE.md ← 複数エージェントによる量産ルーティーン
└── .claude/
    ├── settings.json    ← プレビューサーバ等の許可
    └── skills/          ← /new-demo /build-batch /preview
```

---

## 2. デザインシステム — 「暗闇に発光する」

すべて `shared.css` に定義済み。**色は直書きせず CSS 変数を使う。** 不足したら shared.css に足す。

| 変数 | 値 | 用途 |
|---|---|---|
| `--ink` | `#0a0a0f` | 背景（ほぼ黒） |
| `--glow-white` | `#f4f2ec` | 主役の光・文字 |
| `--glow-gold` | `#ffd98a` | 強調・本実装タグ・温かい光 |
| `--glow-cyan` | `#8ce8ff` | 試作タグ・冷たい光 |
| `--glow-pink` | `#ffaad4` | 差し色 |
| `--glow-violet` | `#c9a8ff` | 差し色 |
| `--dim` / `--dimmer` | 白の45% / 25% | 補助テキスト |
| `--serif` | Shippori Mincho | タイトル・番号（明朝） |
| `--sans` | Zen Kaku Gothic New | 本文 |

JS のキャンバス描画でも同じ5色を使う：
```js
const PALETTE = ['#ffd98a', '#ffaad4', '#c9a8ff', '#8ce8ff', '#f4f2ec'];
```

**発光の作法**：背景は `--ink`。明るい要素は `shadowColor` + `shadowBlur`（Canvas）/ `emissive`（Three.js）で滲ませる。白飛びさせず、暗がりに光が点る塩梅を狙う。

---

## 3. デモHTMLの骨格（必須構造）

新規デモは `_template/demo-2d.html`（または `-3d`）をコピーして作る。最低限これらを満たすこと：

- `<html lang="ja">` / `<meta charset>` / viewport
- `<title>NN タイトル</title>`
- `<link rel="stylesheet" href="../shared.css">`（デモは1階層下なので `../`）
- `<body data-screen-label="NN タイトル">`
- 全画面キャンバス：`<canvas id="cv" class="stage"></canvas>`（または独自レイアウト）
- **HUD 上**（戻る導線＋番号＋タイトル）:
  ```html
  <div class="hud-top">
    <div class="hud-title-block">
      <a class="hud-back" href="../index.html">← もどる</a>
      <div class="hud-no">PROTOTYPE NN</div>
      <div class="hud-title">タイトル</div>
    </div>
  </div>
  ```
- **HUD 下**（操作ヒント＋二層タグ）:
  ```html
  <div class="hud-bottom">
    <div class="hud-hint">操作の説明（1〜2行）</div>
    <div class="hud-tech">
      <div class="tech-row"><span class="tech-label">試作</span><span class="tech-tag">Canvas 2D</span></div>
      <div class="tech-row"><span class="tech-label">本実装</span><span class="tech-tag primary">Unity (C#)</span></div>
    </div>
  </div>
  ```
- マイク/カメラ許可など起動操作が要るときは `.action-btn` を置く（shared.css にスタイルあり）。

---

## 4. 実装パターン（コピーして使う定石）

### Canvas 2D の土台
```js
const cv = document.getElementById('cv');
const cx = cv.getContext('2d');
const DPR = Math.min(devicePixelRatio, 2);   // Retina対応。2で頭打ち
let W, H;
function resize() { W = cv.width = innerWidth * DPR; H = cv.height = innerHeight * DPR; /* 再生成 */ }
resize(); addEventListener('resize', resize);

function loop(t) {
  cx.fillStyle = 'rgba(8,8,14,0.3)';  // 黒を薄く重ねて残光（軌跡）を作る
  cx.fillRect(0, 0, W, H);
  // …描画…
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```
- 座標は常に `* DPR` で扱う。`clientX/Y` を使うときは `* DPR`。
- 発光は**事前レンダのスプライト**（小さな別キャンバスに `shadowBlur` で描いて使い回す）にすると軽い。`drawImage` でばら撒く。

### 入力（マウス・タッチ統一）
```js
addEventListener('pointerdown', e => { /* p.clientX, p.clientY */ });
addEventListener('pointermove', e => { … });
addEventListener('pointerup',   () => { … });
```
`touch-action: none`（`canvas.stage` に設定済み）でスクロールを止める。タッチ前提で設計する。

### Three.js（3D・AR空間グループ）
```html
<script src="https://unpkg.com/three@0.149.0/build/three.min.js"></script>
```
- バージョンは **0.149.0 に固定**（既存デモと揃える）。
- `WebGLRenderer({ canvas, antialias:true, alpha:true })` + `setPixelRatio(Math.min(devicePixelRatio,2))`。
- 構成の定石：`Scene` →『world: Group』に中身を入れて回す → `AmbientLight` + `DirectionalLight` → 星空は `Points`、大気グローは放射グラデの `CanvasTexture` を貼った `Sprite`。
- リサイズで `renderer.setSize` + `camera.aspect` + `updateProjectionMatrix`。
- 詳しくは `_template/demo-3d.html`・`demos/01-planet.html` を雛形に。

### 音（マイク / Web Audio）
```js
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const ac = new (window.AudioContext || window.webkitAudioContext)();
const analyser = ac.createAnalyser(); analyser.fftSize = 512;
ac.createMediaStreamSource(stream).connect(analyser);
const data = new Uint8Array(analyser.frequencyBinCount);
// 毎フレーム analyser.getByteFrequencyData(data) → 低域(息) / 全域(音量) を取り出す
```
- 許可は必ずユーザー操作（ボタン）起点。**マイク/カメラ不可のフォールバック**（スワイプを風に等）を必ず用意する。`demos/03-breath.html` 参照。

---

## 5. 二層思想とカテゴリ

各デモは「**試作（ブラウザで今動く叩き台）**」と「**本実装（実空間で作るときの想定技術）**」の2つを必ず宣言する。これがこのプロジェクトの背骨。`index.html` は4グループに分かれる：

| # | グループ | 試作 | 本実装の典型 |
|---|---|---|---|
| 壱 | 3D・AR空間 | Three.js + Canvas | Unity + AR Foundation / VR (OpenXR) / Swift |
| 弐 | 身体・音センシング | Canvas + Webカメラ・マイク | Azure Kinect / MediaPipe / TouchDesigner / Max・MSP |
| 参 | タッチ・ドローイング | Canvas 2D | openFrameworks (C++) / Unity + タッチウォール |
| 肆 | マルチデバイス連携 | Canvas（1画面で擬似再現） | Swift(加速度) + WebSocket + プロジェクター投影 |

新デモは必ずどれかのグループに属させ、本実装タグはそのグループの典型から選ぶ（`docs/STACK.md` に対応表）。

---

## 6. 新しいデモの作り方（手順）

`/new-demo "コンセプト"` を使うのが速いが、手でやるなら：

1. **番号とslug決め**：`demos/` の最大番号+1。slug は英小文字ハイフン（例 `11-corridor.html`）。
2. **テンプレ複製**：2D なら `_template/demo-2d.html`、3D なら `-3d` をコピー。
3. **`{{NN}} {{TITLE}} {{HINT}} {{PROTO}} {{PROD}}` を置換**し、世界を実装。
4. **`/preview` で起動・目視**：エラーゼロ／60fps／操作が効く／戻るリンクが効く。
5. **index.html に登録**：該当グループ `section.group` 内の `.cards` に1枚追加：
   ```html
   <a class="card" href="demos/11-corridor.html">
     <div class="card-top"><span class="card-no">11</span><span class="card-title">光の回廊</span></div>
     <div class="card-desc">一言で世界を説明する詩的な紹介。</div>
     <div class="card-tech">
       <span class="ct proto">試作: Canvas 2D</span>
       <span class="ct prod">本実装: openFrameworks (C++)</span>
     </div>
   </a>
   ```
   `.ct.proto` は試作、`.ct.prod` は本実装。本文タグと一致させる。

---

## 7. 複数エージェントによる量産ルーティーン

「N個まとめて作って」と言われたら**1デモ=1サブエージェント**で並列化する。詳細手順とプロンプト雛形は **`docs/BUILD-ROUTINE.md`**。要点：

1. オーケストレータ（あなた）が N 個のコンセプト案を出し、各案に「グループ・試作技術・本実装技術」を割り当てる。
2. 連番を**先に確定**して衝突を防ぐ（agent A=11, B=12 …）。各エージェントには「自分の担当番号・slug・コンセプト・グループ」を渡す。
3. 各サブエージェントは**この CLAUDE.md とテンプレを読み**、`demos/NN-slug.html` を1枚作って自己検証して返す。**index.html は触らせない**（衝突するため）。
4. 全員の完了後、**オーケストレータが index.html にまとめて登録**し、`/preview` で一覧→各デモを通しで確認。

`/build-batch "テーマ" 5` の形で起動できる。

---

## 8. 品質チェックリスト（完成の定義）

- [ ] `demos/NN-slug.html` 単体で開いて動く（CDN以外の外部依存なし）
- [ ] DevTools コンソールにエラー・警告なし
- [ ] アニメーションが滑らか（重い処理はスプライト化・粒子数調整）
- [ ] マウスとタッチ両方で操作できる（`pointer*` イベント）
- [ ] カメラ/マイク使用時はフォールバックあり
- [ ] HUD（戻る・番号・タイトル・ヒント・試作/本実装タグ）が揃っている
- [ ] 配色は `--ink` 背景に PALETTE の発光。白飛び・低コントラストなし
- [ ] `index.html` に正しいグループでカード登録済み（本文と同じ技術タグ）
- [ ] 全画面・暗所で映える（`部屋を暗くして全画面` が映える絵か）
- [ ] `_check/` に専用テストを書き、`meta-audit.mjs` のページ表に1行追記（全数スイートは自動列挙）

---

## 9. プレビュー / 検証

ローカル静的サーバで開く（`file://` だとフォント等で詰まることがある）。`/preview` が自動でやる。手動なら：
```bash
python3 -m http.server 8013 --directory /Users/<redacted>/Desktop/dev/260611_hikari
# → http://localhost:8013/index.html / http://localhost:8013/demos/NN-slug.html
```

実ブラウザの自動検証は **`_check/` の Playwright スイート**で行う（導入済み）。台帳・変更種別ごとの必須回帰・直列実行の鉄則は **`docs/BUILD-ROUTINE.md` の「検証スイートの運用」** を参照。

---

## 10. 使うアプリケーション（スタック）

試作で使う CDN ライブラリと、本実装で使う実アプリ（Unity / Xcode・Swift / TouchDesigner / openFrameworks / Max・MSP / Azure Kinect SDK / MediaPipe …）の一覧と導入は **`docs/STACK.md`**。本実装タグはこの一覧の語彙で書く。

---

## 11. モデル

このスタジオは **Fable 5（`claude-fable-5`）** で回す前提。表現の手数とテンポを優先する作業のため。
切替はユーザー操作：`/model` を開いて **Fable 5** を選ぶ（または `/model claude-fable-5`）。
