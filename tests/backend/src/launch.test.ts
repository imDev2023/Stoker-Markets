import { describe, expect, it } from "vitest";
import { ComputeBudgetProgram, Keypair, PublicKey, Transaction, VersionedTransaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import {
  createCurveRuleIx, createPlatformConfigIx, initializeV2Ix, launchlabCoder, launchlabPdas, metadataPda, WSOL_MINT,
} from "@launchpad/chain";
import { CPSWAP_CONFIG, SOL_GLOBAL_CONFIG } from "@launchpad/localnet";
import { PreparedLaunch } from "@launchpad/contract";
import { connection, deliverWebhook, env, fundedWallet, getLaunch, launch, listLaunches, PNG, prepare } from "./client";

describe("launching a SOL-paired coin", () => {
  it("goes from the API to the chain to the board, with its metadata resolvable", async () => {
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator, {
      name: "Tracer Bullet",
      symbol: "TRCR",
      description: "First Launch end to end",
      website: "https://example.com",
      x: "https://x.com/example",
      telegram: "https://t.me/example",
    });

    // The pool and the coin exist on-chain, created by our platform and priced in SOL.
    const pool = await connection().getAccountInfo(new PublicKey(prepared.pool));
    expect(pool).not.toBeNull();
    const state = launchlabCoder.accounts.decode("PoolState", pool!.data) as {
      platform_config: PublicKey; quote_mint: PublicKey; creator: PublicKey; total_quote_fund_raising: BN;
    };
    expect(state.platform_config.toBase58()).toBe(env().platform.platformConfig);
    expect(state.quote_mint.toBase58()).toBe(WSOL_MINT.toBase58());
    expect(state.creator.toBase58()).toBe(creator.publicKey.toBase58());
    expect(state.total_quote_fund_raising.toString()).toBe(env().platform.graduationTargetLamports);

    // The on-chain token metadata points at the metadata the API stored.
    const onChainMetadata = await connection().getAccountInfo(metadataPda(new PublicKey(prepared.mint)));
    expect(onChainMetadata!.data.toString("utf8")).toContain(prepared.metadataUri);

    // Not on the board until the Indexer sees the transaction.
    expect((await getLaunch(prepared.mint)).status).toBe(404);
    const delivery = await deliverWebhook([signature]);
    expect(delivery.status).toBe(200);
    expect(await delivery.json()).toEqual({ launched: 1, traded: 0, claimed: 0, graduated: 0, airdropped: 0 });

    const board = await listLaunches();
    expect(board[0]).toMatchObject({
      mint: prepared.mint,
      pool: prepared.pool,
      creator: creator.publicKey.toBase58(),
      quote: { mint: WSOL_MINT.toBase58(), symbol: "SOL", name: "Solana", decimals: 9 },
      name: "Tracer Bullet",
      symbol: "TRCR",
      description: "First Launch end to end",
      links: { website: "https://example.com", x: "https://x.com/example", telegram: "https://t.me/example" },
      graduationTarget: env().platform.graduationTargetLamports,
      createdSignature: signature,
    });

    // The on-chain URI is on Arweave (the stand-in here), where the Metadata Upload job posts the document right after
    // the launch is indexed; its image is there too.
    expect(prepared.metadataUri.startsWith(`${env().turbo.url}/`)).toBe(true);
    await expect.poll(async () => (await fetch(prepared.metadataUri)).status, { timeout: 30_000 }).toBe(200);
    const metadata = (await (await fetch(prepared.metadataUri)).json()) as { image: string };
    expect(metadata).toMatchObject({ name: "Tracer Bullet", symbol: "TRCR", description: "First Launch end to end" });
    expect(metadata.image.startsWith(`${env().turbo.url}/`)).toBe(true);
    await expect.poll(async () => (await fetch(metadata.image)).status, { timeout: 30_000 }).toBe(200);
    const image = await fetch(metadata.image);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);
  });

  it("needs only the Creator's signature: the mint has already signed", async () => {
    const creator = await fundedWallet();
    const res = await prepare({ creator: creator.publicKey.toBase58() });
    const prepared = PreparedLaunch.parse(await res.json());
    const tx = VersionedTransaction.deserialize(Buffer.from(prepared.transaction, "base64"));
    const signers = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures).map((k) => k.toBase58());
    expect(signers).toEqual([creator.publicKey.toBase58(), prepared.mint]);
    const empty = new Uint8Array(64);
    expect(Buffer.from(tx.signatures[0]!).equals(Buffer.from(empty))).toBe(true);
    expect(Buffer.from(tx.signatures[1]!).equals(Buffer.from(empty))).toBe(false);
  });
});

describe("indexing", () => {
  it("writes one Launch however many times the same transaction is delivered", async () => {
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator);
    expect(await (await deliverWebhook([signature])).json()).toEqual({ launched: 1, traded: 0, claimed: 0, graduated: 0, airdropped: 0 });
    expect(await (await deliverWebhook([signature, signature])).json()).toEqual({ launched: 0, traded: 0, claimed: 0, graduated: 0, airdropped: 0 });
    expect((await listLaunches()).filter((l) => l.mint === prepared.mint)).toHaveLength(1);
  });

  it("indexes a confirmed signature reported by the client without waiting for the webhook", async () => {
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator);
    const res = await fetch(`${env().apiUrl}/v1/transactions/${signature}`, { method: "POST" });
    expect(await res.json()).toEqual({ launched: 1, traded: 0, claimed: 0, graduated: 0, airdropped: 0 });
    expect((await getLaunch(prepared.mint)).launch?.createdSignature).toBe(signature);
  });

  it("rejects webhook deliveries without the shared secret", async () => {
    const creator = await fundedWallet();
    const { prepared, signature } = await launch(creator);
    expect((await deliverWebhook([signature], "wrong")).status).toBe(401);
    expect((await getLaunch(prepared.mint)).status).toBe(404);
  });

  it("ignores launches on other platforms", async () => {
    const other = await fundedWallet(20);
    const program = new PublicKey(env().platform.launchlab);
    const otherPlatform = launchlabPdas(program).platformConfig(other.publicKey);
    const conn = connection();
    await sendAndConfirmTransaction(conn, new Transaction().add(
      createPlatformConfigIx(program, other.publicKey, {
        feeRate: new BN(10_000), creatorFeeRate: new BN(0), name: "Someone else", web: "", img: "",
        operationsWallet: other.publicKey, cpswapConfig: CPSWAP_CONFIG,
      }),
      createCurveRuleIx(program, other.publicKey, otherPlatform, SOL_GLOBAL_CONFIG),
    ), [other], { commitment: "confirmed" });
    const mint = Keypair.generate();
    const signature = await sendAndConfirmTransaction(conn, new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      initializeV2Ix({
        program, payer: other.publicKey, creator: other.publicKey, globalConfig: SOL_GLOBAL_CONFIG, platformConfig: otherPlatform,
        baseMint: mint.publicKey, quoteMint: WSOL_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID,
        name: "Elsewhere", symbol: "ELSE", uri: "https://example.invalid/else.json", graduationTargetRaw: new BN(30_000_000_000),
      }),
    ), [other, mint], { commitment: "confirmed" });
    expect(await (await deliverWebhook([signature])).json()).toEqual({ launched: 0, traded: 0, claimed: 0, graduated: 0, airdropped: 0 });
    expect((await getLaunch(mint.publicKey.toBase58())).status).toBe(404);
  });
});

describe("the launch shape is enforced on-chain", () => {
  it("rejects a launch built outside our API with a different Graduation Target", async () => {
    const creator = await fundedWallet();
    const program = new PublicKey(env().platform.launchlab);
    const mint = Keypair.generate();
    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      initializeV2Ix({
        program, payer: creator.publicKey, creator: creator.publicKey, globalConfig: SOL_GLOBAL_CONFIG,
        platformConfig: new PublicKey(env().platform.platformConfig), baseMint: mint.publicKey, quoteMint: WSOL_MINT,
        quoteTokenProgram: TOKEN_PROGRAM_ID, name: "Cheap", symbol: "CHP", uri: "https://example.invalid/c.json",
        graduationTargetRaw: new BN(env().platform.graduationTargetLamports).divn(2),
      }),
    );
    await expect(sendAndConfirmTransaction(connection(), tx, [creator, mint], { commitment: "confirmed" })).rejects.toThrow(
      /0x1789|CurveParamNotMatchPlatformRule/,
    );
  });
});

describe("launch form validation", () => {
  const creator = Keypair.generate().publicKey.toBase58();

  it.each([
    ["an empty name", { name: "" }],
    ["a symbol with spaces", { symbol: "TWO WORDS" }],
    ["a symbol longer than 10 characters", { symbol: "ABCDEFGHIJK" }],
    ["a non-http website", { website: "javascript:alert(1)" }],
    ["a creator that is not an address", { creator: "not-an-address" }],
  ])("rejects %s", async (_label, override) => {
    const res = await prepare({ creator, ...override });
    expect(res.status).toBe(400);
  });

  it("requires an image", async () => {
    const res = await prepare({ creator, image: null });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "an image is required" });
  });

  it("rejects a file that is not an image, whatever its declared type", async () => {
    const res = await prepare({ creator, image: { bytes: new TextEncoder().encode("<svg onload=alert(1)>"), type: "image/png" } });
    expect(res.status).toBe(400);
  });

  it("rejects images over 2 MB", async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG);
    const res = await prepare({ creator, image: { bytes: big, type: "image/png" } });
    expect(res.status).toBe(400);
  });
});
