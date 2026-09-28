import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction, type AccountMeta } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
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

/** Everything `update_platform_config`'s `AllInfo` sets at once: the whole PlatformConfig but its admin-only fields. */
export type PlatformConfigInfo = {
  feeWallet: PublicKey;
  nftWallet: PublicKey;
  migrateNftInfo: { platformScale: BN; creatorScale: BN; burnScale: BN };
  feeRate: BN;
  name: string;
  web: string;
  img: string;
  transferFeeExtensionAuth: PublicKey;
  creatorFeeRate: BN;
  platformVestingScale: BN;
  vestingWallet: PublicKey;
};

export type PlatformConfigUpdate =
  | { PlatformCPCreator: [PublicKey] }
  | { RestrictCurveParam: [BN] }
  | { CurveRuleManager: [PublicKey] }
  | { FeeRate: [BN] }
  | { AllInfo: [PlatformConfigInfo] };

/**
 * `update_platform_config`. `AllInfo` also checks the platform's CPMM config (`cpswap_config`) against a remaining
 * account, so pass the config the PlatformConfig already names (6016 InvalidCpSwapConfig without it).
 */
export function updatePlatformConfigIx(program: PublicKey, admin: PublicKey, param: PlatformConfigUpdate, remaining: PublicKey[] = []) {
  const encoded: PlatformConfigUpdate = "AllInfo" in param ? { AllInfo: [toAnchorInfo(param.AllInfo[0]) as unknown as PlatformConfigInfo] } : param;
  const data = launchlabCoder.instruction.encode("update_platform_config", { param: toAnchorEnum(encoded) });
  return new TransactionInstruction({
    programId: program,
    data,
    keys: [meta(admin, true), meta(launchlabPdas(program).platformConfig(admin), false, true), ...remaining.map((a) => meta(a))],
  });
}

// The IDL's PlatformConfigInfo, field for field in its own snake_case.
function toAnchorInfo(i: PlatformConfigInfo) {
  return {
    fee_wallet: i.feeWallet,
    nft_wallet: i.nftWallet,
    migrate_nft_info: { platform_scale: i.migrateNftInfo.platformScale, creator_scale: i.migrateNftInfo.creatorScale, burn_scale: i.migrateNftInfo.burnScale },
    fee_rate: i.feeRate,
    name: i.name,
    web: i.web,
    img: i.img,
    transfer_fee_extension_auth: i.transferFeeExtensionAuth,
    creator_fee_rate: i.creatorFeeRate,
    platform_vesting_scale: i.platformVestingScale,
    vesting_wallet: i.vestingWallet,
  };
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
  /**
   * A referred trade: the share fee rate (1e6 denominator, at most the GlobalConfig's `max_share_fee_rate`) and the
   * referrer's token account of the Quote Asset, which the program pays the share fee into.
   */
  share?: { rate: BN; receiver: PublicKey } | null;
};

/**
 * `buy_exact_in` or `sell_exact_in`. The Platform Fee and Creator Fee vaults go in the remaining accounts; without them the
 * program fails with NotEnoughRemainingAccounts (6018), so the Creator Fee could never accrue anywhere but a vault. A
 * referred trade names the referrer's account first among them.
 */
export function tradeExactInIx(side: "buy" | "sell", p: TradeParams) {
  const pdas = launchlabPdas(p.program);
  const data = launchlabCoder.instruction.encode(side === "buy" ? "buy_exact_in" : "sell_exact_in", {
    amount_in: p.amountIn,
    minimum_amount_out: p.minAmountOut,
    share_fee_rate: p.share?.rate ?? new BN(0),
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
      ...(p.share ? [meta(p.share.receiver, false, true)] : []),
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

/**
 * A Reward Launch: the coin is a Token-2022 mint with a transfer fee (its Reward Tax) of up to 5% and its metadata in
 * the mint itself. Until migration LaunchLab's own authority holds the fee-config authority, so nobody can change the
 * tax; at migration it passes to the PlatformConfig's `transfer_fee_extension_auth`, our operations wallet, which then
 * gives it up for good (see the API's reward tax lock). The withdraw-withheld authority is ours from the start, so the
 * collected tax can be paid out to holders. The curve rule's Reward Launch group is passed as the remaining account.
 */
export function initializeWithToken2022Ix(p: InitializeParams & { rewardTaxBps: number; maximumFee: BN }) {
  const pdas = launchlabPdas(p.program);
  const pool = pdas.pool(p.baseMint, p.quoteMint);
  const data = launchlabCoder.instruction.encode("initialize_with_token_2022", {
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
    transfer_fee_extension_param: { transfer_fee_basis_points: p.rewardTaxBps, maximum_fee: p.maximumFee },
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
      meta(TOKEN_2022_PROGRAM_ID),
      meta(p.quoteTokenProgram),
      meta(SystemProgram.programId),
      meta(pdas.eventAuthority),
      meta(p.program),
      meta(pdas.curveRule(p.platformConfig, p.globalConfig)),
    ],
  });
}

export type ClaimCreatorFeeParams = {
  program: PublicKey;
  creator: PublicKey;
  quoteMint: PublicKey;
  /** The token program that owns the Quote Asset's mint: SPL Token or Token-2022. */
  quoteTokenProgram: PublicKey;
};

/**
 * `claim_creator_fee`: moves everything in the Creator's Creator Fee vault for one Quote Asset to the Creator's associated
 * token account, which the program opens if needed. The vault is derived from the signing Creator, so nobody else can
 * claim it, and there is no permissionless variant on the curve.
 */
export function claimCreatorFeeIx(p: ClaimCreatorFeeParams) {
  const pdas = launchlabPdas(p.program);
  return new TransactionInstruction({
    programId: p.program,
    data: launchlabCoder.instruction.encode("claim_creator_fee", {}),
    keys: [
      meta(p.creator, true, true),
      meta(pdas.creatorFeeVaultAuthority),
      meta(pdas.creatorFeeVault(p.creator, p.quoteMint), false, true),
      meta(getAssociatedTokenAddressSync(p.quoteMint, p.creator, false, p.quoteTokenProgram), false, true),
      meta(p.quoteMint),
      meta(p.quoteTokenProgram),
      meta(SystemProgram.programId),
      meta(ASSOCIATED_TOKEN_PROGRAM_ID),
    ],
  });
}
