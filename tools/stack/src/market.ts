// A stand-in for Jupiter's Price API v3 and Tokens API v2, for local development: answers the two calls the API's
// Quote Registry makes (`/price/v3?ids=` and `/tokens/v2/search?query=`) from the mainnet snapshot in
// tools/localnet/fixtures/mainnet/market.json, in Jupiter's own shapes, so the development chain's hundreds of Quote
// Assets are priced, tagged and given their logos as mainnet's are, through the same code path mainnet uses.
import { createServer } from "node:http";
import { mainnetMarketSnapshot, type MarketSnapshot } from "@launchpad/localnet";

export type MarketStandIn = { url: string; takenAt: string; stop: () => Promise<void> };

export async function startMarketStandIn(opts: { port: number; snapshot?: MarketSnapshot }): Promise<MarketStandIn> {
  const snapshot = opts.snapshot ?? mainnetMarketSnapshot();
  const url = `http://127.0.0.1:${opts.port}`;
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", url);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "GET") return json(405, { error: "method not allowed" });
    if (u.pathname === "/price/v3") {
      const ids = (u.searchParams.get("ids") ?? "").split(",").filter(Boolean);
      // Jupiter answers every id it can price and leaves the rest out, never a null.
      return json(200, Object.fromEntries(ids.flatMap((id) => (snapshot.prices[id] ? [[id, snapshot.prices[id]]] : []))));
    }
    if (u.pathname === "/tokens/v2/search") {
      const ids = (u.searchParams.get("query") ?? "").split(",").filter(Boolean);
      return json(200, ids.flatMap((id) => {
        const t = snapshot.tokens[id];
        return t ? [{ id, ...t }] : [];
      }));
    }
    return json(404, { error: `no such endpoint: ${u.pathname}` });
  });
  await new Promise<void>((resolve) => server.listen(opts.port, "127.0.0.1", resolve));
  return {
    url,
    takenAt: snapshot.takenAt,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
