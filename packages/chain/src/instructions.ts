import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction, type AccountMeta } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { launchlabCoder } from "./coder";
import { launchlabPdas, metadataPda } from "./pda";
import { METADATA_PROGRAM } from "./programs";
import { LAUNCH_SHAPE, type RuleConstraint } from "./shape";

const meta = (pubkey: PublicKey, isSigner = false, isWritable = false): AccountMeta => ({ pubkey, isSigner, isWritable });

export type PlatformSettings = {
  /** Platform Fee, in LaunchLab's 1e6 denominator. */
  feeRate: BN;
  /** Creator Fee, in LaunchLab's 1e6 denominator. */
  creatorFeeRate: BN;
  name: string;
  web: string;
  img: string;
  /** Receives the Platform Fee, the Fee Key NFTs and holds the Token-2022 fee authorities (ADR 0004). */
  operationsWallet: PublicKey;
  /** The CPMM config graduated pools use. */
  cpswapConfig: PublicKey;
};

export function createPlatformConfigIx(program: PublicKey, admin: PublicKey, s: PlatformSettings) {
  const pdas = launchlabPdas(program);
  const data = launchlabCoder.instruction.encode("create_platform_config", {
    platform_params: {
      // All locked-LP Fee Key rights go to the platform (ADR 0001).
      migrate_nft_info: { platform_scale: new BN(1_000_000), creator_scale: new BN(0), burn_scale: new BN(0) },
      fee_rate: s.feeRate,
      name: s.name,
      web: s.web,
      img: s.img,
      creator_fee_rate: s.creatorFeeRate,
      platform_vesting_scale: new BN(0),
    },
  });
  return new TransactionInstruction({
    programId: program,
    data,
    keys: [
      meta(admin, true, true),
      meta(s.operationsWallet), // platform_fee_wallet
      meta(s.operationsWallet), // platform_nft_wallet
      meta(pdas.platformConfig(admin), false, true),
      meta(s.cpswapConfig),
      meta(SystemProgram.programId),
      meta(s.operationsWallet), // transfer_fee_extension_authority
      meta(s.operationsWallet), // platform_vesting_wallet
    ],
  });
}

export type PlatformConfigUpdate =
  | { PlatformCPCreator: [PublicKey] }
  | { RestrictCurveParam: [BN] }
  | { FeeRate: [BN] };

export function updatePlatformConfigIx(program: PublicKey, admin: PublicKey, param: PlatformConfigUpdate) {
  const data = launchlabCoder.instruction.encode("update_platform_config", { param: toAnchorEnum(param) });
  return new TransactionInstruction({
    programId: program,
    data,
    keys: [meta(admin, true), meta(launchlabPdas(program).platformConfig(admin), false, true)],
  });
}

// Anchor's coder wants tuple enum variants as { Variant: { 0: value } }.
function toAnchorEnum(param: PlatformConfigUpdate) {
  const [variant, values] = Object.entries(param)[0] as [string, unknown[]];
  return { [variant]: Object.fromEntries(values.map((v, i) => [String(i), v])) };
}

function curveRuleKeys(program: PublicKey, authority: PublicKey, platformConfig: PublicKey, globalConfig: PublicKey) {
  return [
    meta(authority, true, true),
    meta(platformConfig),
    meta(globalConfig),
    meta(launchlabPdas(program).curveRule(platformConfig, globalConfig), false, true),
    meta(SystemProgram.programId),
  ];
}

export function createCurveRuleIx(program: PublicKey, authority: PublicKey, platformConfig: PublicKey, globalConfig: PublicKey) {
  return new TransactionInstruction({
    programId: program,
    data: launchlabCoder.instruction.encode("create_platform_curve_rule", {}),
    keys: curveRuleKeys(program, authority, platformConfig, globalConfig),
  });
}

export function updateCurveRuleIx(
  program: PublicKey, authority: PublicKey, platformConfig: PublicKey, globalConfig: PublicKey, groupId: number, constraints: RuleConstraint[],
) {
  return new TransactionInstruction({
    programId: program,
    data: launchlabCoder.instruction.encode("update_platform_curve_rule", { group_id: groupId, constraints }),
    keys: curveRuleKeys(program, authority, platformConfig, globalConfig),
  });
}

export type InitializeParams = {
  program: PublicKey;
  payer: PublicKey;
  creator: PublicKey;
  globalConfig: PublicKey;
  platformConfig: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  quoteTokenProgram: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  graduationTargetRaw: BN;
};

export type TradeParams = {
  program: PublicKey;
  trader: PublicKey;
  pool: PublicKey;
  globalConfig: PublicKey;
  platformConfig: PublicKey;
  creator: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseTokenProgram: PublicKey;
  quoteTokenProgram: PublicKey;
  traderBaseAccount: PublicKey;
  traderQuoteAccount: PublicKey;
  /** Quote Asset for a buy, coins for a sell. */
  amountIn: BN;
  /** The trade fails on-chain if it would pay out less than this. */
  minAmountOut: BN;
};

/**
 * `buy_exact_in` or `sell_exact_in`. The Platform Fee and Creator Fee vaults go in the remaining accounts; without them the
 * program fails with NotEnoughRemainingAccounts (6018), so the Creator Fee could never accrue anywhere but a vault.
 */
export function tradeExactInIx(side: "buy" | "sell", p: TradeParams) {
  const pdas = launchlabPdas(p.program);
  const data = launchlabCoder.instruction.encode(side === "buy" ? "buy_exact_in" : "sell_exact_in", {
    amount_in: p.amountIn,
    minimum_amount_out: p.minAmountOut,
    share_fee_rate: new BN(0),
  });
  return new TransactionInstruction({
    programId: p.program,
    data,
    keys: [
      meta(p.trader, true, true),
      meta(pdas.authority),
      meta(p.globalConfig),
      meta(p.platformConfig),
      meta(p.pool, false, true),
      meta(p.traderBaseAccount, false, true),
      meta(p.traderQuoteAccount, false, true),
      meta(pdas.vault(p.pool, p.baseMint), false, true),
      meta(pdas.vault(p.pool, p.quoteMint), false, true),
      meta(p.baseMint),
      meta(p.quoteMint),
      meta(p.baseTokenProgram),
      meta(p.quoteTokenProgram),
      meta(pdas.eventAuthority),
      meta(p.program),
      meta(SystemProgram.programId),
      meta(pdas.platformFeeVault(p.platformConfig, p.quoteMint), false, true),
      meta(pdas.creatorFeeVault(p.creator, p.quoteMint), false, true),
    ],
  });
}

/** A standard (SPL) Launch; our curve rule for the Quote Asset is passed as the remaining account the program checks. */
export function initializeV2Ix(p: InitializeParams) {
  const pdas = launchlabPdas(p.program);
  const pool = pdas.pool(p.baseMint, p.quoteMint);
  const data = launchlabCoder.instruction.encode("initialize_v2", {
    base_mint_param: { decimals: LAUNCH_SHAPE.decimals, name: p.name, symbol: p.symbol, uri: p.uri },
    curve_param: {
      Constant: {
        data: {
          supply: LAUNCH_SHAPE.supply,
          total_base_sell: LAUNCH_SHAPE.totalBaseSell,
          total_quote_fund_raising: p.graduationTargetRaw,
          migrate_type: LAUNCH_SHAPE.migrateType,
        },
      },
    },
    vesting_param: { total_locked_amount: new BN(0), cliff_period: new BN(0), unlock_period: new BN(0) },
    amm_fee_on: { [LAUNCH_SHAPE.ammFeeOn]: {} },
  });
  return new TransactionInstruction({
    programId: p.program,
    data,
    keys: [
      meta(p.payer, true, true),
      meta(p.creator),
      meta(p.globalConfig),
      meta(p.platformConfig),
      meta(pdas.authority),
      meta(pool, false, true),
      meta(p.baseMint, true, true),
      meta(p.quoteMint),
      meta(pdas.vault(pool, p.baseMint), false, true),
      meta(pdas.vault(pool, p.quoteMint), false, true),
      meta(metadataPda(p.baseMint), false, true),
      meta(TOKEN_PROGRAM_ID),
      meta(p.quoteTokenProgram),
      meta(METADATA_PROGRAM),
      meta(SystemProgram.programId),
      meta(SYSVAR_RENT_PUBKEY),
      meta(pdas.eventAuthority),
      meta(p.program),
      meta(pdas.curveRule(p.platformConfig, p.globalConfig)),
    ],
  });
}
