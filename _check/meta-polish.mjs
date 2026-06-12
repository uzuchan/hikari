// 外部共有時の体裁仕上げ: 全19作品の <head> に theme-color / description / OGP / favicon を挿入する。
// description はルート index.html の各カード .card-desc の詩的紹介文をそのまま使う。
// 挿入位置は <title> 行の直後。<head> 以外（body・script）には一切触れない。
// 冪等: すでに og:title があるファイルはスキップ。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/<redacted>/Desktop/dev/260611_hikari';

// nn, file, title, desc（desc は index.html の .card-desc と一字一句同じ）
const DEMOS = [
  ['01', 'demos/01-planet.html', '惑星のすみか', 'iPadでお絵描きした生き物が、惑星の住人になって歩き出す。描くほどに惑星が賑わうARゲームの原型。'],
  ['02', 'demos/02-library.html', '宇宙図書館', '幻想的な宇宙の図書館を歩く。透明の階段、浮遊する本、白い妖精の遊び場。部屋を暗くして遊ぶ3D空間。'],
  ['03', 'demos/03-breath.html', '息で咲く光の花野', 'マイクに息を吹きかけると花畑がざわめき、花びらが光の粒になって舞う。静けさの中で再び芽吹く。'],
  ['04', 'demos/04-spirit.html', '一筆書きの精霊', '指で描いた一筆書きの線が、そのまま生き物になって泳ぎ出す。線の速さと曲がりで性格が変わる。'],
  ['05', 'demos/05-mirror.html', '群れと踊る鏡', 'カメラがあなたの動きを捉え、光の蝶の群れが集まり、驚いて散る。体ぜんぶがコントローラー。'],
  ['06', 'demos/06-rain.html', '言葉の雨', '文字が雨のように降る。触れた言葉は弾けて、その意味する風景——雪、花、火——に変わる。'],
  ['07', 'demos/07-pond.html', '音紋の池', '手を叩くと暗い水面に波紋がひろがり、光の魚が生まれる。音を重ねるほど池が満ちていく。'],
  ['08', 'demos/08-sand.html', '光の砂庭', '発光する砂の禅庭。なぞると砂紋が描かれ、紋様の交差から光の虫が生まれる。やがて風が紋を消す。'],
  ['09', 'demos/09-constellation.html', '星座を紡ぐ夜', '星と星をなぞって繋ぐと、その形から星座の獣が生まれて夜空を駆ける。みんなの獣が同じ空に住む。'],
  ['10', 'demos/10-fireworks.html', '影に咲く花火', 'スワイプで光の種を打ち上げると花火が咲き、残光が地に落ちて花畑として積もっていく。'],
  ['11', 'demos/11-corridor.html', '光の回廊', '闇に灯る無限のアーチをくぐり、光の尾を引いて進む。長押しで加速、視線は指に揺れる。'],
  ['12', 'demos/12-nebula.html', '声の星雲', '声の大きさと高さで膨らみ色づく星雲。黙れば静かに眠る。マイクがなくても指の動きが声になる。'],
  ['13', 'demos/13-ito-koto.html', '光の糸琴', '張った光の糸をなぞれば、弦が震えて粒をこぼし小さく鳴る。糸はやがて闇に溶ける。'],
  ['14', 'demos/14-tomoshibi.html', 'ふれると灯る街', 'ふれた窓から灯がともり、人影と星が増える夜の街。放っておくと灯りはひとつずつ眠る。'],
  ['15', 'demos/15-wataridori.html', '渡り鳥の手紙', 'スワイプから生まれた光の鳥が境界を越え、とおくの空で星の手紙になる。ふたつの端末をひとつの夜が繋ぐ。'],
  ['16', 'demos/16-kurage.html', 'クラゲの天蓋', '暗い海の底、頭上に漂う発光の群れ。触れれば光が連鎖する。ドラッグで深海を見回す。'],
  ['17', 'demos/17-mizukagami.html', '水鏡の文字', '夜に描いた光の文字が水面に揺らぎ、粒となって波紋に還る。波が収まれば水面はまた鏡になる。'],
  ['18', 'demos/18-tourou.html', '灯籠流しの川', '触れて灯した灯籠を川へ送ると、とおくの岸辺に金色が並ぶ。流すほど川がきらめく。'],
  ['19', 'demos/19-niwa/index.html', '光の庭', '夜の丘に種を描いて植える、育てて残せる庭。蛍が集まり、音が生まれ、保存した庭はまた咲く。10人がかりの旗艦作。'],
];

let changed = 0, skipped = 0;

for (const [nn, file, title, desc] of DEMOS) {
  const path = `${ROOT}/${file}`;
  let html = readFileSync(path, 'utf8');
  if (html.includes('og:title')) { console.log(`skip (already done): ${file}`); skipped++; continue; }

  const rel = file.includes('19-niwa') ? '../../' : '../';
  const hasThemeColor = /name="theme-color"/.test(html);
  const block = [
    ...(hasThemeColor ? [] : ['<meta name="theme-color" content="#0a0a0f">']),
    `<meta name="description" content="${desc}">`,
    `<meta property="og:title" content="${nn} ${title} — hikari">`,
    `<meta property="og:description" content="${desc}">`,
    `<meta property="og:image" content="${rel}assets/og.png">`,
    `<link rel="icon" type="image/svg+xml" href="${rel}assets/favicon.svg">`,
  ].join('\n');

  const titleLine = new RegExp(`(<title>${nn}[^<]*</title>)`);
  if (!titleLine.test(html)) throw new Error(`<title> not found in ${file}`);
  html = html.replace(titleLine, `$1\n${block}`);
  writeFileSync(path, html);
  console.log(`done: ${file}`);
  changed++;
}

console.log(`\n${changed} files updated, ${skipped} skipped.`);
