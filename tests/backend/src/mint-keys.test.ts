// A launch with a mint key the operator chose (#75): the Platform Token's ground vanity address. The operator stores the
// key for a Creator wallet, that wallet's next launch takes the address, a retry keeps it, the launch lands signed by
// it, and the wallet's launch after that derives its address as every other launch does.
import { describe, expect, it } from "vitest";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ChosenMintKeys, PreparedLaunch } from "@launchpad/contract";
import { connection, deliverWebhook, env, fundedWallet, getLaunch, prepare, signAndSend } from "./client";

const api = (path: string, init?: RequestInit) => fetch(`${env().apiUrl}${path}`, init);
const operator = () => ({ authorization: `Bearer ${env().operatorToken}`, "content-type": "application/json" });
const keys = async (res: Response) => {
  expect(res.status).toBe(200);
  return ChosenMintKeys.parse(await res.json()).keys;
};
const store = (creator: Keypair, key: Keypair) =>
  api("/v1/operator/mint-keys", { method: "POST", headers: operator(), body: JSON.stringify({ creator: creator.publicKey.toBase58(), secretKey: Array.from(key.secretKey) }) });

describe("a launch with a chosen mint key", () => {
  it("takes the stored key for the Creator's next launch, keeps it on retry, lands with it, then derives again", async () => {
    const creator = await fundedWallet();
    const chosen = Keypair.generate();
    const mint = chosen.publicKey.toBase58();

    const listed = await keys(await store(creator, chosen));
    expect(listed.find((k) => k.mint === mint)).toMatchObject({ creator: creator.publicKey.toBase58(), drafted: false });
    // The secret never comes back out.
    expect(JSON.stringify(listed)).not.toContain(Array.from(chosen.secretKey).join(","));

    const first = PreparedLaunch.parse(await (await prepare({ creator: creator.publicKey.toBase58(), name: "Platform", symbol: "PLTF" })).json());
    expect(first.mint).toBe(mint);
    expect((await keys(await api("/v1/operator/mint-keys", { headers: operator() }))).find((k) => k.mint === mint)!.drafted).toBe(true);

    // Taken by a draft: the key can't be removed any more, and a retry rebuilds the same address.
    expect((await api(`/v1/operator/mint-keys/${mint}`, { method: "DELETE", headers: operator() })).status).toBe(409);
    const retried = PreparedLaunch.parse(await (await api(`/v1/launches/${mint}/prepare`, { method: "POST" })).json());
    expect(retried.mint).toBe(mint);

    const signature = await signAndSend(retried, creator);
    await deliverWebhook([signature]);
    expect((await getLaunch(mint)).launch?.mint).toBe(mint);

    // The next launch by the same wallet is an ordinary one.
    const next = PreparedLaunch.parse(await (await prepare({ creator: creator.publicKey.toBase58() })).json());
    expect(next.mint).not.toBe(mint);
    expect((await api(`/v1/operator/mint-keys/${mint}`, { method: "DELETE", headers: operator() })).status).toBe(409);
  });

  it("lands when the chosen address already holds SOL (mainnet's Platform Token address holds 0.1 SOL)", async () => {
    const creator = await fundedWallet();
    const chosen = Keypair.generate();
    const mint = chosen.publicKey.toBase58();
    const conn = connection();
    const sig = await conn.requestAirdrop(chosen.publicKey, LAMPORTS_PER_SOL / 10);
    await conn.confirmTransaction({ signature: sig, ...(await conn.getLatestBlockhash("confirmed")) }, "confirmed");
    expect(await conn.getBalance(chosen.publicKey, "confirmed")).toBe(LAMPORTS_PER_SOL / 10);

    await keys(await store(creator, chosen));
    const prepared = PreparedLaunch.parse(await (await prepare({ creator: creator.publicKey.toBase58(), name: "Funded", symbol: "FNDD" })).json());
    expect(prepared.mint).toBe(mint);
    const signature = await signAndSend(prepared, creator);
    await deliverWebhook([signature]);
    expect((await getLaunch(mint)).launch?.mint).toBe(mint);
    // The SOL the address held is still there, now the mint account's.
    expect(await conn.getBalance(chosen.publicKey, "confirmed")).toBeGreaterThanOrEqual(LAMPORTS_PER_SOL / 10);
  });

  it("refuses a key that is not a keypair, one already used here, and removes an untaken one", async () => {
    const creator = await fundedWallet(0.1);
    const bad = await api("/v1/operator/mint-keys", { method: "POST", headers: operator(), body: JSON.stringify({ creator: creator.publicKey.toBase58(), secretKey: Array(64).fill(1) }) });
    expect(bad.status).toBe(409);
    expect(((await bad.json()) as { error: string }).error).toMatch(/not a valid secret key/);

    const spare = Keypair.generate();
    await keys(await store(creator, spare));
    // Stored twice is stored once.
    expect((await keys(await store(creator, spare))).filter((k) => k.mint === spare.publicKey.toBase58())).toHaveLength(1);
    const after = await keys(await api(`/v1/operator/mint-keys/${spare.publicKey.toBase58()}`, { method: "DELETE", headers: operator() }));
    expect(after.find((k) => k.mint === spare.publicKey.toBase58())).toBeUndefined();

    expect((await api("/v1/operator/mint-keys")).status).toBe(401);
  });
});
