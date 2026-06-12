# 光の庭 — モジュール契約書（全エージェント必読・厳守）

旗艦アプリ「19 光の庭」は ES modules で分割実装する。**自分の担当ファイル以外は編集禁止。**
他モジュールを直接 import しない（three と自ファイルのみ）。連携はすべて `ctx`（bus / state / helpers）経由。
これにより各モジュールは単体で書け、統合はオーケストレータが行う。

## 世界観
夜の丘。プレイヤーは光の種を描いて植える。植物が発光しながら育ち、蛍が集まり、音が生まれる。
hikari の美学（CLAUDE.md §2）: 背景ほぼ黒、PALETTE 5色の発光、白飛び禁止、詩的で静か。

## 技術ベース
- three は **importmap で `"three"`** として import する（index.html が `three@0.149.0/build/three.module.js` を map 済み）:
  ```js
  import * as THREE from 'three';
  ```
- 各モジュールは **default export** で次の形を返す:
  ```js
  export default {
    name: 'plants',                 // 自分のモジュール名
    init(ctx) { ... },              // 起動時に1回。ここで scene への追加・bus購読を行う
    update(dt, t, ctx) { ... },     // 毎フレーム。dt=秒, t=経過秒
  };
  ```
- init/update 内で例外を投げない（try/catch で握り、console.warn）。1モジュールの失敗で庭全体を殺さない。

## ctx の中身（index.html が構築して渡す）
```js
ctx = {
  THREE,                  // three名前空間（再importしてもよい）
  scene, camera, renderer,
  world,                  // THREE.Group。3Dオブジェクトは原則ここに add
  dom,                    // { root, overlay }  rootはbody直下のUI用div(z-index:10)
  PALETTE: ['#ffd98a','#ffaad4','#c9a8ff','#8ce8ff','#f4f2ec'],
  bus: { on(type, fn), emit(type, data) },   // イベントバス
  state: {                // 共有状態。読み書き自由だが下記の所有者以外は原則「読み」
    started: false,       // intro通過後 true（ui が書く）
    quality: 1,           // 0.5〜1。fxが落とすことがある。粒子数等はこれに乗算
    pointer: { x, y, down },  // 正規化(-1..1)。index.htmlが書く
    wind: 0,              // 0..1 風の強さ（audioがマイクから書く。なければ0近辺で揺らぐ）
    plantCount: 0,        // plants が書く
    season: null,         // 'haru'|'natsu'|'aki'|'fuyu'。seasons が書く（app:start 前は未設定）
  },
  helpers: {
    glowTexture(color),   // 放射グラデの THREE.CanvasTexture を返す（index.htmlが提供）
    groundY(x, z),        // 地形の高さを返す。terrain が init で実装を差し替える（それまで 0）
  },
}
```

## イベント一覧（bus）— これが結合のすべて
| type | data | emit する者 | 聞く者 |
|---|---|---|---|
| `app:start` | — | ui（introの「庭へ入る」押下） | audio(AudioContext生成), creatures, camera |
| `seed:drawn` | `{ dna }` | seeds（描き終わり） | ui(カウント表示更新など任意) |
| `seed:planted` | `{ x, z, dna }` | seeds（地面タップで植える） | plants, fx, audio, camera |
| `plant:mature` | `{ x, y, z, color }` | plants（成長完了時） | creatures, fx, audio |
| `fx:burst` | `{ x, y, z, color, n }` | 誰でも | fx（粒子を散らす） |
| `note` | `{ pitch (0..1), vol (0..1) }` | 誰でも | audio（ペンタトニックで鳴らす） |
| `garden:save` | — | ui | plants（localStorageへ保存実行） |
| `garden:load` | — | ui(起動時にも) | plants（localStorageから復元） |
| `garden:cleared` | — | plants(load/import/clear後) | creatures, fx |
| `garden:export` | — | ui（「庭を手紙に」押下） | plants（現在の庭を直列化） |
| `garden:exported` | `{ code, count }` | plants（直列化完了。空の庭は `code:null, count:0`） | ui（手紙モーダル表示。空ならトーストで断る） |
| `garden:import` | `{ code }` | ui（「咲かせる」/ URL `#garden=` の自動開封） | plants（復号・検証→庭を差し替えて咲かせる。従来どおり garden:cleared → plant:mature） |
| `garden:imported` | `{ ok, count }` | plants（importの成否。壊れたコードは `ok:false` で既存の庭は無傷） | ui（トースト: とどいた庭がひらきました / 読めない手紙） |
| `weather:change` | `{ mode: 'clear'|'stardust'|'mist' }` | weather（モード遷移時。`state.weather` にも書く） | audio（シマー層・霧のローパス） |
| `season:change` | `{ season: 'haru'|'natsu'|'aki'|'fuyu' }` | seasons（季節遷移時。`state.season` にも書く） | audio（夜の虫・鈴の間合いと音色が季節で移ろう）など任意 |

`dna` = `{ color: PALETTEの1色, height: 0.6..1.6, branches: 2..6, sway: 0..1 }`（seeds が描線から算出）。

## 庭の手紙（共有コード形式 v1 — plants が所有）
- 形式: `n1.` + base64url( JSON `[[x,z,colorIdx,height,branches,sway], …]` )。数値は小数2桁丸め、`colorIdx` は PALETTE の添字。base64url は `+→-` `/→_` `=`除去。
- 復号は全面 try/catch。壊れたコードは throw せず `garden:imported {ok:false}`（既存の庭は守る）。MAX_PLANTS(60) を超える分は読み捨て、丘の外の座標は縁(半径17.5)へ寄せる。URLごと貼られても `#garden=` の中身を拾う。
- localStorage `niwa-garden-v1` の保存形式（`[{x,z,dna}]`）とは独立で、互換はそのまま。**import は localStorage を書かない**（残すなら従来どおり「保存」）。
- URL 共有: `…/index.html#garden=<code>`。ui が起動時にハッシュを覚え、入庭後に自動 import → `history.replaceState` でハッシュを消す。

## 座標系
- 地面はおよそ半径 18 の円形の丘。y=helpers.groundY(x,z)。カメラ初期位置 (0, 3.2, 9) → 原点付近を見る。
- 植物・生き物・粒子は world に add。スケール感: 植物の高さ 0.6〜2.0。

## 担当ファイル（js/ 直下・各1ファイル・250行以内目安）
| ファイル | 役割 |
|---|---|
| terrain.js | 丘の地形(groundY実装を helpers に差し替え)、池、星空ドーム、月、地表の微光 |
| plants.js | seed:planted→発光植物の成長(枝分かれ・つぼみ→開花でplant:mature)、windで揺れ、save/load(localStorage `niwa-garden-v1`)、庭の手紙の encode/decode(garden:export/import→exported/imported) |
| seeds.js | 左下の描きパッド(2D canvas, PALETTE切替)、描線→dna算出(seed:drawn)、地面Raycastタップで seed:planted |
| creatures.js | 蛍の群れ(成熟植物に引き寄せ)、白い精霊(まれに横切る)、app:startで出現 |
| audio.js | app:startでAudioContext生成。noteイベント→ペンタトニック、環境ドローン、🎙ボタンでマイク→state.wind(必ずフォールバック: windは自動でゆらぐ)。風のノイズ層(wind追従)、夜の虫・鈴(wind>0.5で鳴きやむ。season:change連動で間合い・音域・減衰が移ろう: 春4〜11秒の明るい鈴/夏2.5〜8秒の短い虫の粒/秋6〜16秒の乾いた低めの鈴/冬10〜24秒にまれな一粒。初回の春までは従来の4〜14秒)、weather:change連動(星屑=シマー層、薄霧=master後段lowpassで2200Hzへ)。全レイヤーがmaster経由＝ミュートで全消音 |
| fx.js | fx:burst粒子、漂う光塵、フレーム時間を監視して重ければ state.quality を下げる |
| ui.js | intro オーバーレイ(タイトル+「庭へ入る」→app:start)、HUD(hikari規約: もどる/番号/タイトル/ヒント/技術タグ)、保存・読込・写真ボタン、植物カウンタ、庭の手紙(「庭を手紙に」モーダル: コード+リンクをコピー/「手紙をひらく」: 貼り付け→咲かせる/URL `#garden=` の入庭後自動開封+ハッシュ消去) |
| camera.js | ドラッグで穏やかな軌道回転+ホイール/ピンチでズーム、放置で微ドリフト、seed:planted時に植えた場所へ短くフォーカス |
| weather.js | 夜の天候の状態機械(晴れ→星屑の雨→薄霧)、流れ星、星屑の接地消滅 |
| footprints.js | 訪問記録(localStorage 'niwa-visits-v1')、見えない訪問者が植物を縫って歩く光の足あと(左右交互・淡く消える) |
| seasons.js | 季節の状態機械(春→夏→秋→冬を75〜120秒で循環、app:start後に開始)、季節ごとの粒子の気配(花びら・立ちのぼる微光・木の葉・雪)、遷移時に season:change + 鈴ひとつ |

## UIの規約（ui.js とパッド等のDOM）
- DOMは ctx.dom.root に append。スタイルは ../../shared.css のクラス（hud-top, hud-bottom, action-btn等）を再利用し、足りない分は各自 `<style>` をJSから注入してよい（クラス名に接頭辞 `niwa-`）。
- 文言は日本語・詩的に短く。

## 自己検証（各エージェント必須）
1. `node --check js/<自分>.js` で構文OK
2. 契約どおり default export {name, init, update} になっている
3. 他モジュールを import していない / ctx 外のグローバルに依存していない（window/document/localStorageは可）
4. init を ctx のモックで呼んでも例外を投げない程度の防御（try/catch）
