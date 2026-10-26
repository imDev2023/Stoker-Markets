/**
 * A perceptual hash of a coin's image for Copy Protection (#120): a 64-bit difference hash (dHash) over the picture
 * scaled to 9 by 8 grey pixels, each bit saying whether a pixel is brighter than its right-hand neighbour. A resized,
 * re-encoded or recoloured copy keeps most bits; two unrelated pictures differ in about half. Stored as 16 hex digits.
 *
 * Decoded here: PNG (every colour type, 8 and 16 bit, palettes down to 1 bit; not interlaced) and JPEG (through jpeg-js).
 * WebP and GIF are not decoded yet, so those pictures go unchecked; the launch form says so.
 */
import { decode as decodeJpeg } from "jpeg-js";

/** Pictures smaller than this carry too little to compare (a 1x1 placeholder hashes to all zeros). */
export const MIN_HASHED_SIDE = 16;
/** Decoding more than this many pixels is not worth a Worker's memory; such a picture goes unchecked. */
const MAX_PIXELS = 4_000_000;
/** Hamming distance at or under which two hashes are the same picture; measured starting value, see ADR 0012. */
export const COPY_DISTANCE = 10;

type Grey = { width: number; height: number; /** One luminance per pixel, 0 to 255, alpha composited over white. */ lum: Float32Array };

/** The hash of an uploaded picture, or null when it can't or needn't be checked. */
export async function imageHash(bytes: Uint8Array, contentType: string): Promise<string | null> {
  const grey = await toGrey(bytes, contentType).catch(() => null);
  if (!grey || grey.width < MIN_HASHED_SIDE || grey.height < MIN_HASHED_SIDE) return null;
  const hash = dHash(grey);
  // A flat picture (one colour, or one edge) sets almost no bits and would be a copy of every other flat picture.
  return hashDistance(hash, "0000000000000000") < MIN_HASH_BITS ? null : hash;
}

/** Fewer set bits than this and the picture is too plain to compare. */
const MIN_HASH_BITS = 6;

/** Bits that differ between two hashes. */
export function hashDistance(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

async function toGrey(bytes: Uint8Array, contentType: string): Promise<Grey | null> {
  if (contentType === "image/png") return decodePng(bytes);
  if (contentType === "image/jpeg") {
    const { width, height, data } = decodeJpeg(bytes, { useTArray: true, maxMemoryUsageInMB: 64, maxResolutionInMP: MAX_PIXELS / 1_000_000 });
    return rgbaToGrey(width, height, data);
  }
  return null;
}

function rgbaToGrey(width: number, height: number, rgba: Uint8Array): Grey {
  const lum = new Float32Array(width * height);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    const a = rgba[p + 3]! / 255;
    const y = 0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!;
    lum[i] = y * a + 255 * (1 - a);
  }
  return { width, height, lum };
}

function dHash(g: Grey): string {
  // Box-average into a 9 by 8 grid; the cells are equal spans of the source, so the hash ignores the picture's size.
  const cols = 9, rows = 8;
  const cell = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const y0 = Math.floor((r * g.height) / rows), y1 = Math.max(y0 + 1, Math.floor(((r + 1) * g.height) / rows));
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * g.width) / cols), x1 = Math.max(x0 + 1, Math.floor(((c + 1) * g.width) / cols));
      let sum = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += g.lum[y * g.width + x]!;
      cell[r * cols + c] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  let hex = "";
  for (let r = 0; r < rows; r++) {
    let byte = 0;
    for (let c = 0; c < 8; c++) byte = (byte << 1) | (cell[r * cols + c]! < cell[r * cols + c + 1]! ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

// PNG, as in the specification: chunks, one zlib stream of filtered scanlines, five filter types.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function decodePng(bytes: Uint8Array): Promise<Grey | null> {
  if (!PNG_SIGNATURE.every((v, i) => bytes[i] === v)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let header: { width: number; height: number; depth: number; colorType: number } | null = null;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= bytes.length) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(bytes[pos + 4]!, bytes[pos + 5]!, bytes[pos + 6]!, bytes[pos + 7]!);
    const data = bytes.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      const interlace = data[12];
      if (interlace !== 0) return null;
      header = { width: view.getUint32(pos + 8), height: view.getUint32(pos + 12), depth: data[8]!, colorType: data[9]! };
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + length;
  }
  if (!header || idat.length === 0) return null;
  const { width, height, depth, colorType } = header;
  if (width * height > MAX_PIXELS) return null;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) return null;
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const raw = await inflate(concat(idat));
  if (raw.length < (stride + 1) * height) return null;

  const lum = new Float32Array(width * height);
  let prev = new Uint8Array(stride);
  const line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const off = y * (stride + 1);
    const filter = raw[off]!;
    line.set(raw.subarray(off + 1, off + 1 + stride));
    unfilter(filter, line, prev, bpp);
    for (let x = 0; x < width; x++) lum[y * width + x] = pixelLum(line, x, depth, colorType, palette, trns);
    prev = Uint8Array.from(line);
  }
  return { width, height, lum };
}

function unfilter(filter: number, line: Uint8Array, prev: Uint8Array, bpp: number) {
  for (let i = 0; i < line.length; i++) {
    const a = i >= bpp ? line[i - bpp]! : 0;
    const b = prev[i]!;
    const c = i >= bpp ? prev[i - bpp]! : 0;
    let add = 0;
    if (filter === 1) add = a;
    else if (filter === 2) add = b;
    else if (filter === 3) add = (a + b) >> 1;
    else if (filter === 4) {
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    line[i] = (line[i]! + add) & 0xff;
  }
}

/** A sample of `depth` bits at index `i` in a packed row, scaled to 0 to 255. */
function sample(line: Uint8Array, i: number, depth: number): number {
  if (depth === 8) return line[i]!;
  if (depth === 16) return line[i * 2]!;
  const perByte = 8 / depth;
  const byte = line[Math.floor(i / perByte)]!;
  const shift = 8 - depth * ((i % perByte) + 1);
  const v = (byte >> shift) & ((1 << depth) - 1);
  return v;
}

function pixelLum(line: Uint8Array, x: number, depth: number, colorType: number, palette: Uint8Array | null, trns: Uint8Array | null): number {
  const scale = depth < 8 ? 255 / ((1 << depth) - 1) : 1;
  if (colorType === 3) {
    const idx = sample(line, x, depth);
    const r = palette?.[idx * 3] ?? 0, g = palette?.[idx * 3 + 1] ?? 0, b = palette?.[idx * 3 + 2] ?? 0;
    const a = (trns && idx < trns.length ? trns[idx]! : 255) / 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
  }
  if (colorType === 0) return sample(line, x, depth) * scale;
  if (colorType === 4) {
    const y = sample(line, x * 2, depth), a = sample(line, x * 2 + 1, depth) / 255;
    return y * a + 255 * (1 - a);
  }
  const n = colorType === 6 ? 4 : 3;
  const r = sample(line, x * n, depth), g = sample(line, x * n + 1, depth), b = sample(line, x * n + 2, depth);
  const a = colorType === 6 ? sample(line, x * n + 3, depth) / 255 : 1;
  return (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Inflates a zlib stream with the platform's DecompressionStream, which Workers and Node both have. */
async function inflate(zlib: Uint8Array): Promise<Uint8Array> {
  const copy = zlib.buffer.slice(zlib.byteOffset, zlib.byteOffset + zlib.byteLength) as ArrayBuffer;
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
