// 黒背景を透明化するスクリプト
import { Jimp } from "jimp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const inPath = path.join(root, "public", "hero-woman.jpg");
const outPath = path.join(root, "public", "hero-woman.png");

console.log("[remove-bg] loading:", inPath);
const img = await Jimp.read(inPath);

const w = img.bitmap.width;
const h = img.bitmap.height;
console.log(`[remove-bg] size: ${w}x${h}`);

// 黒/暗い色を検出してアルファチャンネルへ
// しきい値: RGB全部が一定以下
// JPGノイズで黒が完全じゃないので閾値を上げる
const THRESHOLD = 60;       // 60以下は背景として扱う
const FEATHER = 50;         // 60〜110の間は徐々にフェード

img.scan(0, 0, w, h, function (x, y, idx) {
  const r = this.bitmap.data[idx + 0];
  const g = this.bitmap.data[idx + 1];
  const b = this.bitmap.data[idx + 2];
  const max = Math.max(r, g, b);

  if (max <= THRESHOLD) {
    // 完全透明
    this.bitmap.data[idx + 3] = 0;
  } else if (max <= THRESHOLD + FEATHER) {
    // フェード（縁を滑らかに）
    const t = (max - THRESHOLD) / FEATHER;
    // 二次曲線で滑らかに
    this.bitmap.data[idx + 3] = Math.round(t * t * 255);
  }
  // それ以外は不透明のまま
});

// アルファチャンネルに軽いブラーをかけて縁を滑らかに
img.blur(1);

await img.write(outPath);
console.log("[remove-bg] done:", outPath);
