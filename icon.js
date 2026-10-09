// 运行时生成图标（托盘图标 + 应用图标），无外部图片依赖
const { nativeImage } = require('electron');
const zlib = require('zlib');

let _crcTable = null;
function crc32(buf) {
  if (!_crcTable) {
    _crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      _crcTable[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = _crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function sdRoundBox(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 32x32 托盘图标：靛蓝圆角方块 + 白色对勾
function createTrayIcon() {
  const S = 32;
  const buf = Buffer.alloc(S * S * 4);
  const R = 99, G = 102, B = 241; // #6366F1
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const sd = sdRoundBox(px, py, 16, 16, 11.5, 11.5, 7);
      const cov = clamp(0.5 - sd, 0, 1);
      const i = (y * S + x) * 4;
      if (cov <= 0) { buf[i + 3] = 0; continue; }

      const d = Math.min(
        segDist(px, py, 10.5, 16.5, 14.5, 20.5),
        segDist(px, py, 14.5, 20.5, 22.5, 12.5),
      );
      const cCov = clamp(2.0 - d, 0, 1);

      buf[i] = Math.round(R + (255 - R) * cCov);
      buf[i + 1] = Math.round(G + (255 - G) * cCov);
      buf[i + 2] = Math.round(B + (255 - B) * cCov);
      buf[i + 3] = Math.round(cov * 255);
    }
  }
  return nativeImage.createFromBuffer(encodePNG(S, S, buf));
}

// 应用图标：靛蓝→紫渐变圆角方块 + 白色对勾（用于打包）
function createAppIcon(size = 512) {
  const S = size;
  const buf = Buffer.alloc(S * S * 4);
  const c1 = [99, 102, 241];  // #6366F1
  const c2 = [139, 92, 246];  // #8B5CF6
  const hw = S * 0.46;
  const hh = S * 0.46;
  const r = S * 0.20;
  const s = S / 32; // 对勾坐标从 32 设计空间缩放

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const sd = sdRoundBox(px, py, S / 2, S / 2, hw, hh, r);
      const cov = clamp(0.5 - sd, 0, 1);
      const i = (y * S + x) * 4;
      if (cov <= 0) { buf[i + 3] = 0; continue; }

      const t = clamp((px + py) / (2 * S), 0, 1); // 对角渐变
      let R = c1[0] + (c2[0] - c1[0]) * t;
      let G = c1[1] + (c2[1] - c1[1]) * t;
      let B = c1[2] + (c2[2] - c1[2]) * t;

      const d = Math.min(
        segDist(px, py, 10.5 * s, 16.5 * s, 14.5 * s, 20.5 * s),
        segDist(px, py, 14.5 * s, 20.5 * s, 22.5 * s, 12.5 * s),
      );
      const cCov = clamp(2.0 * s - d, 0, 1);

      buf[i] = Math.round(R + (255 - R) * cCov);
      buf[i + 1] = Math.round(G + (255 - G) * cCov);
      buf[i + 2] = Math.round(B + (255 - B) * cCov);
      buf[i + 3] = Math.round(cov * 255);
    }
  }
  return encodePNG(S, S, buf);
}

module.exports = { createTrayIcon, createAppIcon, encodePNG };
