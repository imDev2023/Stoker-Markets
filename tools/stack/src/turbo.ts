// A stand-in for ArDrive Turbo and an Arweave gateway, for tests and local development: takes signed ANS-104 data
// items as Turbo's upload service does (free under the free limit, charged in winc above it, 402 without credits),
// sells credits for SOL sent on the local chain to its deposit address as the payment service does, and serves every
// item it holds at `/<id>` as a gateway would. Only the endpoints the API uses, with Turbo's own shapes.
import { createServer } from "node:http";
import { Connection, Keypair, LAMPORTS_PER_SOL, type ParsedInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import { parseDataItem, type Tag } from "@launchpad/arweave";

/** Turbo's own figures on 2026-10-03, rounded: 1 MiB costs about 13.1e9 winc, 1 SOL buys about 17.9e12. */
export const TURBO_WINC_PER_BYTE = 12_500n;
export const TURBO_WINC_PER_SOL = 17_900_000_000_000n;
/** Items of up to this many bytes, header included, are free. */
export const TURBO_FREE_UPLOAD_LIMIT_BYTES = 107_520;

export type HeldItem = { id: string; owner: string; bytes: number; contentType: string; winc: string; data: Uint8Array; tags: Tag[]; uploads: number };

export type TurboStandIn = {
  url: string;
  /** Where SOL for credits is sent; a fresh key per stand-in. */
  depositAddress: string;
  /** Every item ever posted, by id, with how many times it was posted. */
  items: () => HeldItem[];
  /** Credits by wallet address, in winc. */
  credits: () => Map<string, bigint>;
  stop: () => Promise<void>;
};

export async function startTurboStandIn(opts: { rpcUrl: string; port: number; freeUploadLimitBytes?: number }): Promise<TurboStandIn> {
  const freeLimit = opts.freeUploadLimitBytes ?? TURBO_FREE_UPLOAD_LIMIT_BYTES;
  const connection = new Connection(opts.rpcUrl, "confirmed");
  const deposit = Keypair.generate().publicKey.toBase58();
  const items = new Map<string, HeldItem>();
  const credits = new Map<string, bigint>();
  const credited = new Map<string, bigint>();
  const url = `http://127.0.0.1:${opts.port}`;
  const host = `127.0.0.1:${opts.port}`;

  const body = (req: import("node:http").IncomingMessage) =>
    new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });

  /** Credits the sender of a SOL transfer to the deposit address; pending until the chain shows it, failed if it failed. */
  async function credit(signature: string) {
    const already = credited.get(signature);
    if (already !== undefined) return { creditedTransaction: { transactionId: signature, winstonCreditAmount: already.toString() } };
    const tx = await connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }).catch(() => null);
    if (!tx) return { pendingTransaction: { transactionId: signature } };
    if (tx.meta?.err) return { failedTransaction: { transactionId: signature, failedReason: JSON.stringify(tx.meta.err) } };
    const transfer = tx.transaction.message.instructions
      .map((i) => (i as ParsedInstruction).parsed as { type?: string; info?: { source: string; destination: string; lamports: number } } | undefined)
      .find((p) => p?.type === "transfer" && p.info?.destination === deposit);
    if (!transfer?.info) return { failedTransaction: { transactionId: signature, failedReason: "no transfer to the deposit address" } };
    const winc = (BigInt(transfer.info.lamports) * TURBO_WINC_PER_SOL) / BigInt(LAMPORTS_PER_SOL);
    credits.set(transfer.info.source, (credits.get(transfer.info.source) ?? 0n) + winc);
    credited.set(signature, winc);
    return { creditedTransaction: { transactionId: signature, winstonCreditAmount: winc.toString(), transactionSenderAddress: transfer.info.source } };
  }

  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", url);
    const json = (status: number, b: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(b));
    void (async () => {
      if (req.method === "GET" && u.pathname === "/v1/info")
        return json(200, { version: "stand-in", gateway: url, addresses: { solana: deposit }, freeUploadLimitBytes: freeLimit });
      if (req.method === "POST" && u.pathname === "/v1/tx/solana") {
        const bytes = new Uint8Array(await body(req));
        let parsed;
        try {
          parsed = await parseDataItem(bytes);
        } catch (e) {
          return json(400, { error: `not a data item: ${(e as Error).message}` });
        }
        if (!parsed.valid) return json(400, { error: "invalid signature" });
        const owner = bs58.encode(parsed.owner);
        const held = items.get(parsed.id);
        let winc = 0n;
        if (!held) {
          if (bytes.byteLength > freeLimit) {
            winc = BigInt(bytes.byteLength) * TURBO_WINC_PER_BYTE;
            const balance = credits.get(owner) ?? 0n;
            if (balance < winc) return json(402, { x402Version: 1, error: "insufficient balance", accepts: [] });
            credits.set(owner, balance - winc);
          }
          items.set(parsed.id, {
            id: parsed.id, owner, bytes: bytes.byteLength, winc: winc.toString(), data: parsed.data, tags: parsed.tags, uploads: 0,
            contentType: parsed.tags.find((t) => t.name === "Content-Type")?.value ?? "application/octet-stream",
          });
        }
        items.get(parsed.id)!.uploads++;
        return json(200, {
          id: parsed.id, timestamp: Date.now(), winc: winc.toString(), version: "0.2.0", deadlineHeight: 0, dataCaches: [host], fastFinalityIndexes: [host],
          public: "stand-in", signature: "stand-in", owner: Buffer.from(parsed.owner).toString("base64url"),
        });
      }
      if (req.method === "GET" && u.pathname === "/v1/account/balance/solana") {
        const balance = credits.get(u.searchParams.get("address") ?? "");
        if (balance === undefined) return res.writeHead(404).end("User Not Found");
        return json(200, { winc: balance.toString(), controlledWinc: balance.toString(), effectiveBalance: balance.toString(), givenApprovals: [], receivedApprovals: [] });
      }
      if (req.method === "POST" && u.pathname === "/v1/account/balance/solana") {
        const { tx_id } = JSON.parse((await body(req)).toString() || "{}") as { tx_id?: string };
        if (!tx_id) return json(400, { error: "tx_id required" });
        return json(200, await credit(tx_id));
      }
      let m = /^\/v1\/price\/bytes\/(\d+)$/.exec(u.pathname);
      if (req.method === "GET" && m) return json(200, { winc: (BigInt(m[1]!) * TURBO_WINC_PER_BYTE).toString(), adjustments: [] });
      m = /^\/v1\/price\/solana\/(\d+)$/.exec(u.pathname);
      if (req.method === "GET" && m) return json(200, { winc: ((BigInt(m[1]!) * TURBO_WINC_PER_SOL) / BigInt(LAMPORTS_PER_SOL)).toString(), fees: [] });
      if (req.method === "GET" && u.pathname === "/stand-in/items")
        return json(200, [...items.values()].map((i) => ({ id: i.id, owner: i.owner, bytes: i.bytes, contentType: i.contentType, winc: i.winc, tags: i.tags, uploads: i.uploads })));
      m = /^\/([A-Za-z0-9_-]{43})$/.exec(u.pathname);
      if (req.method === "GET" && m) {
        const item = items.get(m[1]!);
        if (!item) return json(404, { error: "not found" });
        return res.writeHead(200, { "content-type": item.contentType, "cache-control": "public, max-age=31536000, immutable" }).end(Buffer.from(item.data));
      }
      json(404, { error: "not found" });
    })().catch((e: Error) => json(500, { error: e.message }));
  });
  await new Promise<void>((resolve) => server.listen(opts.port, "127.0.0.1", resolve));
  return {
    url,
    depositAddress: deposit,
    items: () => [...items.values()],
    credits: () => new Map(credits),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
