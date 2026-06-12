---
name: preview
description: Launch a local static server and open a hikari demo (or the index) to verify it runs. Use when asked to preview, run, open, or check a demo/the gallery in a browser, or to confirm a prototype works (e.g. "プレビュー", "動かして確認", "ブラウザで開いて"). Checks for console errors and that interaction works.
---

# /preview — ローカルで開いて確認

hikari は静的HTMLなのでローカルサーバで開いて確認する（`file://` はフォント等で詰まることがある）。

## 手順

1. **サーバ起動**（バックグラウンド）:
   ```bash
   python3 -m http.server 8013 --directory /Users/<redacted>/Desktop/dev/260611_hikari
   ```
   既に起動していれば再利用する。ポート使用中なら 8014, 8015… にずらす。

2. **URLを開く / 提示する**:
   - 一覧: `http://localhost:8013/index.html`
   - 個別: `http://localhost:8013/demos/NN-slug.html`
   引数があればそのデモを、なければ index を対象にする。可能なら `open <URL>`（macOS）で既定ブラウザを開く。

3. **検証ポイント**（CLAUDE.md §8）:
   - DevTools コンソールにエラー・警告がない
   - アニメーションが滑らか（カクつかない）
   - マウス/タッチ操作が効く・「← もどる」リンクが index に戻る
   - 配色が `--ink` 背景に発光（白飛び・低コントラストなし）

4. **報告**: 開いたURLと、確認できた点／問題点を一言で返す。サーバはバックグラウンドで動かしたまま次の作業に使ってよい。

## メモ
- `.claude/settings.json` で `python3 -m http.server` と `open` は許可済み（プロンプトなしで起動できる）。
- ブラウザのDOM/コンソールを実際に読みたい場合は、ユーザーに見てもらうか、利用可能ならブラウザ操作系ツールを使う。
