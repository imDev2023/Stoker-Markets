"""Count Meteora Dynamic Bonding Curve (DBC) pools per config and per quote mint across all of mainnet.

Tests whether any DBC platform (Believe, Bags, Jupiter Studio, others) runs "asset-paired" launches,
that is, bonding curves quoted in something other than SOL or a plain stablecoin.

Layouts come from Meteora's public IDL (MeteoraAg/dynamic-bonding-curve-sdk,
packages/dynamic-bonding-curve/src/idl/dynamic-bonding-curve/idl.json, program version 0.2.1).
All accounts are zero-copy (bytemuck, repr C), so offsets are fixed:

  VirtualPool / TransferHookPool (PoolState): config @72, creator @104, base_mint @136,
    quote_reserve (u64) @240, is_migrated (u8) @305, migration_progress (u8) @308
  PoolConfig (and ConfigWithTransferHook, which embeds PoolConfig at the same offset):
    quote_mint @8, fee_claimer @40, leftover_receiver @72
  PartnerMetadata (borsh): fee_claimer @8, then 96 bytes padding, then name, website, logo strings
  TokenBadge: token_mint @8

Usage: HELIUS_API_KEY=... python3 meteora_dbc_scan.py
Writes meteora_dbc_configs.json and meteora_dbc_quote_mix.json next to this file.
"""
import base64, collections, json, os, re, sys, time, urllib.request
from pathlib import Path

PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN"
DISC = {
    "VirtualPool": bytes([213, 224, 5, 209, 98, 69, 119, 92]),
    "TransferHookPool": bytes([237, 219, 184, 23, 42, 189, 169, 35]),
    "PoolConfig": bytes([26, 108, 14, 123, 116, 230, 129, 43]),
    "ConfigWithTransferHook": bytes([40, 220, 194, 251, 41, 199, 123, 253]),
    "PartnerMetadata": bytes([68, 68, 130, 19, 16, 209, 98, 156]),
    "TokenBadge": bytes([116, 219, 204, 229, 249, 116, 255, 150]),
}
POOL_SLICE = (72, 237)  # config .. migration_progress inclusive
CONFIG_SLICE = (8, 96)  # quote_mint, fee_claimer, leftover_receiver

WSOL = "So11111111111111111111111111111111111111112"
# Plain USD stablecoins seen as quote mints (mint -> symbol); anything else is classed by symbol below.
STABLES = {
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
    "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB": "USD1",
    "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD",
    "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH": "USDG",
    "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA": "USDS",
    "9zNQRsGLjNKwCUU5Gq5LR8beUCPzQMVMqKAi3SSZh54u": "FDUSD",
    "DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT": "USDe",
    "USDH1SM1ojwWUga67PGrgFWUHibbjqMvuMaDkRJTgkX": "USDH",
    "CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH": "CASH",
    "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr": "EURC",
}
STABLE_SYMBOL = re.compile(r"^(USD|US\$|EUR)|USD$", re.I)
OUT = Path(__file__).resolve().parent
ALPH = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58(b):
    n = int.from_bytes(b, "big"); s = ""
    while n:
        n, r = divmod(n, 58); s = ALPH[r] + s
    return "1" * (len(b) - len(b.lstrip(b"\0"))) + s


def rpc(method, params):
    url = f"https://mainnet.helius-rpc.com/?api-key={os.environ['HELIUS_API_KEY']}"
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, body, {"Content-Type": "application/json"})
            r = json.load(urllib.request.urlopen(req, timeout=180))
            if "error" in r:
                raise RuntimeError(r["error"])
            return r["result"]
        except Exception as e:  # noqa: BLE001 - transient RPC failures are retried
            print("retry", attempt, str(e)[:200], file=sys.stderr, flush=True)
            time.sleep(2 ** attempt)
    raise RuntimeError("rpc failed")


def scan(kind, data_slice=None):
    """Yield (pubkey, bytes) for every account of one type, 10,000 per page."""
    key = None; pages = 0; n = 0
    while True:
        cfg = {"encoding": "base64", "limit": 10000,
               "filters": [{"memcmp": {"offset": 0, "bytes": b58(DISC[kind])}}]}
        if data_slice:
            cfg["dataSlice"] = {"offset": data_slice[0], "length": data_slice[1]}
        if key:
            cfg["paginationKey"] = key
        res = rpc("getProgramAccountsV2", [PROGRAM, cfg])
        for a in res["accounts"]:
            n += 1
            yield a["pubkey"], base64.b64decode(a["account"]["data"][0])
        pages += 1; key = res.get("paginationKey")
        if pages % 10 == 0 or not key:
            print(f"{kind} page {pages}: {n} accounts", flush=True)
        if not key:
            return


def borsh_strings(d, off, count):
    out = []
    for _ in range(count):
        ln = int.from_bytes(d[off:off + 4], "little"); off += 4
        out.append(d[off:off + ln].decode("utf-8", "replace")); off += ln
    return out


def assets(mints):
    meta = {}
    for i in range(0, len(mints), 1000):
        for a in rpc("getAssetBatch", {"ids": mints[i:i + 1000]}) or []:
            if not a:
                continue
            md = (a.get("content") or {}).get("metadata") or {}
            ti = a.get("token_info") or {}
            meta[a["id"]] = {"symbol": (md.get("symbol") or ti.get("symbol") or "").strip(),
                             "name": (md.get("name") or "").strip(),
                             "token_program": ti.get("token_program", "")}
    return meta


def classify(mint, symbol):
    if mint == WSOL:
        return "SOL"
    if mint in STABLES or STABLE_SYMBOL.search(symbol or ""):
        return "stablecoin"
    if mint.startswith("Xs") and symbol.endswith("x"):
        return "tokenized stock (xStocks)"
    return "other token"


def main():
    pools = collections.Counter(); complete = collections.Counter(); migrated = collections.Counter()
    samples = collections.defaultdict(list)
    for kind in ("VirtualPool", "TransferHookPool"):
        for _, d in scan(kind, POOL_SLICE):
            cfg = b58(d[0:32])  # 72 - 72
            pools[cfg] += 1
            if d[236] >= 1:  # migration_progress (308 - 72): 0 pre-curve, 1 post-curve, 2 locked vesting, 3 created pool
                complete[cfg] += 1
            if d[233]:  # is_migrated (305 - 72)
                migrated[cfg] += 1
            if len(samples[cfg]) < 3:
                samples[cfg].append(b58(d[64:96]))  # base_mint (136 - 72)
    total = sum(pools.values())
    print("total pools", total, "configs with pools", len(pools), flush=True)

    configs = {}
    for kind in ("PoolConfig", "ConfigWithTransferHook"):
        for pk, d in scan(kind, CONFIG_SLICE):
            configs[pk] = {"quote_mint": b58(d[0:32]), "fee_claimer": b58(d[32:64]),
                           "leftover_receiver": b58(d[64:96]), "transfer_hook_config": kind != "PoolConfig"}
    partners = {}
    for pk, d in scan("PartnerMetadata"):
        name, website, _ = borsh_strings(d, 8 + 32 + 96, 3)
        partners[b58(d[8:40])] = {"name": name, "website": website}
    badges = {b58(d[0:32]) for _, d in scan("TokenBadge", (8, 32))}

    missing = [c for c in pools if c not in configs]
    if missing:
        print("configs not found (closed?)", len(missing), file=sys.stderr)

    by_quote = collections.Counter(); q_configs = collections.defaultdict(set)
    q_complete = collections.Counter(); q_migrated = collections.Counter()
    for c, n in pools.items():
        q = configs.get(c, {}).get("quote_mint", "unknown")
        by_quote[q] += n; q_configs[q].add(c); q_complete[q] += complete[c]; q_migrated[q] += migrated[c]
    meta = assets([q for q in by_quote if q != "unknown"])

    quote_rows = []
    for q, n in by_quote.most_common():
        m = meta.get(q, {})
        sym = STABLES.get(q) or ("SOL" if q == WSOL else m.get("symbol", ""))
        quote_rows.append({"quote_mint": q, "symbol": sym, "name": m.get("name", ""),
                           "class": classify(q, sym), "token_program": m.get("token_program", ""),
                           "token_badge": q in badges, "pools": n, "share": round(n / total, 6),
                           "configs": len(q_configs[q]), "curve_complete": q_complete[q],
                           "migrated": q_migrated[q]})
    by_class = collections.Counter(); class_complete = collections.Counter()
    for r in quote_rows:
        by_class[r["class"]] += r["pools"]; class_complete[r["class"]] += r["curve_complete"]

    quote_by_mint = {r["quote_mint"]: r for r in quote_rows}
    config_rows = []
    for c, n in pools.most_common():
        info = configs.get(c, {})
        q = info.get("quote_mint", "unknown")
        qm = quote_by_mint.get(q, {})
        p = partners.get(info.get("fee_claimer"), {})
        config_rows.append({"config": c, "pools": n, "curve_complete": complete[c], "migrated": migrated[c],
                            "quote_mint": q, "quote_symbol": qm.get("symbol", ""), "quote_class": qm.get("class", ""),
                            "fee_claimer": info.get("fee_claimer", ""),
                            "leftover_receiver": info.get("leftover_receiver", ""),
                            "partner_metadata_name": p.get("name", ""), "partner_metadata_website": p.get("website", ""),
                            "sample_base_mints": samples[c]})

    # Per-fee-claimer rollup: one platform usually runs many configs under one fee claimer.
    fc = collections.defaultdict(lambda: {"pools": 0, "configs": 0, "quotes": collections.Counter()})
    for r in config_rows:
        f = fc[r["fee_claimer"]]; f["pools"] += r["pools"]; f["configs"] += 1; f["quotes"][r["quote_mint"]] += r["pools"]
    sym = {r["quote_mint"]: r["symbol"] or r["quote_mint"][:6] for r in quote_rows}
    cls = {r["quote_mint"]: r["class"] for r in quote_rows}
    claimers = []
    for k, f in sorted(fc.items(), key=lambda kv: -kv[1]["pools"])[:40]:
        non = sum(v for q, v in f["quotes"].items() if cls.get(q) not in ("SOL", "stablecoin"))
        claimers.append({"fee_claimer": k, "partner_metadata_name": partners.get(k, {}).get("name", ""),
                         "partner_metadata_website": partners.get(k, {}).get("website", ""),
                         "pools": f["pools"], "configs": f["configs"], "distinct_quotes": len(f["quotes"]),
                         "non_sol_non_stable_pools": non,
                         "top_quotes": [(sym.get(q, q), v) for q, v in f["quotes"].most_common(5)]})

    summary = {"snapshot": time.strftime("%Y-%m-%d"), "program": PROGRAM, "total_pools": total,
               "configs_with_pools": len(pools), "configs_total": len(configs), "partner_metadata_accounts": len(partners),
               "token_badges": len(badges), "distinct_quote_mints": len(by_quote),
               "pools_by_class": dict(by_class), "curve_complete_by_class": dict(class_complete),
               "share_by_class": {k: round(v / total, 6) for k, v in by_class.items()},
               "curve_complete_total": sum(complete.values()), "migrated_total": sum(migrated.values())}
    (OUT / "meteora_dbc_quote_mix.json").write_text(json.dumps(
        {"summary": summary, "quote_mints": quote_rows, "top_fee_claimers": claimers}, indent=1))
    (OUT / "meteora_dbc_configs.json").write_text(json.dumps(config_rows, indent=1))
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
