# Every coin's metadata lives on Arweave, signed at prepare time and uploaded once the launch lands

Status: accepted by the owner on 2026-10-03 (#44), implemented on the local chain against a stand-in for ArDrive Turbo.
Amends the runbook's section 8, which had left Arweave optional.

A coin's on-chain metadata URI is written at launch and can never change (LaunchLab holds the update authority).
StonkFun promises permanent metadata on Arweave, and the owner decided to match it (#41) before the first mainnet launch, since a launched coin keeps its URI for good.

## The decision

- Every coin's image and metadata JSON are ANS-104 data items on Arweave, posted through ArDrive Turbo and paid in SOL from the operations wallet.
  Never Irys, which retires its Arweave endpoints on 2026-11-01.
- The API talks to Turbo's HTTP API itself (`packages/arweave`): sign an item, post it, read a price and a balance, credit a SOL transfer.
  The SDK runs in a Worker too (`spike/turbo-workers`), but weighs 1.2 MB gzipped for four calls.
- Both items are signed with the operations key when the launch is prepared, so the launch transaction carries the Arweave address: an item's id is the hash of its signature, known before any upload.
  The signed bytes wait in R2.
  A retry of the prepare rebuilds the same draft and the same ids, so it can never change the address or sign a second pair.
- They are uploaded only once the Indexer has seen the launch land: right after indexing, and by the Metadata Upload job every minute for anything that attempt missed.
  An abandoned launch is never uploaded and costs nothing.
- The on-chain URI is `ARWEAVE_GATEWAY_URL/<id>`, `https://arweave.net` on mainnet.
  Our own `/metadata/<mint>.json` serves the same document from Postgres, with the image on Arweave as well, and R2 serves the image under our domain for the site: a cache and a fallback, never the on-chain address.

## Paying

- Turbo charges credits (winc) per byte, and items of up to about 105 KiB are free.
  Every metadata JSON is free; most images are paid.
- When an upload is refused for want of credits, the job sends `ARWEAVE_TOP_UP_LAMPORTS` (0.05 SOL) from the operations wallet to Turbo's deposit address, read live from its `/v1/info`, and has Turbo credit it once finalized.
  At Turbo's prices on 2026-10-03 one SOL pays for about 1,360 MiB, so a top-up covers about 34 launches with the largest image allowed (2 MB).
  Never two top-ups in flight: a transfer Turbo has not credited yet makes the run wait.
- Every top-up is on the Ledger as `arweave_top_up` (SOL from the operations wallet to Turbo), and every paid item as `metadata_upload` against the launch transaction, in lamports at the SOL price Turbo quoted when it was uploaded.
  Free items write nothing.
  The Fee Collector's float pays for top-ups; they are an operating cost, not revenue, and no budget counts them.

## Consequences

- Turbo holds every item by its id and charges nothing for one it already holds, so a run that dies between posting and writing uploads nothing twice; the next run posts the same bytes again for free.
- A wallet or explorer reads the document from `arweave.net`, which serves a fresh item only once Turbo has bundled it onto Arweave (minutes); `turbo-gateway.com` serves it at once.
  Our site never waits: it reads the image from R2 and the fields from Postgres.
- The operations wallet's secret key now also signs data items; the key custody of ADR 0004 is unchanged, and the items it signs are public documents.
- Local development and tests run against the stand-in in `tools/stack` (`pnpm stand-ins`), which plays the upload service, the payment service and the gateway on one port and sells credits for SOL sent on the local chain.
