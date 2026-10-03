// The mainnet scripts (tools/mainnet, runbook sections 2 and 3), proven against the local chain: the PlatformConfig
// creation transaction built unsigned for the cold admin key lands and decodes as the runbook's check expects, and the
// Platform Lookup Table is created and then extended from a list of quote mints with the operations keypair.
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { launchlabPdas, platformLookupAddresses, WSOL_MINT } from "@launchpad/chain";
import { CPSWAP_CONFIG, LOCAL_QUOTES } from "@launchpad/localnet";
import {
  buildPlatformConfigTransaction, checkPlatformConfig, decodePlatformConfig, DEFAULT_CREATOR_FEE_BPS, DEFAULT_PLATFORM_FEE_BPS,
  signAndSendPlatformConfig, type PlatformConfigArgs,
} from "@launchpad/mainnet/platform-config";
import { ensurePlatformLookupTable, platformLookupTableAddresses } from "@launchpad/mainnet/lookup-table";
import { connection, env, fundedWallet } from "./client";

describe("tools/mainnet/platform-config", () => {
  it("builds the creation transaction unsigned for the admin, which lands and decodes as expected", async () => {
    // A fresh cold key stands in for the owner's: the stack's own PlatformConfig is left alone.
    const admin = await fundedWallet(1);
    const operations = Keypair.generate().publicKey;
    const args: PlatformConfigArgs = {
      cluster: "localnet", admin: admin.publicKey, operations, cpswapConfig: CPSWAP_CONFIG,
      name: "Launchpad (rehearsal)", web: "https://example.invalid", img: "https://example.invalid/icon.png", platformFeeBps: DEFAULT_PLATFORM_FEE_BPS, creatorFeeBps: DEFAULT_CREATOR_FEE_BPS,
    };
    expect(await decodePlatformConfig(connection(), "localnet", admin.publicKey)).toBeNull();
    const built = await buildPlatformConfigTransaction(connection(), args);
    expect(built.platformConfig.toBase58()).toBe(launchlabPdas(new PublicKey(env().platform.launchlab)).platformConfig(admin.publicKey).toBase58());

    // Unsigned, the admin as fee payer, the four instructions of bootstrapPlatform: what the cold device signs.
    const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
    expect(tx.feePayer!.toBase58()).toBe(admin.publicKey.toBase58());
    expect(tx.signatures.every((s) => s.signature === null)).toBe(true);
    expect(tx.instructions).toHaveLength(4);
    expect(tx.instructions.every((ix) => ix.programId.toBase58() === env().platform.launchlab)).toBe(true);

    await signAndSendPlatformConfig(connection(), built.transaction, built.lastValidBlockHeight, admin);
    const view = (await decodePlatformConfig(connection(), "localnet", admin.publicKey))!;
    expect(view).toMatchObject({
      address: built.platformConfig.toBase58(), platformFeeBps: 75, creatorFeeBps: 25, feeRate: 7500, creatorFeeRate: 2500,
      name: args.name, web: args.web, img: args.img, feeWallet: operations.toBase58(), nftWallet: operations.toBase58(),
      transferFeeExtensionAuth: operations.toBase58(), vestingWallet: operations.toBase58(), platformCpCreator: operations.toBase58(),
      curveRuleManager: operations.toBase58(), restrictCurveParam: true, cpswapConfig: CPSWAP_CONFIG.toBase58(),
      migrateNftInfo: { platformScale: 1_000_000, creatorScale: 0, burnScale: 0 }, platformVestingScale: 0,
    });
    expect(checkPlatformConfig(view, args)).toEqual([]);
    // The check names every field that differs from what was decided.
    expect(checkPlatformConfig(view, { ...args, platformFeeBps: 100, operations: Keypair.generate().publicKey })).toEqual(
      expect.arrayContaining([expect.stringMatching(/^fee_rate is 7500, expected 10000$/), expect.stringMatching(/^fee_wallet is /), expect.stringMatching(/^curve_rule_manager is /)]),
    );
  });

  it("decodes the platform's own PlatformConfig as bootstrapPlatform created it", async () => {
    const view = (await decodePlatformConfig(connection(), "localnet", new PublicKey(env().platform.admin)))!;
    expect(view).toMatchObject({ address: env().platform.platformConfig, platformFeeBps: 75, creatorFeeBps: 25, curveRuleManager: env().platform.operationsWallet, restrictCurveParam: true });
    expect(checkPlatformConfig(view, {
      operations: new PublicKey(env().platform.operationsWallet), cpswapConfig: CPSWAP_CONFIG, name: view.name, web: view.web, img: view.img, platformFeeBps: DEFAULT_PLATFORM_FEE_BPS, creatorFeeBps: DEFAULT_CREATOR_FEE_BPS,
    })).toEqual([]);
  });
});

describe("tools/mainnet/lookup-table", () => {
  it("creates the Platform Lookup Table from a list of quote mints, SOL always included, and extends it later", async () => {
    // A fresh operations keypair, so the stack's own table is left alone; the admin is the platform's.
    const operations = await fundedWallet(1);
    const admin = new PublicKey(env().platform.admin);
    const program = new PublicKey(env().platform.launchlab);
    const pdas = launchlabPdas(program);
    const expected = (mints: PublicKey[]) =>
      platformLookupAddresses(program, pdas.platformConfig(admin), [WSOL_MINT, ...mints].map((quoteMint) => ({ quoteMint, globalConfig: pdas.globalConfig(quoteMint) })));

    // 11 shared accounts plus 4 per Quote Asset: SOL and USDC make 19.
    const first = await ensurePlatformLookupTable(connection(), "localnet", operations, admin, [LOCAL_QUOTES.USDC]);
    expect(first.addresses).toBe(19);
    const created = (await connection().getAddressLookupTable(first.table, { commitment: "confirmed" })).value!;
    expect(created.state.authority!.toBase58()).toBe(operations.publicKey.toBase58());
    expect(created.state.addresses.map((a) => a.toBase58())).toEqual(expected([LOCAL_QUOTES.USDC]).map((a) => a.toBase58()));

    // Listing another Quote Asset extends the same table with its four accounts; nothing already there is added twice.
    const second = await ensurePlatformLookupTable(connection(), "localnet", operations, admin, [LOCAL_QUOTES.USDC, LOCAL_QUOTES.JTO]);
    expect(second.table.toBase58()).toBe(first.table.toBase58());
    expect(second.addresses).toBe(23);
    const extended = (await connection().getAddressLookupTable(second.table, { commitment: "confirmed" })).value!;
    expect(new Set(extended.state.addresses.map((a) => a.toBase58())).size).toBe(23);
    for (const a of expected([LOCAL_QUOTES.USDC, LOCAL_QUOTES.JTO])) expect(extended.state.addresses.map((k) => k.toBase58())).toContain(a.toBase58());
  });

  it("refuses more Quote Assets than a table holds", () => {
    // 11 shared accounts and 4 per Quote Asset: SOL and 60 others fill 255 of the 256 slots; one more does not fit.
    const many = Array.from({ length: 61 }, () => Keypair.generate().publicKey);
    expect(() => platformLookupTableAddresses("mainnet", Keypair.generate().publicKey, many)).toThrow(/a lookup table holds 256/);
    expect(platformLookupTableAddresses("mainnet", Keypair.generate().publicKey, many.slice(0, 60))).toHaveLength(11 + 4 * 61);
  });
});
