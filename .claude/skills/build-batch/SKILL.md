---
name: build-batch
description: Mass-produce multiple hikari prototypes in parallel using one sub-agent per demo. Use when asked to create several demos at once (e.g. "5個まとめて作って", "夜をテーマに10試作", "バッチで量産"). Orchestrates parallel Agent calls, then registers all cards in index.html and verifies. Implements docs/BUILD-ROUTINE.md.
---

# /build-batch — 複数エージェントで量産

テーマと個数から、複数の試作を**並列**に作る量産ルーティーン。
引数例: `/build-batch 夜 5`（テーマ「夜」で5個）。完全な手順は `docs/BUILD-ROUTINE.md`。

## 手順

1. **下調べ**: `CLAUDE.md` と `docs/BUILD-ROUTINE.md` を読む。`demos/` の最大番号を確認。

2. **コンセプト設計**: テーマから N 個の世界を考え、各案に割り当てる:
   - 連番（最大+1 から。**先に全部確定して衝突を防ぐ**）
   - slug / グループ（壱〜肆）/ タイトル / 一行コンセプト
   - 試作技術・本実装技術（`docs/STACK.md` の語彙）
   - 案をユーザーに一覧提示してよい（多数なら確認なしで進めてよい）

3. **並列起動**: `Agent`（subagent_type=`general-purpose`）を**1メッセージ内で N 体同時**に呼ぶ。各プロンプトは `docs/BUILD-ROUTINE.md §3` の雛形を使い、担当番号・slug・グループ・コンセプト・技術を明記。各エージェントには:
   - CLAUDE.md とテンプレを必ず読ませる
   - `demos/NN-slug.html` の新規作成のみ
   - **index.html は触らせない**
   - 自己検証させ、「登録用1行」を返させる

4. **集約**: 各エージェントの「登録用1行」（グループ/href/no/title/desc/proto/prod）を集める。

5. **まとめて登録**: **オーケストレータだけが** `index.html` を編集し、各カードを正しいグループの `section.group > .cards` に挿入（雛形 CLAUDE.md §6）。

6. **通し検証**: `/preview` で index→各デモを順に確認。落ちたものは担当に「番号NN・症状」を渡して修正。

7. **報告**: 作った N 個の一覧（番号・タイトル・グループ・技術）と検証結果をまとめて返す。

## ガード
- 並列は **3〜6体**が目安。Three.js/物理など重いものは数を絞る。
- 番号・slug を被らせない（起動前確定）。
- index.html の同時編集は禁止（競合する）。
