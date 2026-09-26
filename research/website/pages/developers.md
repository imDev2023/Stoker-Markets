StonkFun

$STONKRewardsFlywheelRevenueAPI

SearchCtrl KLaunch tokenConnect walletConnect

# Developer API

Read market data and launch tokens over plain HTTP. There is no API key and nothing to sign up for: a launch is authorised by your own wallet's signature on the fee payment, which is stronger proof than any key we could issue. So we don't issue one.

Non-custodial throughout. We never ask for, accept or store a private key; you sign the launch fee locally, and no endpoint will sign on your behalf or make the platform wallet sign anything you supply.

Base URL /api/public/v1

## Quickstart#

Every endpoint is open behind a per-minute rate limit per IP address. Start from a terminal:

terminalCopy

```
# No key, no signup, no plan. Just call it.
curl https://www.stonkfun.xyz/api/public/v1/tokens?sort=newest

# Launching is the same — what authorises it is your own
# signature on the launch fee, not a token we hand you.
curl https://www.stonkfun.xyz/api/public/v1/pairs?launchable=true
```

## Building it yourself#

The two calls above hand you a transaction we built. You can skip them entirely and construct the launch yourself against Raydium's LaunchLab program — your own mint keypair, your own instructions, your own bundle — and still get everything this platform does around a launch. Two reads are all you need from us: GET /pairs for a pair, and GET /launchlab/pricing for the numbers that go in the create instruction.

What ties the two together is the platform id you bake into the pool. It is what the LaunchLab program charges the 1% curve fee to, and it is what we scan for: every minute we read the pools attributed to our platforms and adopt the ones we do not already have a record of. An adopted launch is indistinguishable from an API-created one — token page, chart, volume, fee ledger, holder rewards — and the pool's own creator account is who gets paid, so a standard launch forwards its creator share to your wallet without you registering anything.

### Sizing: one number, and it is not the SDK's

totalFundRaisingB is a RAW amount in the quote token's decimals, and Raydium's own constant is 85 SOL written in lamports. Pass it through on an 8-decimal xStock and you have asked for a 850-unit raise; on a 6-decimal stablecoin, 85,000. Both launch happily and graduate at a market cap nobody intended. raise.raw from the pricing call is the integer to use — sized so your launch opens and graduates where one launched here would — and curve.derived carries the virtual reserves the program will compute from it, so you can check your opening price before signing rather than after landing. It is priced at request time; re-fetch if you have been sitting on the response.

### What we adopt, exactly

Attribution is necessary but not sufficient: a pool carrying our platform id is adopted only if it matches the launch our own builder would have produced. Everything in this list comes straight out of the pricing response, so matching it is a matter of not substituting your own values:

- the GlobalConfig from curve.configId, and a constant-product curve migrating to cpmm;

- supply and totalSellA as given — they fix the open-to-graduation run — with a positive totalFundRaisingB;

- a base mint created by initialize_with_token2022 at 6 decimals, which every LaunchLab launch is;

- no transfer-fee extension at all for a standard launch, or a rate from modes.reward.transferFeeBps for a reward one — the extension IS the mode, and it is read off the mint rather than claimed;

- the platform id that matches that mode: platform.standard for an untaxed mint, platform.reward for a taxed one;

- the platform's curve-rule account — curveRule.standard / curveRule.reward from pricing — appended as the LAST account of the initialize, read-only. Ignored until the platform enforces its launch shape on-chain; once it does, an initialize without it is refused outright (6018) and one outside this list is refused too (6025).

Miss any of them and nothing bad happens on chain — the pool exists and trades on Raydium — but this platform never records it, which for a standard launch means no fee forwarding, and for a taxed one means the warning below.

### A taxed mint you get wrong taxes holders for nobody

On a reward launch the program assigns our platform's withhold authority (modes.reward.withdrawWithheldAuthority) to the mint at creation. Holders are taxed on every transfer from the first trade, and only that wallet can ever withdraw what is withheld. If the launch is adopted we collect it and pay it out to holders on the reward cycle. If it is not — wrong curve, wrong config, an unpublished tax rate — the tax accrues and is never distributed to anyone. Land a standard launch first, confirm it appears in GET /tokens with launchpad: "launchlab", and only then build a taxed one.

The whole thing, end to end:

build.mjsCopy

```
import {
  ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction,
} from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  getPdaLaunchpadAuth, getPdaLaunchpadPoolId, getPdaLaunchpadVaultId, initializeWithToken2022,
} from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';

const API = 'https://www.stonkfun.xyz/api/public/v1';
const QUOTE = 'YOUR_QUOTE_MINT';   // a mint from /pairs
const TAX_BPS = 100;               // reward launch: an offered tier. 0 = standard, no tax.
const connection = new Connection(pickRpcUrl());
const creator = Keypair.fromSecretKey(/* your own wallet, never sent anywhere */);

const get = async (path) => (await (await fetch(API + path)).json()).data;

// 1. The pair must be launchable here AND carry a LaunchLab config on chain.
const { pairs } = await get('/pairs?launchable=true&launchLabReady=true');
const pair = pairs.find((item) => item.mint === QUOTE);
if (!pair) throw new Error('Not launchable against that quote right now');

// 2. Size the curve. raise.raw is a raw amount in the quote's decimals. The SDK's 85-SOL
//    constant would mean 850 units on an 8-decimal xStock and 85,000 on a 6-decimal stablecoin.
const pricing = await get(`/launchlab/pricing?quoteMint=${QUOTE}`);
if (TAX_BPS && !pricing.modes.reward.transferFeeBps.includes(TAX_BPS)) {
  throw new Error('That tax rate is not one this platform publishes');
}

// 3. Build the create. The platform id attributes the pool to us; pick it by mode.
const programId = new PublicKey(pricing.curve.programId);
const platformId = new PublicKey(TAX_BPS ? pricing.platform.reward : pricing.platform.standard);
const quoteMint = new PublicKey(QUOTE);
const mintKeypair = Keypair.generate();
const mint = mintKeypair.publicKey;
const { publicKey: poolId } = getPdaLaunchpadPoolId(programId, mint, quoteMint);

const instruction = initializeWithToken2022(
  programId,
  creator.publicKey,                       // payer
  creator.publicKey,                       // creator: the wallet fees are forwarded to
  new PublicKey(pricing.curve.configId),
  platformId,
  getPdaLaunchpadAuth(programId).publicKey,
  poolId,
  mint,
  quoteMint,
  getPdaLaunchpadVaultId(programId, poolId, mint).publicKey,
  getPdaLaunchpadVaultId(programId, poolId, quoteMint).publicKey,
  pricing.curve.baseDecimals,
  'My Token', 'MYTKN', 'https://example.com/metadata.json',
  {
    type: 'ConstantCurve',
    supply: new BN(pricing.curve.supply),
    totalSellA: new BN(pricing.curve.totalSellA),
    totalFundRaisingB: new BN(pricing.raise.raw),   // must come from the pricing response
    migrateType: 'cpmm',
  },
  new BN(0), new BN(0), new BN(0),         // no vesting
  pricing.curve.cpmmCreatorFeeOn,
  // Reward mode only. Both keys must match the Raydium SDK's declaration exactly, as written
  // here. The SDK ignores keys it does not recognise and then writes a zero-rate transfer-fee
  // extension, which looks taxed but collects nothing.
  TAX_BPS ? { transferFeeBasePoints: TAX_BPS, maxinumFee: new BN('1000000000000000') } : undefined
);

// The SDK hardcodes classic SPL in the quote-token-program slot. Every xStock is Token-2022,
// so that account must be substituted or the program is handed the wrong token program.
if (pair.tokenProgram === TOKEN_2022_PROGRAM_ID.toBase58()) {
  if (!instruction.keys[11].pubkey.equals(TOKEN_PROGRAM_ID)) throw new Error('layout changed');
  instruction.keys[11] = { ...instruction.keys[11], pubkey: TOKEN_2022_PROGRAM_ID };
}

// Append the platform's curve-rule account last, read-only, matching your platform id. While
// enforcement is off the program ignores it. Once enforcement is on, an initialize without it
// fails with error 6018 and one outside the published shape fails with 6025.
instruction.keys.push({
  pubkey: new PublicKey(TAX_BPS ? pricing.curveRule.reward : pricing.curveRule.standard),
  isSigner: false,
  isWritable: false,
});

// 4. Sign with both the creator and the new mint, then send it yourself.
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
const tx = new Transaction()
  .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }))
  .add(instruction);
Object.assign(tx, { recentBlockhash: blockhash, lastValidBlockHeight, feePayer: creator.publicKey });
tx.sign(creator, mintKeypair);
console.log('sent:', await connection.sendRawTransaction(tx.serialize()));

// 5. There is nothing else to call. Within a minute or two the pool is adopted. Once the venue
//    is public, GET /tokens/${mint} answers with launchpad "launchlab".
```

Two details in there are worth repeating, because both fail silently. The transfer-fee parameters take the exact names the Raydium SDK declares — transferFeeBasePoints and maxinumFee — and a key that does not match is simply ignored, leaving an extension with a zero rate: a mint that looks like a reward coin and taxes nobody. The SDK also supplies the classic SPL program in the quote-token-program account, so a Token-2022 quote (every xStock) needs that key substituted before you sign.

You pay only what Solana charges — rent, fees, and any priority fee you add. There is no launch fee on this path and nothing to submit to us afterwards: no paymentSignature exists to poll, so watch GET /tokens/{mint} instead. A dev buy is yours to arrange too — append a buy_exact_in to the same transaction and it fills against a pool nobody has touched.

## Claiming fees#

A fee coin accrues creator fees, a share of every trading fee — about half on the default 1% pool, about three quarters on the 2% tier — on a locked position until they are claimed. The token page has a button for it; this is the same thing for a script, so you can claim across many tokens on a schedule instead of clicking through them one at a time.

Three calls. GET /tokens/{mint}/fees tells you what is waiting and needs no wallet at all; POST /tokens/{mint}/fees/claim/prepare returns an unsigned claim transaction; you sign it and hand it to POST /tokens/{mint}/fees/claim/submit. Fees arrive in both tokens of the pair — your token and the one it trades against — and land directly in your own token accounts.

### Only your signature can claim your fees

The claim transaction is only valid when signed by the wallet holding that launch's Fee Key NFT, and it pays that wallet's own accounts. Preparing a claim is therefore not a privileged action and needs no credential: for a token you do not own it returns a transaction you cannot make valid, which would pay someone else if you could. No platform key signs any part of it, and submit relays only the exact transaction prepare issued — its instructions are checked against what we built before anything is broadcast.

The whole thing, end to end:

claim.mjsCopy

```
import { Keypair, Transaction } from '@solana/web3.js';
import fs from 'node:fs';

const API = 'https://www.stonkfun.xyz/api/public/v1';
const mint = 'YOUR_TOKEN_MINT';
const creator = Keypair.fromSecretKey(            // the wallet holding the Fee Key NFT
  Uint8Array.from(JSON.parse(fs.readFileSync('creator.json', 'utf8')))
);

const headers = { 'Content-Type': 'application/json' };
const call = async (path, init) => {
  const response = await fetch(API + path, init);
  const body = await response.json();
  if (!response.ok) throw new Error(`${body.error.code}: ${body.error.message}`);
  return body.data;
};

// 1. What is waiting? A plain read — no wallet involved.
const { claimable } = await call(`/tokens/${mint}/fees`);
if (!claimable) throw new Error('Nothing claimable on this launch');
console.log('Waiting:', claimable.quote.amountTokens, claimable.quote.symbol);

// 2. Prepare. Returns an UNSIGNED claim transaction, valid for 90 seconds.
const wallet = creator.publicKey.toBase58();
const prepared = await call(`/tokens/${mint}/fees/claim/prepare`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ creatorWallet: wallet }),
});

// 3. Sign locally. Your key never leaves this process, and this transaction can only ever
//    pay you: sign it as-is, since altering the instructions invalidates the claim.
const tx = Transaction.from(Buffer.from(prepared.transaction, 'base64'));
tx.sign(creator);

// 4. Submit. The fees land straight in your own token accounts.
const claimed = await call(`/tokens/${mint}/fees/claim/submit`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    creatorWallet: wallet,
    intentId: prepared.intentId,
    signedTransaction: tx.serialize().toString('base64'),
  }),
});

console.log('Claimed:', claimed.signature);
```

A prepared claim expires after 90 seconds, because the transaction carries a live blockhash. Expiring costs you nothing — prepare again; the fees are still sitting on the position. Retrying a submit that timed out is safe too: an intentId that already went through answers with its original signature and alreadySubmitted: true rather than claiming a second time. Reward coins and pump launches have no creator position at all, so they answer 403, and 409 means there is simply nothing to claim yet.

### LaunchLab launches don't work like this

Everything above describes a launch with a locked Raydium position and a Fee Key NFT. A LaunchLab launch has neither, and its creator is paid a different way: the platform collects the pool's 1% fee and forwards the creator's share to their wallet automatically. There is nothing to sign and nothing to poll — GET /tokens/{mint}/fees says so in its reason, and a reward launch distributes the mint's transfer tax to holders and has no creator fees at all, so both claim calls answer 403.

One exception, and it is worth knowing before you write a loop over a portfolio: launches created before the platform's fee shape was unified accrue into an on-chain vault keyed by creator and quote token — not by launch. When the read reports one, it carries scope: "creator-quote-vault", the amount is quote-side only, and claiming it from any one of that creator's launches against that quote sweeps the balance for all of them. Claim once per quote token, not once per mint.

## Rate limits#

Every response carries X-RateLimit-Remaining and X-RateLimit-Reset. A 429 adds Retry-After; honour it.

EndpointsPer minuteWhy

Everything except the two prepares300Reads, both submits, status

POST /launches/prepare25Launch quotes

POST /tokens/{mint}/fees/claim/prepare20Claim quotes

Limits are per IP address and per minute, and that table is the whole story: there are no paid tiers above it. Read responses are CDN-cached, and a cache hit never reaches our servers, so it costs you nothing against these numbers. Building something that needs more headroom? Get in touch.

## Endpoint reference#

OpenAPI spec →

DataLaunchFees

GET/api/public/v1/tokens

Every token with a live platform pool, with market data. Works without a key at a lower rate limit. V3 reward tokens additionally carry transferFee.bps (a Token-2022 transfer tax paid to holders — use the Token-2022 program for their accounts) and, while in the buyback rankings, flywheel.active.

qstring·Search name, symbol or mint.

sort'marketCap' | 'newest' | 'volume'·Defaults to marketCap.

mode'standard' | 'reward'·Filter by fee model.

status'new' | 'aboutToGraduate' | 'graduated'·Filter by graduation status.

quoteMintstring·Filter by paired token.

categorystring·Filter by pair category, e.g. xstock.

pageinteger·Defaults to 1.

pageSizeinteger·1-100, defaults to 25.

GET/api/public/v1/tokens/{mint}

Live market data plus the launch record, when the platform launched it. V3 reward tokens carry the same optional transferFee and flywheel fields as /tokens.

mint*string·Token mint address.

GET/api/public/v1/tokens/{mint}/burns

Totals and recent burns of this token by the platform fee sweep.

mint*string·Token mint address.

limitinteger·1-100, defaults to 25.

GET/api/public/v1/tokens/{mint}/rewards

Distribution totals for a reward coin. Standard launches answer with mode "standard" and a null rewards object. Amounts under "rewards" are quote-token amounts; the separate "base" object carries what the launch paid holders in its OWN token, and is null when that has never happened.

mint*string·Token mint address.

GET/api/public/v1/tokens/{mint}/airdrop

The airdrop a token launched with, if any: what share of supply was carved out of the pool, how many wallets received it, and where those wallets came from. Reads the frozen snapshot taken at quote time, so it is the drop that was actually paid for rather than a live balance scan. A token that launched without one answers airdrop: null, which is not an error — most tokens have no airdrop.

mint*string·Token mint address.

GET/api/public/v1/tokens/{mint}/backing

USD permanently locked behind a pump-launched token, summed from the platform’s own locked positions. Pump launches only: every other launch — Raydium CLMM and LaunchLab alike — answers 400 invalid_request rather than a zero, since backing is not a thing those have. Check launchpad from /tokens/{mint} before calling.

mint*string·Token mint address.

GET/api/public/v1/launches

The launch ledger, newest first. Filter by creator to find your own. Launches built directly against the venue appear here too, once adopted, under launchpad "launchlab" — no payment of ours exists for those, so they are read here or from /tokens/{mint} rather than by polling a payment signature.

creatorstring·Filter by creator wallet.

mode'standard' | 'reward'·Filter by fee model.

sinceISO 8601·Only launches at or after this time.

pageinteger·Defaults to 1.

pageSizeinteger·1-100, defaults to 25.

GET/api/public/v1/pairs

Quote tokens a new launch can be paired against. Call this first — quoteMint must be one of these. Two different gates apply and both are reported: `launchable` is this platform’s own rule (retired categories and mints are false), while `launchLabReady` says whether Raydium has created the on-chain GlobalConfig a LaunchLab launch needs. A pair can be launchable but not yet LaunchLab-ready; constructing a launch against one of those fails on-chain. `launchLabReady` is absent rather than false when the venue is off or the probe could not run.

categorystring·Filter by category.

launchableboolean·Set true to exclude retired categories.

launchLabReadyboolean·Set true to return only pairs with a live LaunchLab config on-chain.

GET/api/public/v1/rewards

Lifetime payout totals per reward coin plus recent distribution transactions. "launches" and "recentDistributions" are quote-token amounts only; rewards paid in a launch's own token appear in "baseDistributions" and "recentBaseDistributions". In those two, "decimals" and the token amount are null together when the launch record cannot be resolved — read the raw amount instead of scaling it yourself.

limitinteger·1-100, defaults to 25.

GET/api/public/v1/revenue

Fee revenue, buybacks and burns.

limitinteger·1-100, defaults to 25.

GET/api/public/v1/revenue/history

Whole daily history in one response, keyed by UTC day, in USD. dailyRevenue is quote-token fees claimed to the treasury valued at claim time, and sums to the "Total revenue" figure on the /revenue page; dailyHoldersRevenue is the share spent buying the platform token back and burning it; dailyProtocolRevenue is the remainder. Fees earned by creator and reward-holder positions are claimed directly from Raydium and are not included. A coverage block reports ledger rows that carry no USD price and therefore count as zero. No date parameter by design — fetch once and index locally.

GET/api/public/v1/stats

Aggregate totals plus the thresholds and switches a client needs, so your UI tracks the platform instead of hardcoding it. config.paidLaunchesEnabled and config.launchLabEnabled together say which launch path is live: the two-call /launches flow, the transaction you build yourself, or both. Read them before offering a launch button.

### GET /api/public/total-assetsno key

One more, outside the versioned base path: a flat index of every token this platform has launched, built for exchanges, aggregators and explorers. It carries asset identity only — mint, name, symbol, decimals, logo — and no market data, so it is cheap to poll on a schedule. Predates v1 and is unversioned; it is not going anywhere. Use GET /tokens above when you want prices, market caps and volume.

## Errors#

Every failure returns { error: { code, message } }. Branch on code, which is stable; messages are for humans and may be reworded.

CodeHTTPMeaning

invalid_request400A parameter is missing or malformed.

forbidden403The action is refused outright.

not_found404No such resource.

method_not_allowed405Wrong HTTP method for this path.

conflict409Well-formed, but the moment is wrong. For a launch, the payment landed and needs manual recovery — never retry or re-pay. For a fee claim, nothing is claimable yet or the prepared claim expired, and preparing again is the fix.

rate_limited429Per-minute limit exceeded. Honour Retry-After.

internal500Something broke on our side. Safe to retry.

service_unavailable503A dependency or feature is temporarily unavailable.

Spotted something wrong or unclear on this page? Tell us on X and we'll fix it.

On this page

- Quickstart

- Building it yourself

- Claiming fees

- Rate limits

- Endpoint reference

- Errors

X$STONKRevenueAPIRewardsFlywheelTerms of ServicePrivacy Policy
