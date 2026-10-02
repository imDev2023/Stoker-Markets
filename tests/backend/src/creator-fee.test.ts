import { describe, expect, it } from "vitest";
import {
  ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction,
  VersionedTransaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_MINT, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction, createSyncNativeInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import BN from "bn.js";
import {
  createCurveRuleIx, createPlatformConfigIx, initializeV2Ix, launchlabPdas, loadCurve, prepareTrade as buildTrade,
} from "@launchpad/chain";
import { CPSWAP_CONFIG, LOCAL_QUOTES, mintLocalQuote, SOL_GLOBAL_CONFIG } from "@launchpad/localnet";
import { CreatorFeeClaimList, CreatorFees, PreparedCreatorFeeClaim } from "@launchpad/contract";
import {
  connection, deliverWebhook, env, feeAt, feeRates, fundedWallet, launch, networkFee, signAndSend, solOf, tokenBalance, trade,
} from "./client";

const SOL = (n: number) => BigInt(Math.round(n * LAMPORTS_PER_SOL));
const WSOL = NATIVE_MINT.toBase58();
const SOL_QUOTE = expect.objectContaining({ mint: WSOL, symbol: "SOL", decimals: 9 });

// ---------------------------------------------------------------------------------------------------------------------
// The public docs (the web app's "Claim without this website" page), followed literally: only @solana/web3.js and
// @solana/spl-token, the program's published instruction layout, and nothing from our API or our code.
const CLAIM_CREATOR_FEE = Buffer.from([26, 97, 138, 203, 132, 171, 141, 252]);

function creatorFeeVault(creator: PublicKey, quoteMint: PublicKey) {
  const program = new PublicKey(env().platform.launchlab);
  return PublicKey.findProgramAddressSync([creator.toBuffer(), quoteMint.toBuffer()], program)[0];
}

function claimFollowingTheDocs(creator: PublicKey, quoteMint = NATIVE_MINT) {
  const program = new PublicKey(env().platform.launchlab);
  const [vaultAuthority] = PublicKey.findProgramAddressSync([Buffer.from("creator_fee_vault_auth_seed")], program);
  const recipient = getAssociatedTokenAddressSync(quoteMint, creator);
  return new TransactionInstruction({
    programId: program,
    data: CLAIM_CREATOR_FEE,
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: creatorFeeVault(creator, quoteMint), isSigner: false, isWritable: true },
      { pubkey: recipient, isSigner: false, isWritable: true },
      { pubkey: quoteMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}
// ---------------------------------------------------------------------------------------------------------------------

async function launchedCoin(creator: Keypair) {
  const { prepared, signature } = await launch(creator);
  await deliverWebhook([signature]);
  return prepared.mint;
}

/** A trader buys, and the trade is indexed; returns the Creator Fee the trade paid. */
async function buy(mint: string, sol: number) {
  const trader = await fundedWallet();
  const t = await trade(trader, mint, "buy", SOL(sol));
  await deliverWebhook([t.signature]);
  return BigInt(t.quote.fees.creator);
}

async function fees(creator: PublicKey | string) {
  const res = await fetch(`${env().apiUrl}/v1/creators/${creator.toString()}/fees`);
  expect(res.status).toBe(200);
  return CreatorFees.parse(await res.json());
}

async function claims(creator: PublicKey | string) {
  const res = await fetch(`${env().apiUrl}/v1/creators/${creator.toString()}/claims`);
  expect(res.status).toBe(200);
  return CreatorFeeClaimList.parse(await res.json()).claims;
}

function prepareClaim(body: { creator: string; quoteMint: string }) {
  return fetch(`${env().apiUrl}/v1/creator-fees/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function preparedClaim(creator: Keypair) {
  const res = await prepareClaim({ creator: creator.publicKey.toBase58(), quoteMint: WSOL });
  if (!res.ok) throw new Error(`prepare claim failed: ${res.status} ${await res.text()}`);
  return PreparedCreatorFeeClaim.parse(await res.json());
}

const vaultBalance = (creator: PublicKey) => tokenBalance(creatorFeeVault(creator, NATIVE_MINT));

describe("the Creator Fee dashboard", () => {
  it("shows each Quote Asset's claimable Creator Fee exactly as its on-chain vault holds it", async () => {
    const creator = await fundedWallet();
    const first = await launchedCoin(creator);
    const second = await launchedCoin(creator);
    const paid = [await buy(first, 0.1), await buy(second, 0.2), await buy(first, 0.05)];

    const vault = creatorFeeVault(creator.publicKey, NATIVE_MINT);
    const onChain = await vaultBalance(creator.publicKey);
    expect(onChain).toBe(paid.reduce((a, b) => a + b));

    const f = await fees(creator.publicKey);
    expect(f.creator).toBe(creator.publicKey.toBase58());
    expect(f.assets).toEqual([
      {
        quote: SOL_QUOTE, vault: vault.toBase58(), claimable: onChain.toString(), earned: onChain.toString(), claimed: "0",
        // The platform matches the on-chain Creator Fee (ADR 0007); nothing is forwarded before the Fee Collector has run.
        forward: { earned: onChain.toString(), forwarded: "0", pending: onChain.toString() },
      },
    ]);
    // Newest Launch first, each with the Creator Fee its own trades paid.
    expect(f.launches.map((l) => [l.mint, l.earned, l.status])).toEqual([
      [second, paid[1]!.toString(), "live"],
      [first, (paid[0]! + paid[2]!).toString(), "live"],
    ]);
    expect(f.launches[0]).toMatchObject({ name: "Tracer", symbol: "TRCR", quote: SOL_QUOTE, image: expect.stringContaining(second) });
  });

  it("shows nothing for a wallet that never launched here", async () => {
    const nobody = Keypair.generate().publicKey;
    expect(await fees(nobody)).toEqual({ creator: nobody.toBase58(), assets: [], launches: [] });
    expect(await claims(nobody)).toEqual([]);
  });

  it("stops the Creator Fee at Graduation: the sold-out curve earns nothing more", async () => {
    const creator = await fundedWallet();
    const mint = await launchedCoin(creator);
    const paid = await buy(mint, 2); // more than the whole curve costs, so this buy sells it out
    const f = await fees(creator.publicKey);
    expect(f.launches).toEqual([expect.objectContaining({ mint, status: "graduating", earned: paid.toString() })]);
    const more = await fetch(`${env().apiUrl}/v1/launches/${mint}/quote?side=buy&amount=1000000`);
    expect(more.status).toBe(409);
  });

  it("counts the whole vault as claimable, including Creator Fee earned on other LaunchLab platforms", async () => {
    const creator = await fundedWallet(25);
    const ours = await launchedCoin(creator);
    const earnedHere = await buy(ours, 0.1);
    const { signature } = await tradeOnAnotherPlatform(creator, 0.1);
    expect(await (await deliverWebhook([signature])).json()).toEqual({ launched: 0, traded: 0, claimed: 0, graduated: 0, airdropped: 0 });

    const onChain = await vaultBalance(creator.publicKey);
    expect(onChain).toBeGreaterThan(earnedHere);
    expect((await fees(creator.publicKey)).assets).toEqual([
      expect.objectContaining({ claimable: onChain.toString(), earned: earnedHere.toString(), claimed: "0" }),
    ]);
  });
});

describe("claiming the Creator Fee", () => {
  it("pays the vault into the Creator's wallet as SOL, with only the Creator's signature", async () => {
    const creator = await fundedWallet();
    const mint = await launchedCoin(creator);
    await buy(mint, 0.3);
    const inVault = await vaultBalance(creator.publicKey);

    const p = await preparedClaim(creator);
    expect(p).toMatchObject({ quote: SOL_QUOTE, amount: inVault.toString(), unwrapped: true });
    const tx = VersionedTransaction.deserialize(Buffer.from(p.transaction, "base64"));
    const signers = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures).map((k) => k.toBase58());
    expect(signers).toEqual([creator.publicKey.toBase58()]);

    const sol = await solOf(creator);
    const signature = await signAndSend(p, creator);
    expect((await solOf(creator)) - sol).toBe(inVault - (await networkFee(signature)));
    expect(await vaultBalance(creator.publicKey)).toBe(0n);
    // The wrapped-SOL account the claim opened is closed again, so nothing is left wrapped.
    expect(await connection().getAccountInfo(getAssociatedTokenAddressSync(NATIVE_MINT, creator.publicKey))).toBeNull();

    expect(await (await deliverWebhook([signature])).json()).toEqual({ launched: 0, traded: 0, claimed: 1, graduated: 0, airdropped: 0 });
    expect(await claims(creator.publicKey)).toEqual([
      { signature, quote: SOL_QUOTE, amount: inVault.toString(), time: expect.any(String) },
    ]);
    expect((await fees(creator.publicKey)).assets).toEqual([
      expect.objectContaining({ claimable: "0", earned: inVault.toString(), claimed: inVault.toString() }),
    ]);

    // Trading goes on filling the vault, and the next claim takes only what is new.
    const next = await buy(mint, 0.1);
    expect((await fees(creator.publicKey)).assets[0]!.claimable).toBe(next.toString());
    expect((await preparedClaim(creator)).amount).toBe(next.toString());
  });

  it("leaves an existing wrapped-SOL account, and what it held, alone", async () => {
    const creator = await fundedWallet();
    await buy(await launchedCoin(creator), 0.2);
    const wsol = getAssociatedTokenAddressSync(NATIVE_MINT, creator.publicKey);
    await sendAndConfirmTransaction(connection(), new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(creator.publicKey, wsol, creator.publicKey, NATIVE_MINT),
      SystemProgram.transfer({ fromPubkey: creator.publicKey, toPubkey: wsol, lamports: SOL(0.05) }),
      createSyncNativeInstruction(wsol),
    ), [creator], { commitment: "confirmed" });
    const inVault = await vaultBalance(creator.publicKey);

    const p = await preparedClaim(creator);
    expect(p.unwrapped).toBe(false);
    const sol = await solOf(creator);
    const signature = await signAndSend(p, creator);
    expect(await tokenBalance(wsol)).toBe(SOL(0.05) + inVault);
    expect(sol - (await solOf(creator))).toBe(await networkFee(signature));
  });

  it("works without our API by following the public docs, and the claim shows in the history", async () => {
    const creator = await fundedWallet();
    await buy(await launchedCoin(creator), 0.2);
    const inVault = await vaultBalance(creator.publicKey);

    const sol = await solOf(creator);
    const signature = await sendAndConfirmTransaction(connection(), new Transaction().add(
      claimFollowingTheDocs(creator.publicKey),
      // Optional last step of the docs: unwrap the SOL the claim paid as wrapped SOL.
      createCloseAccountInstruction(getAssociatedTokenAddressSync(NATIVE_MINT, creator.publicKey), creator.publicKey, creator.publicKey),
    ), [creator], { commitment: "confirmed" });
    expect((await solOf(creator)) - sol).toBe(inVault - (await networkFee(signature)));
    expect(await vaultBalance(creator.publicKey)).toBe(0n);

    // Helius delivers it like any other claim.
    expect(await (await deliverWebhook([signature])).json()).toEqual({ launched: 0, traded: 0, claimed: 1, graduated: 0, airdropped: 0 });
    expect(await claims(creator.publicKey)).toEqual([expect.objectContaining({ signature, amount: inVault.toString() })]);

    // As the docs say, a claim with nothing in the vault fails and moves nothing.
    await expect(sendAndConfirmTransaction(connection(), new Transaction().add(claimFollowingTheDocs(creator.publicKey)), [creator], {
      commitment: "confirmed",
    })).rejects.toThrow();
    expect(await vaultBalance(creator.publicKey)).toBe(0n);
  });

  it("can't be taken by anyone but the Creator", async () => {
    const creator = await fundedWallet();
    await buy(await launchedCoin(creator), 0.2);
    const inVault = await vaultBalance(creator.publicKey);
    const thief = await fundedWallet();

    // The vault is derived from the signer, so a claim naming someone else's vault is refused on-chain.
    const ix = claimFollowingTheDocs(thief.publicKey);
    ix.keys[2]!.pubkey = creatorFeeVault(creator.publicKey, NATIVE_MINT);
    await expect(sendAndConfirmTransaction(connection(), new Transaction().add(ix), [thief], { commitment: "confirmed" }))
      .rejects.toThrow(/ConstraintSeeds|0x7d6/);
    // A thief's own vault holds nothing, so the API has nothing to build for them.
    const res = await prepareClaim({ creator: thief.publicKey.toBase58(), quoteMint: WSOL });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "there is no Creator Fee to claim in this Quote Asset" });
    expect(await vaultBalance(creator.publicKey)).toBe(inVault);
  });

  it("indexes each claim once, however often and by whichever path it arrives", async () => {
    const creator = await fundedWallet();
    await buy(await launchedCoin(creator), 0.1);
    const signature = await signAndSend(await preparedClaim(creator), creator);
    // The fast path the web app uses after a claim confirms.
    const fast = await fetch(`${env().apiUrl}/v1/transactions/${signature}`, { method: "POST" });
    expect(await fast.json()).toEqual({ launched: 0, traded: 0, claimed: 1, graduated: 0, airdropped: 0 });
    expect(await (await deliverWebhook([signature, signature])).json()).toEqual({ launched: 0, traded: 0, claimed: 0, graduated: 0, airdropped: 0 });
    expect(await claims(creator.publicKey)).toHaveLength(1);
  });

  it("ignores claims by Creators who never launched on our platform", async () => {
    const outsider = await fundedWallet(25);
    await tradeOnAnotherPlatform(outsider, 0.1);
    const signature = await sendAndConfirmTransaction(connection(), new Transaction().add(claimFollowingTheDocs(outsider.publicKey)), [outsider], {
      commitment: "confirmed",
    });
    expect(await (await deliverWebhook([signature])).json()).toEqual({ launched: 0, traded: 0, claimed: 0, graduated: 0, airdropped: 0 });
    expect(await claims(outsider.publicKey)).toEqual([]);
  });

  it("refuses bad addresses and an empty vault", async () => {
    const nobody = Keypair.generate().publicKey.toBase58();
    expect((await fetch(`${env().apiUrl}/v1/creators/not-an-address/fees`)).status).toBe(400);
    expect((await fetch(`${env().apiUrl}/v1/creators/not-an-address/claims`)).status).toBe(400);
    expect((await prepareClaim({ creator: "not-an-address", quoteMint: WSOL })).status).toBe(400);
    expect((await prepareClaim({ creator: nobody, quoteMint: "nope" })).status).toBe(400);
    expect((await prepareClaim({ creator: nobody, quoteMint: WSOL })).status).toBe(409);
  });
});

describe("the Creator Fee in a Quote Asset other than SOL", () => {
  const USDC = LOCAL_QUOTES.USDC;
  const usdc = (n: number) => BigInt(Math.round(n * 1e6));

  it("collects in its own USDC vault, beside the SOL one, and claims as USDC with the same public recipe", async () => {
    const creator = await fundedWallet();
    const solCoin = await launchedCoin(creator);
    const { prepared, signature: launched } = await launch(creator, { symbol: "USDP", quoteMint: USDC.toBase58() });
    await deliverWebhook([launched]);
    const earnedSol = await buy(solCoin, 0.1);
    const trader = await fundedWallet();
    await mintLocalQuote(connection(), USDC, trader.publicKey, usdc(50));
    const t = await trade(trader, prepared.mint, "buy", usdc(20));
    await deliverWebhook([t.signature]);
    const earnedUsdc = BigInt(t.quote.fees.creator);
    expect(earnedUsdc).toBe(feeAt(usdc(20), (await feeRates()).creator));

    const usdcVault = creatorFeeVault(creator.publicKey, USDC);
    expect(await tokenBalance(usdcVault)).toBe(earnedUsdc);
    const usdcQuote = expect.objectContaining({ mint: USDC.toBase58(), symbol: "USDC", decimals: 6 });
    const f = await fees(creator.publicKey);
    expect(f.assets).toEqual([
      expect.objectContaining({ quote: SOL_QUOTE, claimable: earnedSol.toString() }),
      {
        quote: usdcQuote, vault: usdcVault.toBase58(), claimable: earnedUsdc.toString(), earned: earnedUsdc.toString(), claimed: "0",
        forward: { earned: earnedUsdc.toString(), forwarded: "0", pending: earnedUsdc.toString() },
      },
    ]);
    expect(f.launches.map((l) => [l.symbol, l.quote.mint, l.earned])).toEqual([
      ["USDP", USDC.toBase58(), earnedUsdc.toString()],
      ["TRCR", WSOL, earnedSol.toString()],
    ]);

    // Through the API: USDC lands in the Creator's USDC account, which the claim opens; nothing is unwrapped.
    const res = await prepareClaim({ creator: creator.publicKey.toBase58(), quoteMint: USDC.toBase58() });
    const p = PreparedCreatorFeeClaim.parse(await res.json());
    expect(p).toMatchObject({ quote: usdcQuote, amount: earnedUsdc.toString(), unwrapped: false });
    const claimed = await signAndSend(p, creator);
    expect(await tokenBalance(getAssociatedTokenAddressSync(USDC, creator.publicKey))).toBe(earnedUsdc);
    expect(await tokenBalance(usdcVault)).toBe(0n);
    // The SOL vault is a different vault and is untouched.
    expect(await vaultBalance(creator.publicKey)).toBe(earnedSol);

    expect(await (await deliverWebhook([claimed])).json()).toEqual({ launched: 0, traded: 0, claimed: 1, graduated: 0, airdropped: 0 });
    expect(await claims(creator.publicKey)).toEqual([
      { signature: claimed, quote: usdcQuote, amount: earnedUsdc.toString(), time: expect.any(String) },
    ]);
    expect((await fees(creator.publicKey)).assets[1]).toMatchObject({ claimable: "0", claimed: earnedUsdc.toString() });

    // The docs recipe with the USDC mint works the same way.
    const again = await trade(trader, prepared.mint, "buy", usdc(10));
    await deliverWebhook([again.signature]);
    const docsClaim = await sendAndConfirmTransaction(connection(), new Transaction().add(claimFollowingTheDocs(creator.publicKey, USDC)), [creator], {
      commitment: "confirmed",
    });
    expect(await tokenBalance(getAssociatedTokenAddressSync(USDC, creator.publicKey))).toBe(earnedUsdc + BigInt(again.quote.fees.creator));
    expect(await (await deliverWebhook([docsClaim])).json()).toEqual({ launched: 0, traded: 0, claimed: 1, graduated: 0, airdropped: 0 });
    expect((await claims(creator.publicKey)).map((c) => [c.signature, c.amount])).toEqual([
      [docsClaim, again.quote.fees.creator],
      [claimed, earnedUsdc.toString()],
    ]);
  });
});

/** Launches a coin with a Creator Fee on someone else's LaunchLab platform and trades it, filling the same vault. */
async function tradeOnAnotherPlatform(creator: Keypair, sol: number) {
  const program = new PublicKey(env().platform.launchlab);
  const admin = await fundedWallet(20);
  const platform = launchlabPdas(program).platformConfig(admin.publicKey);
  const conn = connection();
  await sendAndConfirmTransaction(conn, new Transaction().add(
    createPlatformConfigIx(program, admin.publicKey, {
      feeRate: new BN(10_000), creatorFeeRate: new BN(5_000), name: "Someone else", web: "", img: "",
      operationsWallet: admin.publicKey, cpswapConfig: CPSWAP_CONFIG,
    }),
    createCurveRuleIx(program, admin.publicKey, platform, SOL_GLOBAL_CONFIG),
  ), [admin], { commitment: "confirmed" });
  const mint = Keypair.generate();
  await sendAndConfirmTransaction(conn, new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    initializeV2Ix({
      program, payer: creator.publicKey, creator: creator.publicKey, globalConfig: SOL_GLOBAL_CONFIG, platformConfig: platform,
      baseMint: mint.publicKey, quoteMint: NATIVE_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID,
      name: "Elsewhere", symbol: "ELSE", uri: "https://example.invalid/else.json", graduationTargetRaw: new BN(30_000_000_000),
    }),
  ), [creator, mint], { commitment: "confirmed" });
  const curve = (await loadCurve(conn, launchlabPdas(program).pool(mint.publicKey, NATIVE_MINT)))!;
  const trader = await fundedWallet();
  const p = await buildTrade(conn, {
    program, curve, trader: trader.publicKey, side: "buy", amountIn: new BN(SOL(sol).toString()), minAmountOut: new BN(0),
  });
  return { signature: await signAndSend(p, trader) };
}
