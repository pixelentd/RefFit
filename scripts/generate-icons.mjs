// Generates RefFit's placeholder PWA icon set: a blocky "R" monogram on a solid accent-blue
// square. Deliberately not a build dependency — this is a one-off script you re-run by hand
// (`node scripts/generate-icons.mjs`) whenever you want to regenerate the placeholders, e.g.
// after picking a different accent color. It writes straight to public/, so Vite copies the
// output into dist/ unmodified on every build, same as any other public/ asset.
//
// No image library involved: this hand-rolls a minimal PNG encoder (RGBA raster -> zlib-deflated
// scanlines -> IHDR/IDAT/IEND chunks) using only Node's built-in zlib, since these are tiny,
// flat-color images and a real placeholder doesn't need more than that. Swap these files for
// real artwork later — nothing else in the app cares how they were made.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BACKGROUND = [0x2f, 0x6f, 0xed]; // --accent from index.css
const FOREGROUND = [0xff, 0xff, 0xff];

// A classic 5x7 block-letter "R", read top row to bottom row, MSB (leftmost column) first.
const GLYPH_R = [
  0b11110,
  0b10001,
  0b10001,
  0b11110,
  0b10100,
  0b10010,
  0b10001,
];
const GLYPH_COLS = 5;
const GLYPH_ROWS = 7;

// --- Minimal PNG encoding ----------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** Encodes an RGBA (Uint8Array, 4 bytes/pixel, no padding) raster as a PNG file buffer. */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // bytes 10-12 (compression, filter, interlace) default to 0, which is what we want.

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type "none" for every scanline
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Icon rendering ------------------------------------------------------------------------

/** Renders one size of the icon: a solid background square with the glyph centered at roughly
 *  half the canvas height. That leaves generous margin on every side, which is exactly what a
 *  maskable icon needs (content within the safe-zone circle) — so the same raster works for
 *  both the plain and maskable manifest entries without a separate "maskable" layout. */
function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = BACKGROUND[0];
    rgba[i * 4 + 1] = BACKGROUND[1];
    rgba[i * 4 + 2] = BACKGROUND[2];
    rgba[i * 4 + 3] = 255;
  }

  const block = Math.round((size * 0.5) / GLYPH_ROWS);
  const glyphWidth = block * GLYPH_COLS;
  const glyphHeight = block * GLYPH_ROWS;
  const offsetX = Math.round((size - glyphWidth) / 2);
  const offsetY = Math.round((size - glyphHeight) / 2);

  for (let row = 0; row < GLYPH_ROWS; row++) {
    for (let col = 0; col < GLYPH_COLS; col++) {
      const bit = (GLYPH_R[row] >> (GLYPH_COLS - 1 - col)) & 1;
      if (!bit) continue;
      const px0 = offsetX + col * block;
      const py0 = offsetY + row * block;
      for (let y = py0; y < py0 + block; y++) {
        for (let x = px0; x < px0 + block; x++) {
          const idx = (y * size + x) * 4;
          rgba[idx] = FOREGROUND[0];
          rgba[idx + 1] = FOREGROUND[1];
          rgba[idx + 2] = FOREGROUND[2];
          rgba[idx + 3] = 255;
        }
      }
    }
  }

  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-512-maskable.png', 512], // same layout as icon-512.png — already safe-zone padded
  ['apple-touch-icon.png', 180],
];
for (const [filename, size] of targets) {
  writeFileSync(path.join(OUT_DIR, filename), renderIcon(size));
  console.log(`wrote public/icons/${filename} (${size}x${size})`);
}
