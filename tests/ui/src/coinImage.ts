// A picture of its own for every coin the suite launches: Copy Protection (#120) refuses a second coin with a launched
// coin's image for the stack's window, so two launches sharing `coin.png` would be copies of each other. The API compares
// pictures by a 64-bit difference hash over a 9 by 8 grid of grey cells (bit = cell darker than its right neighbour), so
// each ticker's picture is drawn on that very grid with its brightness steps chosen to spell out 64 bits derived from the
// ticker: two tickers' pictures are then as far apart in the hash as two random 64-bit numbers, never within the 10 bits
// that count as a copy. Stripes or discs seeded at random were not enough (two such pictures matched in the first run).
import { deflateSync } from "node:zlib";

const SIZE = 256;
const COLS = 9;
const ROWS = 8;

/** A deterministic 256 by 256 PNG for a ticker: a mosaic in shades of a colour drawn from its letters. */
export function coinImage(seed: string): Buffer {
  const bits = bitsOf(seed);
  const tint = tintOf(seed);
  // Brightness per grid cell: each row walks up or down by a fixed step as its eight bits say, from the row's own start.
  const cells: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [120 + ((bits[r]! >> 4) & 0x0f) * 2];
    for (let c = 0; c < COLS - 1; c++) {
      const up = (bits[r]! >> (7 - c)) & 1;
      row.push(row[c]! + (up ? 12 : -12));
    }
    cells.push(row);
  }
  const rows: number[] = [];
  for (let y = 0; y < SIZE; y++) {
    rows.push(0);
    const r = cellIndex(y, ROWS);
    for (let x = 0; x < SIZE; x++) {
      const v = cells[r]![cellIndex(x, COLS)]!;
      rows.push(clamp((v * tint[0]) / 255), clamp((v * tint[1]) / 255), clamp((v * tint[2]) / 255));
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

/** The same cell boundaries as the API's hash: cell c spans floor(c * size / n) to floor((c + 1) * size / n). */
function cellIndex(px: number, n: number) {
  let i = Math.floor((px * n) / SIZE);
  while (Math.floor((i * SIZE) / n) > px) i--;
  while (Math.floor(((i + 1) * SIZE) / n) <= px) i++;
  return i;
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Eight bytes from the seed: an FNV-1a hash stirred once per byte. */
function bitsOf(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < 8; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    out.push((h >>> 16) & 0xff);
  }
  return out;
}

/** A bright, saturated colour per ticker; every cell is a shade of it, so the brightness steps alone decide the hash. */
function tintOf(seed: string): [number, number, number] {
  const hue = bitsOf(`${seed}:tint`)[0]! / 255;
  const f = (n: number) => {
    const k = (n + hue * 12) % 12;
    return Math.round(255 * (0.55 + 0.45 * Math.max(-1, Math.min(1, Math.min(k - 3, 9 - k)))));
  };
  return [f(0), f(8), f(4)];
}

function crc32(buf: Buffer) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}
