import type { Metadata } from "next";
import Link from "next/link";
import { getPlatform } from "@/lib/api";
import { CopyButton } from "@/components/CopyButton";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Claim your Creator Fee without this website",
  description: "Build the LaunchLab claim_creator_fee instruction yourself, with any Solana library.",
};

const WSOL = "So11111111111111111111111111111111111111112";

/** The accounts of `claim_creator_fee`, in order, as Raydium's published LaunchLab IDL lists them. */
const ACCOUNTS: [name: string, what: string, signer: boolean, writable: boolean][] = [
  ["creator", "Your wallet, the Creator. It signs and pays the network fee.", true, true],
  ["fee_vault_authority", "The LaunchLab address with seed \"creator_fee_vault_auth_seed\".", false, false],
  ["creator_fee_vault", "Your vault: the LaunchLab address with seeds [your wallet, Quote Asset mint].", false, true],
  ["recipient_token_account", "Your associated token account for the Quote Asset. LaunchLab opens it if needed.", false, true],
  ["quote_mint", "The Quote Asset's mint.", false, false],
  ["token_program", "The token program of the Quote Asset: SPL Token, or Token-2022 for a Token-2022 mint.", false, false],
  ["system_program", "11111111111111111111111111111111", false, false],
  ["associated_token_program", "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", false, false],
];

function example(program: string) {
  return `import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_MINT, TOKEN_PROGRAM_ID,
  createCloseAccountInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const LAUNCHLAB = new PublicKey("${program}");
const connection = new Connection("<your RPC URL>", "confirmed");
const creator = Keypair.fromSecretKey(/* your Creator wallet */);
const quoteMint = NATIVE_MINT; // the Quote Asset: SOL here

const pda = (...seeds: Buffer[]) =>
  PublicKey.findProgramAddressSync(seeds, LAUNCHLAB)[0];
const account = (pubkey: PublicKey, isSigner = false, isWritable = false) =>
  ({ pubkey, isSigner, isWritable });
const recipient = getAssociatedTokenAddressSync(quoteMint, creator.publicKey);

const claim = new TransactionInstruction({
  programId: LAUNCHLAB,
  data: Buffer.from([26, 97, 138, 203, 132, 171, 141, 252]),
  keys: [
    account(creator.publicKey, true, true),
    account(pda(Buffer.from("creator_fee_vault_auth_seed"))),
    account(pda(creator.publicKey.toBuffer(), quoteMint.toBuffer()), false, true),
    account(recipient, false, true),
    account(quoteMint),
    account(TOKEN_PROGRAM_ID),
    account(SystemProgram.programId),
    account(ASSOCIATED_TOKEN_PROGRAM_ID),
  ],
});
// SOL only: turn the wrapped SOL the claim paid back into SOL.
// This closes your wrapped-SOL account and unwraps all of it.
const unwrap = createCloseAccountInstruction(
  recipient, creator.publicKey, creator.publicKey);

const signature = await sendAndConfirmTransaction(
  connection, new Transaction().add(claim, unwrap), [creator]);
console.log("Claimed:", signature);
`;
}

export default async function ClaimDocsPage() {
  const platform = await getPlatform();
  const program = platform.launchlabProgram;
  const cluster = platform.cluster === "mainnet" ? "Solana mainnet" : platform.cluster === "devnet" ? "Solana devnet" : "this cluster";

  return (
    <article className="shell">
      <div className={styles.doc}>
        <p className={styles.kicker}>Creator Fee</p>
        <h1 className={styles.title}>Claim your Creator Fee without this website</h1>
        <p className={styles.lede}>
          Your Creator Fee is held by Raydium LaunchLab, not by us. It collects in a vault that belongs to your wallet, and
          LaunchLab pays it out when your wallet signs a claim. If this website or our API is ever down, you can build that
          claim yourself with any Solana library. Everything you need is on this page, so keep a copy.
        </p>

        <section className={styles.section} aria-labelledby="what">
          <h2 id="what">What you need</h2>
          <ul className={styles.list}>
            <li>The wallet you launched your coins with. Only it can claim, because your vault&apos;s address is derived from it.</li>
            <li>The mint of the Quote Asset your coins trade against. For SOL it is <code>{WSOL}</code>.</li>
            <li>Any Solana RPC endpoint.</li>
          </ul>
          <p>
            One vault holds your Creator Fee for every coin you launched against the same Quote Asset, on any LaunchLab
            launchpad, so one claim collects all of it.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="program">
          <h2 id="program">The program</h2>
          <p>Raydium LaunchLab on {cluster}:</p>
          <p className={styles.address}>
            <code>{program}</code>
            <CopyButton value={program} label="Copy the LaunchLab program address" />
          </p>
          <p>
            The instruction is <code>claim_creator_fee</code>. It takes no arguments, so its data is only its 8-byte
            discriminator: <code>26, 97, 138, 203, 132, 171, 141, 252</code> (hex <code>1a618acb84ab8dfc</code>).
          </p>
        </section>

        <section className={styles.section} aria-labelledby="accounts">
          <h2 id="accounts">Its accounts, in order</h2>
          <ol className={styles.accounts}>
            {ACCOUNTS.map(([name, what, signer, writable]) => (
              <li key={name}>
                <div className={styles.accountHead}>
                  <code>{name}</code>
                  <span className={styles.flags}>
                    {signer && <span className={styles.flag}>signer</span>}
                    {writable && <span className={styles.flag}>writable</span>}
                  </span>
                </div>
                <p>{what}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.section} aria-labelledby="example">
          <h2 id="example">A complete example</h2>
          <p>
            In TypeScript with <code>@solana/web3.js</code> and <code>@solana/spl-token</code>. Any other language or
            library works the same way.
          </p>
          <div className={styles.code}>
            <CopyButton value={example(program)} label="Copy the example" />
            {/* Unwrapped lines scroll sideways on a phone, so the code keeps its shape. */}
            <pre tabIndex={0} aria-label="Example code">{example(program)}</pre>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="after">
          <h2 id="after">After the claim</h2>
          <ul className={styles.list}>
            <li>
              LaunchLab pays SOL as wrapped SOL into your wrapped-SOL account. The example unwraps it in the same
              transaction; leave out that step if you would rather keep wrapped SOL.
            </li>
            <li>Your vault&apos;s balance is zero, and it fills up again as your coins trade.</li>
            <li>A claim with nothing in the vault fails, and nothing moves.</li>
            <li>
              The chain pays the Creator Fee only until graduation. The rest of what a Creator earns, on the curve and
              after graduation, is sent to the Creator&apos;s wallet by the platform and needs no claim.
            </li>
          </ul>
          <p>
            <Link href="/creator">See your Creator Fee and claim it here</Link>
          </p>
        </section>
      </div>
    </article>
  );
}
