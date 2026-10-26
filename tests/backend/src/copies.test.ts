// Copy Protection (#120, ADR 0012): for COPY_PROTECTION_SECONDS after a coin launches (45 s on the test stack, seven days
// deployed), nobody else may launch a coin here with its name, ticker or image; afterwards anyone may, and the check
// only labels. Black box: the check endpoint, prepare's refusals, and the labels on the launch summary.
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { ComputeBudgetProgram, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { initializeV2Ix, programsFor, WSOL_MINT } from "@launchpad/chain";
import { SOL_GLOBAL_CONFIG } from "@launchpad/localnet";
import { CopyCheck } from "@launchpad/contract";
import { connection, deliverWebhook, env, fundedWallet, getLaunch, launch, prepare, uniqueTag } from "./client";

const WINDOW_SECONDS = 45;

type Rgb = [number, number, number];
/** A PNG in two colours, big enough to hash unlike the suite's 1x1: a diagonal split, or stripes four pixels wide. */
function png(a: Rgb, b: Rgb, size = 32, pattern: "diagonal" | "stripes" | "flat" = "stripes") {
  const rows: number[] = [];
  for (let y = 0; y < size; y++) {
    rows.push(0);
    for (let x = 0; x < size; x++) rows.push(...(pattern === "flat" ? a : pattern === "stripes" ? (Math.floor((x * 8) / size) % 2 ? a : b) : x + y < size ? a : b));
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from(rows))), chunk("IEND", Buffer.alloc(0)),
  ]));
}

function crc32(buf: Buffer) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

const image = (bytes: Uint8Array) => ({ bytes, type: "image/png" });

async function check(fields: { creator?: string; name?: string; symbol?: string; image?: Uint8Array }) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) if (typeof v === "string") body.set(k, v);
  if (fields.image) body.set("image", new Blob([fields.image], { type: "image/png" }), "coin.png");
  const res = await fetch(`${env().apiUrl}/v1/launches/check`, { method: "POST", body });
  expect(res.status).toBe(200);
  return CopyCheck.parse(await res.json());
}

async function summary(mint: string) {
  const res = await getLaunch(mint);
  expect(res.status).toBe(200);
  return res.launch!;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const symbolOf = (c: CopyCheck) => c.symbol!;

describe("Copy Protection", () => {
  it("refuses another Creator's copy of a launched coin's ticker, name and image inside the window, by any fold, and labels one after it", async () => {
    const tag = uniqueTag();
    const original = await fundedWallet();
    const copier = await fundedWallet();
    // Eight stripes, the first colour the brighter: a picture with enough edges to hash (a flat one is not compared).
    const picture = png([240, 80, 20], [20, 40, 200]);
    const launched = await launch(original, { name: `Ember Fox ${tag}`, symbol: `EMB${tag.slice(0, 4)}`, image: image(picture) });
    await deliverWebhook([launched.signature]);
    const coin = await summary(launched.prepared.mint);
    expect(new Date(coin.protection.until).getTime() - new Date(coin.createdAt).getTime()).toBe(WINDOW_SECONDS * 1000);
    expect(coin.copyOf).toBeNull();

    const ticker = `EMB${tag.slice(0, 4)}`;
    const protectedCoin = expect.objectContaining({ mint: coin.mint, symbol: ticker, name: `Ember Fox ${tag}`, protectedUntil: coin.protection.until });
    // The check endpoint, as the launch form asks: the same ticker in lower case, with a $ and with leetspeak are all taken.
    for (const copy of [ticker.toLowerCase(), `$${ticker}`, ticker.replace("E", "3").replace("B", "8")]) {
      const v = await check({ creator: copier.publicKey.toBase58(), symbol: copy });
      expect(v.symbol).toMatchObject({ status: "taken", kind: "ticker", of: protectedCoin });
      expect(v.symbol!.reason).toContain(ticker);
    }
    expect(symbolOf(await check({ symbol: `${ticker}2` })).kind).toBe("ticker");
    expect(symbolOf(await check({ symbol: `${ticker.slice(0, -1)}Q` })).kind).toBe("near");
    // The name, with a claim word added, and the picture resized and recoloured.
    const name = await check({ name: `Official Ember Fox ${tag}` });
    expect(name.name).toMatchObject({ status: "taken", kind: "name", of: protectedCoin });
    // The same picture twice the size, recoloured but with the same stripe brighter.
    const resized = await check({ image: png([250, 100, 40], [10, 30, 180], 64) });
    expect(resized.image).toMatchObject({ status: "taken", kind: "image", of: protectedCoin });
    // Another picture, a free ticker and a tiny image that can't be read are not.
    const other = await check({ name: `Other ${tag}`, symbol: `OTH${tag.slice(0, 3)}`, image: png([20, 60, 20], [200, 220, 200], 32, "diagonal") });
    expect(other).toMatchObject({ name: { status: "free" }, symbol: { status: "free" }, image: { status: "free" }, protectionSeconds: WINDOW_SECONDS });
    expect((await check({ image: png([1, 2, 3], [4, 5, 6], 8) })).image).toMatchObject({ status: "unchecked" });
    expect((await check({ image: png([90, 90, 90], [90, 90, 90], 32, "flat") })).image).toMatchObject({ status: "unchecked" });
    // The Creator may reuse their own.
    expect((await check({ creator: original.publicKey.toBase58(), symbol: ticker, name: `Ember Fox ${tag}`, image: picture })).symbol).toMatchObject({ status: "free" });

    // Prepare refuses with the same verdict, the ticker first.
    const refused = await prepare({ creator: copier.publicKey.toBase58(), name: `Ember Fox ${tag}`, symbol: ticker, image: image(picture) });
    expect(refused.status).toBe(409);
    const body = (await refused.json()) as { error: string; copy: { kind: string; of: { mint: string } } };
    expect(body.copy).toMatchObject({ kind: "ticker", of: { mint: coin.mint } });
    expect(body.error).toBe(body.copy && (await check({ symbol: ticker })).symbol!.reason);
    const byImage = await prepare({ creator: copier.publicKey.toBase58(), image: image(picture) });
    expect(byImage.status).toBe(409);
    expect(((await byImage.json()) as { copy: { kind: string } }).copy.kind).toBe("image");
    // The original Creator relaunches their own ticker freely.
    const again = await prepare({ creator: original.publicKey.toBase58(), name: `Ember Fox ${tag}`, symbol: ticker, image: image(picture) });
    expect(again.status).toBe(200);

    // After the window the copy launches, and carries a label naming the original.
    await sleep(Math.max(0, new Date(coin.protection.until).getTime() - Date.now() + 500));
    expect((await check({ symbol: ticker })).symbol).toMatchObject({ status: "free" });
    const late = await launch(copier, { name: `Ember Fox ${tag}`, symbol: ticker, image: image(picture) });
    await deliverWebhook([late.signature]);
    const copy = await summary(late.prepared.mint);
    expect(copy.copyOf).toMatchObject({ kind: "ticker", mint: coin.mint, symbol: ticker, protectedUntil: coin.protection.until });
    expect((await summary(coin.mint)).copyOf).toBeNull();
  }, 150_000);

  it("labels a coin launched on our PlatformConfig without our API as a copy of a protected one", async () => {
    const tag = uniqueTag();
    const original = await fundedWallet();
    const launched = await launch(original, { name: `Quiet Owl ${tag}`, symbol: `OWL${tag.slice(0, 4)}` });
    await deliverWebhook([launched.signature]);

    const creator = await fundedWallet();
    const mint = Keypair.generate();
    const programs = programsFor("localnet");
    const signature = await sendAndConfirmTransaction(connection(), new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      initializeV2Ix({
        program: programs.launchlab, payer: creator.publicKey, creator: creator.publicKey, globalConfig: SOL_GLOBAL_CONFIG,
        platformConfig: new PublicKey(env().platform.platformConfig), baseMint: mint.publicKey, quoteMint: WSOL_MINT,
        quoteTokenProgram: TOKEN_PROGRAM_ID, name: `quiet owl ${tag}`, symbol: `owl${tag.slice(0, 4)}`,
        uri: "https://example.invalid/owl.json", graduationTargetRaw: new BN(env().platform.graduationTargetLamports),
      }),
    ), [creator, mint], { commitment: "confirmed" });
    expect(await (await deliverWebhook([signature])).json()).toEqual({ launched: 1, traded: 0, graduated: 0, airdropped: 0 });
    const copy = await summary(mint.publicKey.toBase58());
    expect(copy.copyOf).toEqual({
      kind: "ticker", mint: launched.prepared.mint, symbol: `OWL${tag.slice(0, 4)}`, name: `Quiet Owl ${tag}`,
      launchedAt: expect.any(String), protectedUntil: expect.any(String),
    });
    // It stays on the board, and the original is not a copy of it.
    expect((await summary(launched.prepared.mint)).copyOf).toBeNull();
  }, 60_000);
});
