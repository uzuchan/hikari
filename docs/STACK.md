# STACK — 使うアプリケーション / ライブラリ一覧

hikari は「**試作＝ブラウザで今すぐ動く**」「**本実装＝実空間で作るときの想定**」の二層構成。
本実装タグはこの一覧の語彙で書くこと。

---

## A. 試作レイヤ（ブラウザ・CDNのみ。インストール不要）

| 用途 | ライブラリ / API | 読み込み |
|---|---|---|
| 3D描画 | **Three.js 0.149.0** | `https://unpkg.com/three@0.149.0/build/three.min.js`（バージョン固定） |
| 2D描画・粒子 | **Canvas 2D API** | ブラウザ標準（依存なし） |
| 音・マイク解析 | **Web Audio API**（AnalyserNode） | ブラウザ標準 |
| カメラ・体の動き | **getUserMedia + Canvas差分**、必要なら **MediaPipe Tasks (CDN)** | 標準 / `@mediapipe/tasks-vision` |
| 入力 | **Pointer Events**（マウス/タッチ統一） | 標準 |
| フォント | Shippori Mincho / Zen Kaku Gothic New | Google Fonts（shared.css で import 済み） |

> 原則これだけで完結させる。重い物理/シェーダが要るときだけ最小限の CDN を足す。

### ローカル開発ツール（手元で動かす分）
| 用途 | 推奨 | 備考 |
|---|---|---|
| 静的プレビューサーバ | `python3 -m http.server`（標準） / `npx serve` | `/preview` が自動起動 |
| ブラウザ | Chrome / Safari | DevTools でコンソール監視 |
| 実ブラウザ自動検証 | **Playwright + Chromium**（Microsoft製・デファクト標準） | `node_modules` 導入済み。`_check/` のスイート群で実行（運用は `docs/BUILD-ROUTINE.md`） |
| エディタ | 任意 | ビルド工程なし |

---

## B. 本実装レイヤ（実空間で作るときの想定アプリ）

グループごとの典型ターゲット。試作のアイデアをこちらに移植する想定で「本実装タグ」を選ぶ。

### 壱 — 3D・AR空間
| アプリ | 言語 | 使いどころ |
|---|---|---|
| **Unity** + AR Foundation | C# | スマホ/タブレットAR、空間ゲーム |
| **Unity** URP / VR (OpenXR) | C# | ヘッドセットVR空間 |
| **Xcode / Swift (RealityKit, ARKit)** | Swift | iOSネイティブAR |
| (同期) **WebSocket / Photon** | — | 複数端末の状態同期 |

### 弐 — 身体・音センシング
| アプリ | 言語 | 使いどころ |
|---|---|---|
| **TouchDesigner** | ノード/Python | 映像インスタレーション、リアルタイム合成 |
| **Max / MSP** | パッチ | 音→映像、音響インタラクション |
| **Azure Kinect SDK** / Kinect | C++/C# | 骨格・深度トラッキング |
| **MediaPipe** | Python/JS | カメラでの手・姿勢推定 |

### 参 — タッチ・ドローイング
| アプリ | 言語 | 使いどころ |
|---|---|---|
| **openFrameworks** | C++ | 軽量・高速な描画インスタレーション |
| **Unity** + タッチウォール | C# | 大型タッチ面 |
| **TouchDesigner** + 赤外タッチ | ノード | 投影面タッチ |

### 肆 — マルチデバイス連携
| アプリ | 言語 | 使いどころ |
|---|---|---|
| **Xcode / Swift**（CoreMotion 加速度） | Swift | スマホをコントローラ化 |
| **WebSocket サーバ**（Node など） | JS | 端末↔会場の橋渡し |
| **プロジェクター投影** + Unity/TouchDesigner | — | 会場の壁・床への投影 |

---

## C. 本実装アプリの導入メモ（必要になったら）

> 試作だけならインストール不要。実装フェーズに入ったときの参考。

- **Unity**: Unity Hub からエディタ＋AR Foundation / OpenXR パッケージ。
- **Xcode**: App Store。Swift / ARKit / RealityKit / CoreMotion 同梱。
- **TouchDesigner**: 公式サイト（非商用は無償版）。
- **openFrameworks**: 公式から DL、Xcode/VS でビルド。
- **Max/MSP**: Cycling '74。
- **MediaPipe**: `pip install mediapipe` もしくは Web は CDN。
- **Azure Kinect SDK**: Microsoft 公式（対応ハード必須）。

各導入手順はバージョンで変わるため、実際に使う段で公式ドキュメントを参照する。
