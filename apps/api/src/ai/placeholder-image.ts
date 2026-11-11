import { deflateSync } from 'zlib';

/**
 * Builds a real solid-color PNG (no text) so Remotion always has a paintable
 * image when every provider fails — never an empty buffer.
 */
export function createCanvas(_label: string): Buffer {
  return createSolidPng(720, 1280, [18, 24, 38]);
}

export function isUsableMedia(buffer: Buffer): boolean {
  return buffer.length >= 1024;
}

function createSolidPng(
  width: number,
  height: number,
  rgb: [number, number, number],
): Buffer {
  const [r, g, b] = rgb;
  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0; // filter: None
    // Slight vertical gradient so it doesn't look like a dead black frame
    const shade = Math.max(0, Math.min(255, Math.round((y / height) * 40)));
    for (let x = 0; x < width; x++) {
      const i = rowStart + 1 + x * 3;
      raw[i] = Math.min(255, r + shade);
      raw[i + 1] = Math.min(255, g + shade);
      raw[i + 2] = Math.min(255, b + shade);
    }
  }

  const compressed = deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}
