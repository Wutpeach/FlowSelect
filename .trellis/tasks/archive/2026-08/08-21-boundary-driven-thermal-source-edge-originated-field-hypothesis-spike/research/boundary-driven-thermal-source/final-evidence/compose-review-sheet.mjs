#!/usr/bin/env node
// ============================================================================
// compose-review-sheet.mjs
// ----------------------------------------------------------------------------
// Zero-dependency Node script (Node >= 18, no npm packages required) that
// composites the 20 Browser Lab captures (10 phases x Refraction OFF/ON) from
// the same directory into ONE reviewer-friendly contact sheet PNG.
//
//   Layout  : dark evidence-board background; 2 sections x 5 phase columns;
//             per phase: "Refraction OFF" above "Refraction ON" for immediate
//             pairwise comparison; phase names as column headers.
//   Text    : embedded 5x7 bitmap font (no font rasterizer dependency).
//   Codec   : self-contained PNG decode/encode (zlib-wrapped deflate via
//             node:zlib; CRC-32 implemented inline).
//
// Usage    : node compose-review-sheet.mjs
// Output   : boundary-driven-thermal-source-review-sheet.png  (same directory)
//            + stdout summary (dimensions, file size, per-input sizes, sha256
//            cross-check against capture-log.json when present).
//
// It never modifies the source PNGs and needs no network access.
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'boundary-driven-thermal-source-review-sheet.png');

// ---------------------------------------------------------------------------
// Layout constants (px)
// ---------------------------------------------------------------------------
const BG = [13, 17, 23]; // #0d1117
const PANEL = [22, 27, 34]; // #161b22 (cell backing behind each image)
const BORDER = [48, 54, 61]; // #30363d
const TITLE_COLOR = [240, 246, 252]; // #f0f6fc
const SUBTITLE_COLOR = [139, 148, 158]; // #8b949e
const SECTION_COLOR = [88, 166, 255]; // #58a6ff
const PHASE_COLOR = [201, 209, 217]; // #c9d1d9
const OFF_COLOR = [139, 148, 158]; // #8b949e
const ON_COLOR = [88, 166, 255]; // #58a6ff
const FOOTER_COLOR = [72, 79, 88]; // #484f58

const PAD = 48;
const ROW_LABEL_W = 180;
const GAP_LABEL = 16; // between row-label column and first image column
const GAP_COL = 22; // between image columns
const GAP_ROW = 16; // between OFF row and ON row
const GAP_SECTION = 34; // between the two sections
const GAP_TITLE = 18; // between title block and section 1
const TITLE_H = 110; // title (scale 4) + two subtitle lines (scale 3) + gaps
const SECTION_H = 62; // section header (scale 3) + rule
const COL_HDR = 44; // phase column header (scale 3)
const FOOTER_H = 56;
const CELL_W = 420; // image display box width
const CELL_H = 420; // image display box height

const PHASES = [
  'before-entry', 'first-contact', 'mid-ramp', 'developed-early',
  'developed-middle', 'developed-late', 'near-exit', 'post-boundary',
  'exact-zero', 'reduced-motion',
];
const PHASE_LABEL = {
  'before-entry': 'BEFORE ENTRY',
  'first-contact': 'FIRST CONTACT',
  'mid-ramp': 'MID RAMP',
  'developed-early': 'DEVELOPED EARLY',
  'developed-middle': 'DEVELOPED MIDDLE',
  'developed-late': 'DEVELOPED LATE',
  'near-exit': 'NEAR EXIT',
  'post-boundary': 'POST BOUNDARY',
  'exact-zero': 'EXACT ZERO',
  'reduced-motion': 'REDUCED MOTION',
};
const SECTIONS = [
  { label: 'SECTION 1 - ENTRY & EARLY DEVELOPMENT', phases: PHASES.slice(0, 5) },
  { label: 'SECTION 2 - LATE DEVELOPMENT & EXIT', phases: PHASES.slice(5) },
];

// ---------------------------------------------------------------------------
// 5x7 bitmap font (rows top->bottom; bit4=leftmost column, bit0=rightmost)
// ---------------------------------------------------------------------------
const GLYPH = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  'A': [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  'B': [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  'C': [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  'D': [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  'E': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  'F': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  'G': [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  'H': [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  'I': [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  'J': [0x03, 0x01, 0x01, 0x01, 0x01, 0x11, 0x0e],
  'K': [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  'M': [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  'N': [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  'O': [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  'P': [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  'Q': [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  'R': [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  'S': [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  'T': [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  'U': [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  'V': [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  'W': [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  'X': [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  'Y': [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  'Z': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  '3': [0x1f, 0x01, 0x02, 0x0c, 0x01, 0x11, 0x0e],
  '4': [0x04, 0x0c, 0x14, 0x12, 0x1f, 0x04, 0x04],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x04, 0x04, 0x04],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  '-': [0, 0, 0, 0x1f, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ':': [0, 0, 0x0c, 0, 0x0c, 0, 0],
  '/': [0, 0x01, 0x02, 0x04, 0x08, 0x10, 0],
  '&': [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  '*': [0, 0x15, 0x0e, 0x1f, 0x0e, 0x15, 0],
  '(': [0x06, 0x08, 0x10, 0x10, 0x10, 0x08, 0x06],
  ')': [0x18, 0x04, 0x02, 0x02, 0x02, 0x04, 0x18],
  '%': [0x11, 0x12, 0x02, 0x04, 0x08, 0x09, 0x11],
  ',': [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  '\'': [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '"': [0x15, 0x15, 0x0a, 0, 0, 0, 0],
  '+': [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
};
const FONT = new Map(Object.entries(GLYPH).map(([c, g]) => [c.charCodeAt(0), g]));

function textWidth(text, scale) {
  if (text.length === 0) return 0;
  return text.length * 6 * scale - 1 * scale; // 5 drawn + 1 gap per glyph, minus trailing gap
}

// ---------------------------------------------------------------------------
// Canvas helpers (RGBA buffer, straight alpha)
// ---------------------------------------------------------------------------
function makeCanvas(w, h, bg) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = bg[0]; buf[i * 4 + 1] = bg[1]; buf[i * 4 + 2] = bg[2]; buf[i * 4 + 3] = 255;
  }
  return buf;
}

function drawText(buf, w, h, x, y, text, color, scale) {
  const ch = color;
  for (let ci = 0; ci < text.length; ci++) {
    const glyph = FONT.get(text.charCodeAt(ci));
    if (!glyph) continue;
    const ox = x + ci * 6 * scale;
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row];
      for (let col = 0; col < 5; col++) {
        if ((bits >> (4 - col)) & 1) {
          for (let yy = 0; yy < scale; yy++) {
            for (let xx = 0; xx < scale; xx++) {
              const px = ox + col * scale + xx;
              const py = y + row * scale + yy;
              if (px >= 0 && px < w && py >= 0 && py < h) {
                const i = (py * w + px) * 4;
                buf[i] = ch[0]; buf[i + 1] = ch[1]; buf[i + 2] = ch[2]; buf[i + 3] = 255;
              }
            }
          }
        }
      }
    }
  }
}

function fillRect(buf, w, h, x, y, rw, rh, color) {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(w, x + rw), y1 = Math.min(h, y + rh);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * w + px) * 4;
      buf[i] = color[0]; buf[i + 1] = color[1]; buf[i + 2] = color[2]; buf[i + 3] = 255;
    }
  }
}

// Draw `img` (rgba, sw x sh) fitted (contain) into box (dx,dy,dw,dh), bilinear.
function drawImage(buf, w, h, img, sw, sh, dx, dy, dw, dh) {
  if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) return;
  const sx0 = 0.5 / dw * sw, sy0 = 0.5 / dh * sh;
  const stepX = sw / dw, stepY = sh / dh;
  for (let ty = 0; ty < dh; ty++) {
    const py = dy + ty;
    if (py < 0 || py >= h) continue;
    const sy = sy0 + ty * stepY - 0.5;
    for (let tx = 0; tx < dw; tx++) {
      const px = dx + tx;
      if (px < 0 || px >= w) continue;
      const sx = sx0 + tx * stepX - 0.5;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const fx = sx - x0, fy = sy - y0;
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const gx0 = Math.max(0, x0), gy0 = Math.max(0, y0);
      const gx1 = Math.max(gx0, x1), gy1 = Math.max(gy0, y1);
      const i00 = (gy0 * sw + gx0) * 4, i10 = (gy0 * sw + gx1) * 4;
      const i01 = (gy1 * sw + gx0) * 4, i11 = (gy1 * sw + gx1) * 4;
      const out = (py * w + px) * 4;
      for (let c = 0; c < 3; c++) {
        const v00 = img[i00 + c], v10 = img[i10 + c], v01 = img[i01 + c], v11 = img[i11 + c];
        const top = v00 * (1 - fx) + v10 * fx;
        const bot = v01 * (1 - fx) + v11 * fx;
        buf[out + c] = Math.round(top * (1 - fy) + bot * fy);
      }
      buf[out + 3] = 255;
    }
  }
}

// ---------------------------------------------------------------------------
// PNG codec (8-bit, non-interlaced; color types 0/2/4/6)
// ---------------------------------------------------------------------------
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(...bufs) {
  let c = 0xffffffff;
  for (const b of bufs) for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(t, data));
  return Buffer.concat([len, t, data, crc]);
}

function decodePNG(buf) {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG');
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
      if (data[10] !== 0 || data[11] !== 0) throw new Error('unsupported compression/filter method');
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('unsupported bit depth ' + bitDepth);
  if (interlace !== 0) throw new Error('interlaced PNG not supported');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : null;
  if (channels === null) throw new Error('unsupported color type ' + colorType);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const cur = Buffer.from(raw.subarray(rowStart + 1, rowStart + 1 + stride));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = cur[x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
        v = (v + pr) & 0xff;
      } else if (filter !== 0) throw new Error('bad filter ' + filter);
      cur[x] = v;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 6) {
        for (let c = 0; c < 4; c++) rgba[o + c] = cur[x * 4 + c];
      } else if (colorType === 2) {
        rgba[o] = cur[x * 3]; rgba[o + 1] = cur[x * 3 + 1]; rgba[o + 2] = cur[x * 3 + 2]; rgba[o + 3] = 255;
      } else if (colorType === 0) {
        const g = cur[x]; rgba[o] = g; rgba[o + 1] = g; rgba[o + 2] = g; rgba[o + 3] = 255;
      } else {
        const g = cur[x * 2]; rgba[o] = g; rgba[o + 1] = g; rgba[o + 2] = g; rgba[o + 3] = cur[x * 2 + 1];
      }
    }
    prev = cur;
  }
  return { width, height, rgba };
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------
const W = PAD + ROW_LABEL_W + GAP_LABEL + 5 * CELL_W + 4 * GAP_COL + PAD;
const H = PAD + TITLE_H + GAP_TITLE
  + (SECTION_H + COL_HDR + 2 * CELL_H + GAP_ROW) * 2 + GAP_SECTION
  + FOOTER_H + PAD;

function sectionTop(index) {
  let y = PAD + TITLE_H + GAP_TITLE;
  if (index === 1) y += SECTION_H + COL_HDR + 2 * CELL_H + GAP_ROW + GAP_SECTION;
  return y;
}
function colX(index) { return PAD + ROW_LABEL_W + GAP_LABEL + index * (CELL_W + GAP_COL); }

function compose(images) {
  // images: Map phase -> { off: {w,h,rgba}, on: {w,h,rgba} }
  const buf = makeCanvas(W, H, BG);

  // Title
  drawText(buf, W, H, PAD, PAD + 4, 'BOUNDARY-DRIVEN THERMAL SOURCE', TITLE_COLOR, 4);
  drawText(buf, W, H, PAD, PAD + 4 + 28 + 8,
    'FULLSCREEN ACTIVATION FX - MR9 SPIKE 08-21 / BROWSER LAB CAPTURES',
    SUBTITLE_COLOR, 3);
  drawText(buf, W, H, PAD, PAD + 4 + 28 + 8 + 21 + 8,
    '10 PHASES X REFRACTION OFF/ON - SOURCE FRAMES SHOWN UNCROPPED',
    SUBTITLE_COLOR, 3);

  SECTIONS.forEach((section, si) => {
    const top = sectionTop(si);
    drawText(buf, W, H, PAD, top, section.label, SECTION_COLOR, 3);
    // rule under section header
    fillRect(buf, W, H, PAD, top + 21 + 6, W - PAD * 2, 2, [38, 44, 54]);
    const gridTop = top + SECTION_H;

    // phase column headers
    section.phases.forEach((ph, ci) => {
      const cx = colX(ci);
      const label = PHASE_LABEL[ph];
      const tw = textWidth(label, 3);
      drawText(buf, W, H, cx + (CELL_W - tw) / 2, gridTop, label, PHASE_COLOR, 3);
    });

    const rows = [
      { key: 'off', label: 'REFRACTION OFF', color: OFF_COLOR, yOff: 0 },
      { key: 'on', label: 'REFRACTION ON', color: ON_COLOR, yOff: CELL_H + GAP_ROW },
    ];
    rows.forEach((row) => {
      const ly = gridTop + COL_HDR + row.yOff;
      // row label (right-aligned to the label column, vertically centered)
      const tw = textWidth(row.label, 2);
      const lx = PAD + ROW_LABEL_W - tw;
      const labelTop = ly + (CELL_H - 14) / 2;
      drawText(buf, W, H, lx, labelTop, row.label, row.color, 2);
      // images
      section.phases.forEach((ph, ci) => {
        const img = images.get(ph)[row.key];
        const cx = colX(ci);
        // cell backing panel
        fillRect(buf, W, H, cx, ly, CELL_W, CELL_H, PANEL);
        // fit contain
        const scale = Math.min(CELL_W / img.width, CELL_H / img.height);
        const dw = Math.floor(img.width * scale);
        const dh = Math.floor(img.height * scale);
        const dx = cx + Math.floor((CELL_W - dw) / 2);
        const dy = ly + Math.floor((CELL_H - dh) / 2);
        drawImage(buf, W, H, img.rgba, img.width, img.height, dx, dy, dw, dh);
        // thin border
        fillRect(buf, W, H, cx, ly, CELL_W, 1, BORDER);
        fillRect(buf, W, H, cx, ly + CELL_H - 1, CELL_W, 1, BORDER);
        fillRect(buf, W, H, cx, ly, 1, CELL_H, BORDER);
        fillRect(buf, W, H, cx + CELL_W - 1, ly, 1, CELL_H, BORDER);
      });
    });
  });

  const fy = H - PAD - 21; // scale-3 footer (21px) flush to the bottom padding edge
  drawText(buf, W, H, PAD, fy,
    'COMPOSED BY COMPOSE-REVIEW-SHEET.MJS (ZERO-DEPENDENCY) - SOURCE: FINAL-EVIDENCE/*.PNG',
    FOOTER_COLOR, 3);
  return buf;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

function main() {
  let log = null;
  try {
    log = JSON.parse(readFileSync(join(HERE, 'capture-log.json'), 'utf8'));
  } catch { /* optional cross-check */ }
  const byName = {};
  if (log && Array.isArray(log.captures)) {
    for (const c of log.captures) byName[c.name] = c.sha256;
  }

  const images = new Map();
  const problems = [];
  const shaProblems = [];
  for (const phase of PHASES) {
    const entry = {};
    for (const kind of ['off', 'on']) {
      const prefix = kind === 'off' ? 'baseline' : 'refraction';
      const file = join(HERE, `${prefix}-${phase}.png`);
      try {
        const data = readFileSync(file);
        if (byName[`${prefix}-${phase}`] && sha256(data) !== byName[`${prefix}-${phase}`]) {
          shaProblems.push(`${prefix}-${phase}.png`);
        }
        entry[kind] = decodePNG(data);
      } catch (e) {
        problems.push(`${prefix}-${phase}.png: ${e.message}`);
      }
    }
    images.set(phase, entry);
  }
  if (problems.length) throw new Error('decode problems:\n' + problems.join('\n'));

  const buf = compose(images);
  const png = encodePNG(W, H, buf);
  writeFileSync(OUT, png);

  const first = images.get('before-entry').off;
  console.log('Output      : ' + OUT);
  console.log('Dimensions  : ' + W + ' x ' + H + ' px');
  console.log('File size   : ' + png.length + ' bytes (' + (png.length / 1024).toFixed(1) + ' KiB)');
  console.log('Input       : ' + (PHASES.length * 2) + ' PNGs, first = ' + first.width + 'x' + first.height);
  console.log('SHA256      : ' + (shaProblems.length === 0 ? 'all inputs match capture-log.json' : 'MISMATCH on: ' + shaProblems.join(', ')));
  console.log('Done.');
}

main();
