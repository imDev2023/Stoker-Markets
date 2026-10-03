# Spike: ArDrive Turbo from the API Worker (#44)

Run on 2026-10-03 against `@ardrive/turbo-sdk` 2.1.0 and wrangler 4.142.0, with the `nodejs_compat` flag and the compatibility date the API uses (2026-09-20).
Nothing here is distributed; the throwaway Worker lived in a scratch folder.

## Question 1: does the SDK run in a Worker?

Yes, with one catch.

| Step | Result |
|---|---|
| `import { TurboFactory } from "@ardrive/turbo-sdk/web"` bundled by wrangler | Fails until the peer dependency `x402-fetch` is installed: the SDK's HTTP client imports it lazily and esbuild wants it resolvable |
| `TurboFactory.authenticated({ privateKey: bs58(secretKey), token: "solana" })` | Constructs |
| `signer.signDataItem(...)` with tags and a fixed anchor | Signs; returns the item as a `ReadableStream` with its size |
| `getUploadCosts`, `getFiatRates`, `getBalance` against the production services | Answer |
| `uploadFile` against the sandbox (`upload.services.ar-io.dev`) | Uploads; the receipt carries the id and `winc: "0"` |
| Bundle (`wrangler deploy --dry-run`) | 5.7 MB of script, 1.19 MB gzipped: `ethers`, `viem`, `axios`, `arweave` and the SDK's CLI libraries all come along |

So the SDK is a workable fallback.
It is not what the API uses.

## What the API uses instead

The whole exchange with Turbo is four HTTP calls and one file format, so `packages/arweave` implements them directly (about 250 lines, no new runtime dependency beyond `@noble/curves`, which web3.js already brings):

- ANS-104 data items signed with ed25519 (signature type 2): the deep hash with WebCrypto's SHA-384, Avro-encoded tags, and the id, which is the SHA-256 of the signature.
  The id is known at signing time, so the launch transaction can carry the Arweave address before anything is uploaded.
- `POST {upload}/v1/tx/solana` with the raw item; `GET {payment}/v1/account/balance/solana?address=`; `GET {payment}/v1/price/bytes/:n` and `/v1/price/solana/:lamports`; `GET {payment}/v1/info` for the SOL deposit address; `POST {payment}/v1/account/balance/solana` with `{ tx_id }` to credit a SOL transfer.

Checked against Turbo's sandbox with our implementation (`verify.ts` in this folder):

- The same key, anchor, tags and data sign to the same bytes and id, and a flipped data byte fails verification.
- The sandbox accepted the item under exactly the id we computed, served it at `https://ar-io.dev/<id>` right away, and answered a second upload of the same item with the same id and `winc: "0"`: a retry costs nothing.
- Prices on 2026-10-03: 1 MiB costs about 13.1e9 winc and 1 SOL buys about 17.9e12 winc after Turbo's fee, so a SOL pays for roughly 1,360 MiB, or 680 launches with the largest image allowed (2 MB).
- Items of up to 107,520 bytes (the whole item, header included) are free, within a 10 MiB lifetime allowance per wallet and per IP (`GET {upload}/v1/info`).
  Every metadata JSON is free; most images are paid.

## What this decides for #44

- Sign both items (image, metadata JSON) at prepare time with the operations key and keep the signed bytes in R2; upload them only once the launch is indexed.
  An abandoned launch never reaches Turbo.
- Pay by topping the operations wallet's credits up with SOL when an upload is refused with 402, in `ARWEAVE_TOP_UP_LAMPORTS` steps; the transfer is a plain `SystemProgram.transfer` to the address `/v1/info` names, credited once finalized.
- The on-chain URI is `ARWEAVE_GATEWAY_URL/<id>` (`https://arweave.net` on mainnet).
  `arweave.net` serves a fresh item only once Turbo has bundled it onto Arweave (minutes); `turbo-gateway.com` serves it at once.
  Our own `/metadata/<mint>.json` keeps serving the same document meanwhile, from Postgres and R2.

## Open questions for the operator, answered

- A separate upload Worker or Node job is not needed; nothing waits until after launch.
- The operations wallet pays top-ups from its float: `ARWEAVE_TOP_UP_LAMPORTS` is 0.05 SOL by default, worth about 34 launches with the largest image, and the Fee Collector's float (1 SOL) covers many of them.
  No extra starting balance beyond the runbook's is needed.
