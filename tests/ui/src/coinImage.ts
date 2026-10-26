// A picture of its own for every coin the suite launches: Copy Protection (#120) refuses a second coin with a launched
// coin's image for the stack's window, so two launches sharing `coin.png` would be copies of each other. Each ticker
// gets a 256 by 256 PNG with a pattern seeded by its letters, different enough in its hash from every other's.
import { deflateSync } from "node:zlib";

type Rgb = [number, number, number];

const SIZE = 256;

/** A deterministic PNG for a ticker: two colours from its letters, stripes whose width and angle come from them too. */
export function coinImage(seed: string): Buffer {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const pick = (n: number) => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return (h >>> 16) % n; };
  const a: Rgb = [40 + pick(120), 40 + pick(120), 40 + pick(120)];
  const b: Rgb = [140 + pick(115), 140 + pick(115), 140 + pick(115)];
  const c: Rgb = [pick(255), pick(255), pick(255)];
  const bands = 3 + pick(5);
  const slope = pick(3) - 1;
  const ring = 60 + pick(60);
  const rows: number[] = [];
  for (let y = 0; y < SIZE; y++) {
    rows.push(0);
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x - SIZE / 2, y - SIZE / 2);
      const band = Math.floor(((x + slope * y + SIZE) * bands) / (2 * SIZE)) % 2;
      const px = d < ring ? c : band ? a : b;
      rows.push(px[0], px[1], px[2]);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from(rows))), chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}
