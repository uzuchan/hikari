# hikari — インタラクティブ試作スタジオ

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Three.js](https://img.shields.io/badge/Three.js-000000?logo=threedotjs&logoColor=white)
![Canvas](https://img.shields.io/badge/Canvas_2D-E34F26?logo=html5&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-tested-2EAD33?logo=playwright&logoColor=white)
![No Build](https://img.shields.io/badge/build-not_required-brightgreen)

> 暗闇に光を灯す、ブラウザ完結のインタラクティブ試作集。コンセプトは「1日10試作」。

**デモ（部屋を暗くして全画面でどうぞ）: https://uzuchan.github.io/hikari/**

## スクリーンショット

<!-- TODO: ギャラリーと代表作（19 光の庭 など）のスクリーンショットを docs/screenshots/ に置いて，下のコメントを外してください． -->
<!--
| ギャラリー | 光の庭 |
| --- | --- |
| ![ギャラリー](docs/screenshots/gallery.png) | ![光の庭](docs/screenshots/niwa.png) |
-->

`index.html` を開くと、27のインタラクティブ試作のギャラリーが灯ります。
すべて 1枚の HTML で完結し、ビルド工程なし・外部依存は CDN(unpkg) のみ。
各作品は「**試作**(ブラウザで今動く叩き台)」と「**本実装**(実空間で作るときの想定技術)」の二層で宣言されています。

## 遊びかた

```bash
python3 -m http.server 8013
# → http://localhost:8013/index.html
```

部屋を暗くして、全画面で。スマホ縦画面にも対応しています。

## 構成

| 場所 | 中身 |
|---|---|
| `index.html` | ギャラリー(全作品のカード一覧) |
| `demos/` | 試作 01〜25(各1ファイル完結。19 のみモジュール分割の旗艦作「光の庭」) |
| `shared.css` | 共通デザインシステム(ほぼ黒の背景に5色の発光) |
| `CLAUDE.md` | スタジオの仕様書(自律量産のための基本指針) |
| `docs/` | 技術スタック対応表・量産ルーティーン・作業記録(WORKLOG) |
| `_check/` | Playwright による実ブラウザ検証スイート(全数スモーク・ジェスチャー網羅・スマホ縦・性能ソーク 等) |

## 検証

```bash
npm ci
node _check/smoke-all.mjs          # 全作品スモーク
_check/run-suite.sh ALL smoke-all.mjs mobile-sweep.mjs meta-audit.mjs
```

運用ルールは `docs/BUILD-ROUTINE.md` の「検証スイートの運用」を参照。

## 工夫した点

- **「試作⇄本実装」の二層宣言** — 全作品に「ブラウザで今動く叩き台」と「実空間で作るときの想定技術（Unity / TouchDesigner / openFrameworks 等）」を併記し、プロトタイプを実装計画まで接続した。
- **共通デザインシステム** — ほぼ黒の背景＋5色の発光パレットを `shared.css` に集約し、27作品のトーンを統一。色は直書き禁止のルールで運用。
- **実ブラウザでの自動検証** — Playwright による全数スモーク・ジェスチャー網羅・スマホ縦・性能ソークのスイートを整備し、「動くものだけが完成」を機械的に担保。
- **AIエージェントの統率による量産体制** — 仕様書（CLAUDE.md）・テンプレート・検証スイート・並列量産ルーティーンを設計し、Claude (Fable 5) の自律イテレーションで制作・検証・記録を回した。経緯は `docs/WORKLOG.md` に。
