// Print a CPMM pool's status and open time against the cluster clock.
import { PublicKey } from "@solana/web3.js";
import { conn, loadState } from "./common";
import { cpPoolInfo } from "./cpmm";
const id = new PublicKey(process.argv[2] ?? loadState().migration.cpPool);
const p = await cpPoolInfo(id);
const slot = await conn.getSlot("confirmed");
const now = await conn.getBlockTime(slot);
console.log(JSON.stringify({ pool: id.toBase58(), status: p.status, openTime: p.openTime, clusterTime: now, secondsUntilOpen: Number(p.openTime) - (now ?? 0), lpAmount: p.lpAmount }));
