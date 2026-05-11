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
// 黒のみ厳密に透明化（顔の影を消さない）
const THRESHOLD = 22;       // この値以下のみ完全透明
const FEATHER = 8;          // ごく狭い範囲だけソフトエッジ

img.scan(0, 0, w, h, function (x, y, idx) {
  const r = this.bitmap.data[idx + 0];
  const g = this.bitmap.data[idx + 1];
  const b = this.bitmap.data[idx + 2];
  const max = Math.max(r, g, b);

  if (max <= THRESHOLD) {
    this.bitmap.data[idx + 3] = 0;
  } else if (max <= THRESHOLD + FEATHER) {
    const t = (max - THRESHOLD) / FEATHER;
    this.bitmap.data[idx + 3] = Math.round(t * 255);
  }
  // それ以外は完全に不透明（顔・髪は元のまま）
});

await img.write(outPath);
console.log("[remove-bg] done:", outPath);
