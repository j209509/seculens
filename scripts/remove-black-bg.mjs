// 黒背景を flood fill で正確に検出して透明化
// 顔の影や髪の影は「孤島」なので残す（背景にしか到達しない）
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

const data = img.bitmap.data;
const BG_THRESHOLD = 55;  // この値より暗ければ「黒っぽい」と判定
const EDGE_THRESHOLD = 100; // エッジフェード用の上限

// 1. 暗いピクセルのマップを作る
const isDark = new Uint8Array(w * h);
for (let i = 0, p = 0; i < data.length; i += 4, p++) {
  const max = Math.max(data[i], data[i + 1], data[i + 2]);
  isDark[p] = max <= BG_THRESHOLD ? 1 : 0;
}

// 2. エッジ（画像の4辺）から flood fill で「真の背景」を検出
const isBg = new Uint8Array(w * h);
const queue = [];

// 4辺から開始
for (let x = 0; x < w; x++) {
  if (isDark[x]) { queue.push(x); isBg[x] = 1; }
  const bottom = (h - 1) * w + x;
  if (isDark[bottom]) { queue.push(bottom); isBg[bottom] = 1; }
}
for (let y = 0; y < h; y++) {
  const left = y * w;
  if (isDark[left]) { queue.push(left); isBg[left] = 1; }
  const right = y * w + (w - 1);
  if (isDark[right]) { queue.push(right); isBg[right] = 1; }
}

// 4-connected flood fill
while (queue.length > 0) {
  const p = queue.pop();
  const x = p % w;
  const y = (p - x) / w;
  const neighbors = [];
  if (x > 0) neighbors.push(p - 1);
  if (x < w - 1) neighbors.push(p + 1);
  if (y > 0) neighbors.push(p - w);
  if (y < h - 1) neighbors.push(p + w);
  for (const np of neighbors) {
    if (!isBg[np] && isDark[np]) {
      isBg[np] = 1;
      queue.push(np);
    }
  }
}

console.log("[remove-bg] flood-fill done, applying alpha...");

// 3. 背景ピクセルを透明化、縁を少しだけソフトに
for (let p = 0; p < w * h; p++) {
  const i = p * 4;
  if (isBg[p]) {
    data[i + 3] = 0; // 完全透明
  } else {
    // 縁ピクセル（隣にbgがあるか）の輝度に応じて軽くフェード
    const x = p % w;
    const y = (p - x) / w;
    let touchesBg = false;
    if (x > 0 && isBg[p - 1]) touchesBg = true;
    else if (x < w - 1 && isBg[p + 1]) touchesBg = true;
    else if (y > 0 && isBg[p - w]) touchesBg = true;
    else if (y < h - 1 && isBg[p + w]) touchesBg = true;

    if (touchesBg) {
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      if (max <= EDGE_THRESHOLD) {
        // エッジで暗めのピクセルは半透明（縁を滑らかに）
        const t = (max - BG_THRESHOLD) / (EDGE_THRESHOLD - BG_THRESHOLD);
        data[i + 3] = Math.round(Math.max(0, Math.min(1, t)) * 255);
      }
    }
  }
}

await img.write(outPath);
console.log("[remove-bg] done:", outPath);
