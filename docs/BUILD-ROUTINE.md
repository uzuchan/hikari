# BUILD-ROUTINE — 複数エージェントによる量産ルーティーン

「N個まとめて作って」と頼まれたときの手順。**1デモ = 1サブエージェント**で並列に作り、最後にオーケストレータ（あなた）がまとめて登録・検証する。

`/build-batch "テーマ" 5` がこの手順を自動実行する。以下はその中身。

---

## 役割分担

```
 オーケストレータ（あなた / メイン会話）
 ├─ 1. コンセプト案を N 個立てる（タイトル・グループ・試作技術・本実装技術）
 ├─ 2. 連番を先に確定して各エージェントに配る（衝突防止）
 ├─ 3. N 体のサブエージェントを並列起動（各自 1 デモを作成・自己検証）
 ├─ 4. 全員の完了を待つ
 ├─ 5. index.html に全カードをまとめて登録（← オーケストレータだけが触る）
 └─ 6. /preview で一覧→各デモを通し確認、問題あれば該当エージェントに修正指示
```

> **重要**：index.html はオーケストレータだけが編集する。複数エージェントに同時編集させると競合する。各サブエージェントは `demos/NN-slug.html` の新規作成のみ。

---

## 手順詳細

### 1. コンセプト出し
テーマからN個の世界を考える。各案に必ず割り当てる：
- **番号**（既存 `demos/` の最大+1 から連番）
- **slug**（英小文字ハイフン）
- **グループ**（壱〜肆。`CLAUDE.md §5`）
- **試作技術 / 本実装技術**（`docs/STACK.md` の語彙）
- **一行コンセプト**（詩的に）

### 2. 連番確定
例：既存が 10 までなら → A=11, B=12, C=13, D=14, E=15。これを各エージェントの指示に明記し、番号衝突を防ぐ。

### 3. サブエージェント並列起動
`Agent` ツール（subagent_type は `general-purpose`）を**1メッセージ内で複数同時に**呼ぶ。各エージェントへのプロンプト雛形：

```
あなたは hikari スタジオの試作ビルダー。担当を1つ作る。

- リポジトリ: /Users/<redacted>/Desktop/dev/260611_hikari
- まず必ず読む: CLAUDE.md / shared.css / 近いグループの既存 demos/*.html を1つ
- 出発テンプレ: _template/demo-2d.html（3D・AR空間なら demo-3d.html）

担当:
- 番号: 11   slug: corridor   ファイル: demos/11-corridor.html
- グループ: 参 — タッチ・ドローイング
- タイトル: 光の回廊
- コンセプト: <一行>
- 試作: Canvas 2D / 本実装: openFrameworks (C++)

やること:
1) テンプレを demos/11-corridor.html にコピーし {{...}} を置換して世界を実装
2) DPR対応・pointerイベント・残光ループ・PALETTE発光 などの定石を守る（CLAUDE.md §4）
3) ローカルサーバで開いて自己検証（コンソールエラー0 / 操作が効く / 戻るリンク可）
4) index.html は絶対に編集しない（オーケストレータが後でまとめて登録する）

完了したら、登録用にこの1行を返す:
  グループ=参 / href=demos/11-corridor.html / no=11 / title=光の回廊 / desc=<紹介文> / proto=Canvas 2D / prod=openFrameworks (C++)
```

各エージェントが返す「登録用1行」を集める。

### 4〜5. まとめて登録
集めた行を `index.html` の該当 `section.group > .cards` に変換して挿入（カード雛形は `CLAUDE.md §6`）。グループごとに正しい section に入れる。

### 6. 通し検証
`/preview` で `index.html` を開き、各カード→各デモを順に確認。落ちているものは担当エージェントに「番号NN、症状」を渡して修正させる。

---

## 並列数の目安
- 一度に **3〜6体**が扱いやすい。多すぎると確認が追いつかない。
- 重い（Three.jsや物理）デモは数を絞る。

## やらないこと
- サブエージェントに index.html を触らせない
- 番号・slug を被らせない（起動前に確定）
- テンプレを無視して我流で書かせない（必ず CLAUDE.md を読ませる）

---

## 検証スイートの運用（_check/ — Playwright 実ブラウザ）

検証は `_check/` の Playwright スクリプト群で行う（Chromium 同梱、`package.json` は `"type":"module"`、サーバは `python3 -m http.server 8013` を共有）。

### スイート台帳（何がどこを守るか）
| スクリプト | 守備範囲 |
|---|---|
| `smoke-all.mjs` / `gesture-all.mjs` / `mobile-sweep.mjs` | `demos/*.html` 全数（**自動列挙** — 新作は置くだけで対象になる）。スモーク / ジェスチャー網羅 / スマホ縦 |
| `meta-audit.mjs` | 全ページの head メタと favicon/og 資産（**新作はページ表に1行追記が必要**） |
| `mobile-gallery-check.mjs` / `mobile-gallery-scroll.mjs` | ギャラリーのスマホ縦・スクロール挙動 |
| `niwa-flow.mjs` / `niwa-touch-test.mjs` / `garden-letter-test.mjs` / `photo-test.mjs` / `footprints-test.mjs` | 19 光の庭（マウス通し / タッチ通し30項目 / 手紙 / 写真 / 足あと） |
| `audio-soundscape-test.mjs` / `seasons-test.mjs` / `season-audio-test.mjs` / `natsu-check.mjs` | 光の庭の音・天候・季節 |
| `planet-mobile-test.mjs` / `library-touch-test.mjs` / `hint-audit-test.mjs` | 01 / 02 / ヒント文言の個別回帰 |
| `echo-cave-test.mjs` / `furiko-test.mjs` ほか | 新作の専用テスト（**新作1本につき1本書く**） |
| `perf-soak.mjs <start> <count>` / `mist-soak.mjs` | 長時間の FPS・ヒープ点検 / 天候の自然発生観測（随時） |
| `run-suite.sh <バッチ名> <スクリプト…>` | バッチ実行。合否を `final-audit.log` に1行ずつ追記 |

### 変更の種類 → 必須回帰
- **19-niwa の UI/モジュールを変えた** → `niwa-touch-test` と `niwa-flow` を必ず**両方**（過去、マウスは無事でタッチだけ壊れた実例あり）
- **shared.css を変えた** → `mobile-sweep` 全数 + 独自 @media を持つ 01 / 19 の個別テスト
- **新作を足した** → 専用テストを書く + `meta-audit.mjs` のページ表に1行（smoke/gesture/mobile は自動列挙のため追記不要）
- **音・季節・天候まわり** → audio/seasons 系4本を**負荷のないクリーン環境**で

### 鉄則
1. **タイミング系テストは並走させない**。audio は dt を 0.1s でクランプするため、重負荷ではこだま・鈴の間隔が実時間で伸びて誤検出する。バッチは直列、疑わしい失敗は負荷ゼロで単独再実行してから裁定。
2. **バッチ起動コマンドに `&` を混ぜない**（完了追跡が外れて直列保証が壊れた実例あり）。
3. 合否基準は console error / pageerror **0件**。スクリーンショットは機械判定の補助ではなく**必ず目視**する。

---

## 記録係（scribe）

量産ループの経緯は **`docs/WORKLOG.md`** に残す。担当は「記録係」エージェント。

- **役割**: 各イテレーション完了時に、`WORKLOG.md` の先頭（冒頭説明の直下）へ次の内容を1エントリ追記する：
  - **日時**（見出し）
  - **作ったもの**（番号・タイトル・技術。アーキテクチャ変更があればそれも）
  - **検証結果**（HTTP/構文/HUD/コンソールエラー等、何をどう確認したか）
  - **未解決の問題**
  - **次にやること**
- **運用**: オーケストレータは**イテレーション末に記録係エージェントを1体起動**する（量産エージェントとは別枠。index.html 同様、WORKLOG.md は同時編集させない）。
- **形式**: 最新が上。既存エントリは書き換えず、追記のみ。後から読む人（と Claude 自身）が一目で状況を掴めることを最優先にする。
