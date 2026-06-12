# hikari — インタラクティブ試作スタジオ

> 暗闇に光を灯す、ブラウザ完結のインタラクティブ試作集。コンセプトは「1日10試作」。

`index.html` を開くと、25のインタラクティブ試作のギャラリーが灯ります。
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

---

このスタジオは Claude (Fable 5) による自律イテレーションで制作・検証・記録されています。経緯は `docs/WORKLOG.md` に。
