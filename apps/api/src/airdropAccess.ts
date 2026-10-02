// Who may launch with an airdrop: only Creator wallets the operator has allowed, kept as one platform setting.
// The list starts empty, so the launch form offers no airdrop until the operator names a wallet.
import { eq } from "drizzle-orm";
import { platformSettings, type Db } from "@launchpad/db";

const AIRDROP_CREATORS_SETTING = "airdrop_creators";

export async function airdropCreators(db: Db): Promise<string[]> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, AIRDROP_CREATORS_SETTING)).limit(1);
  return row ? (JSON.parse(row.value) as string[]) : [];
}

export async function mayAirdrop(db: Db, wallet: string) {
  return (await airdropCreators(db)).includes(wallet);
}

async function save(db: Db, wallets: string[]) {
  const value = JSON.stringify(wallets);
  await db
    .insert(platformSettings)
    .values({ key: AIRDROP_CREATORS_SETTING, value })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
  return wallets;
}

export async function allowAirdropCreator(db: Db, wallet: string) {
  const wallets = await airdropCreators(db);
  return wallets.includes(wallet) ? wallets : save(db, [...wallets, wallet]);
}

export async function disallowAirdropCreator(db: Db, wallet: string) {
  return save(db, (await airdropCreators(db)).filter((w) => w !== wallet));
}
