// List CPMM AmmConfig accounts on a cluster (devnet by default) to pick the cpswap_config for our PlatformConfig.
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { DEV, cpmmCoder, plain, DEVNET_RPC } from "./common";
const conn = new Connection(process.argv[2] ?? DEVNET_RPC);
const pid = new PublicKey(process.argv[3] ?? DEV.CPMM.toBase58());
const accs = await conn.getProgramAccounts(pid, { filters: [{ memcmp: { offset: 0, bytes: bs58.encode(Buffer.from("daf42168cbcb2b6f", "hex")) } }] });
const rows = accs.map((a) => {
  const d = a.account.data;
  // AmmConfig layout: disc8 bump1 disable_create_pool1 index2 trade_fee_rate8 protocol_fee_rate8 fund_fee_rate8 create_pool_fee8 protocol_owner32 fund_owner32 creator_fee_rate8
  return { address: a.pubkey.toBase58(), index: d.readUInt16LE(10), disableCreatePool: d[9], tradeFeeRate: d.readBigUInt64LE(12).toString(), protocolFeeRate: d.readBigUInt64LE(20).toString(), fundFeeRate: d.readBigUInt64LE(28).toString(), createPoolFee: d.readBigUInt64LE(36).toString(), creatorFeeRate: d.readBigUInt64LE(108).toString(), len: d.length };
}).sort((a, b) => a.index - b.index);
console.log(JSON.stringify(rows));
