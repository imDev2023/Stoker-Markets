# Cloudflare-first hosting

v1 runs on Cloudflare: the Next.js app on Workers (OpenNext), the API and Helius webhook receiver on Workers, scheduled jobs (fee claims, Reward Rounds, Burn, Flywheel) on Cron Triggers and Queues, Durable Objects for per-round locking, and Postgres reached through Hyperdrive.
We chose one platform over the more conventional Vercel + Fly.io + Postgres split for simpler operations, global latency and low idle cost.

## Consequences

- Every Solana library we depend on must run under Workers' `nodejs_compat`; anything that needs raw sockets or long-lived processes (for example a websocket slot subscriber) is replaced by Helius webhooks or scheduled polling.
- Long jobs (a Reward Round paying thousands of holders) must be chunked through Queues, not run in a single request.
