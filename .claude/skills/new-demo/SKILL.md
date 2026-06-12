---
name: new-demo
description: Scaffold one new hikari interactive prototype. Use when asked to create/add a new demo, prototype, or interactive piece in this repo (e.g. "新しい試作を作って", "demoを追加", "光の回廊を作って"). Builds a self-contained demos/NN-slug.html from the template following the project's glow-in-the-dark conventions, verifies it runs, and registers a card in index.html.
---

# /new-demo — 試作を1つ作る

hikari スタジオに新しいインタラクティブ試作を1枚追加する。引数はコンセプト（例: `/new-demo 光の回廊`）。

## 手順

1. **仕様を読む**: `CLAUDE.md`（特に §3 骨格 / §4 実装パターン / §5 カテゴリ / §6 手順 / §8 チェックリスト）と `shared.css` を読む。最も近いグループの既存 `demos/*.html` を1つ開いて語彙を真似る。

2. **メタを決める**:
   - 番号 NN = `demos/` の最大番号 + 1
   - slug = 英小文字ハイフン（例 `corridor`）→ ファイル `demos/NN-slug.html`
   - グループ（壱〜肆）と、試作技術 / 本実装技術（`docs/STACK.md` の語彙）
   - タイトル（日本語・詩的）/ ヒント / 一行紹介文

3. **テンプレ複製**: 3D・AR空間グループなら `_template/demo-3d.html`、それ以外は `_template/demo-2d.html` を `demos/NN-slug.html` にコピー。

4. **実装**: `{{NN}} {{TITLE}} {{HINT}} {{PROTO}} {{PROD}}` を置換し、コンセプトの世界を作る。CLAUDE.md §4 の定石（DPR対応 / pointerイベント / 残光ループ / PALETTE発光 / 必要ならマイク・カメラ＋フォールバック）を守る。

5. **検証**: `/preview` で `demos/NN-slug.html` を開き、コンソールエラー0・滑らかな動き・操作が効く・「← もどる」が効くことを確認。CLAUDE.md §8 のチェックリストを通す。

6. **登録**: `index.html` の該当グループ `section.group > .cards` にカードを追加（雛形は CLAUDE.md §6）。`.ct.proto` / `.ct.prod` の技術は本文の `tech-tag` と一致させる。

7. **報告**: 作ったファイル名・グループ・試作/本実装技術と、`/preview` での確認結果を一言で返す。

## 注意
- 1ファイル完結。外部依存は CDN(unpkg) のみ。
- 色は直書きせず PALETTE / CSS変数。共通スタイルが要るなら shared.css に足す。
