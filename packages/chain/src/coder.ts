import { BorshCoder, type Idl } from "@coral-xyz/anchor";
import launchlabIdl from "../idl/launchlab.json" with { type: "json" };

/** Anchor coder for LaunchLab. The devnet and mainnet programs share this layout (the mainnet IDL only adds `collect_excess_lamports`). */
export const launchlabCoder = new BorshCoder(launchlabIdl as Idl);
