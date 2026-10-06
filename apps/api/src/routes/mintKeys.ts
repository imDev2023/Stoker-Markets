// Operator: mint keys chosen for a Creator's next launch, the Platform Token's ground vanity address (#75). The secret
// goes in once and is never answered; the list says which keys a draft has taken.
import { Hono } from "hono";
import { PublicKey } from "@solana/web3.js";
import { StoreChosenMintKey, type ChosenMintKeys } from "@launchpad/contract";
import type { AppEnv } from "../env";
import { ChosenMintKeyError, deleteChosenMintKey, listChosenMintKeys, storeChosenMintKey } from "../mintKeys";

export const operatorMintKeyRoutes = new Hono<AppEnv>();

operatorMintKeyRoutes.get("/mint-keys", async (c) => {
  const res: ChosenMintKeys = { keys: await listChosenMintKeys(c.get("db")) };
  return c.json(res);
});

operatorMintKeyRoutes.post("/mint-keys", async (c) => {
  const body = StoreChosenMintKey.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "invalid mint key", details: body.error.issues }, 400);
  try {
    const res: ChosenMintKeys = { keys: await storeChosenMintKey(c.get("db"), c.get("cfg"), body.data.creator, Uint8Array.from(body.data.secretKey)) };
    return c.json(res);
  } catch (e) {
    if (e instanceof ChosenMintKeyError) return c.json({ error: e.message }, 409);
    throw e;
  }
});

operatorMintKeyRoutes.delete("/mint-keys/:mint", async (c) => {
  let mint: string;
  try {
    mint = new PublicKey(c.req.param("mint")).toBase58();
  } catch {
    return c.json({ error: "invalid mint address" }, 400);
  }
  try {
    const res: ChosenMintKeys = { keys: await deleteChosenMintKey(c.get("db"), mint) };
    return c.json(res);
  } catch (e) {
    if (e instanceof ChosenMintKeyError) return c.json({ error: e.message }, 409);
    throw e;
  }
});
