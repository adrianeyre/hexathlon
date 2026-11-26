/**
 * A minimal PNG encoder for the code-defined art tools (`make-icons.js`,
 * `sprite-sheet.js`). Truecolour RGB or RGBA, no filtering. Development only.
 */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * @param pixel  RGB, 0 to 255.
 */
export function encodePng(width: number, height: number, pixel: (x: number, y: number) => readonly [number, number, number]) {
  return encode(width, height, 3, pixel);
}

/**
 * A PNG with an alpha channel, for icons with transparent corners.
 * @param pixel  RGB 0 to 255, alpha 0 to 1.
 */
export function encodePngRgba(width: number, height: number, pixel: (x: number, y: number) => readonly [number, number, number, number]) {
  return encode(width, height, 4, (x, y) => {
    const [r, g, b, a] = pixel(x, y);
    return [r, g, b, Math.round(a * 255)];
  });
}

function encode(width: number, height: number, channels: 3 | 4, pixel: (x: number, y: number) => readonly number[]) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * channels);
    for (let x = 0; x < width; x++) row.set(pixel(x, y), 1 + x * channels);
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = channels === 4 ? 6 : 2; // truecolour with alpha, or RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
