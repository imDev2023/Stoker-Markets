"""Count Raydium LaunchLab pools per platform config (and graduations) across all of mainnet."""
import base64, collections, json, os, sys, time, urllib.request
from pathlib import Path

PROGRAM = "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj"
POOL_DISC = bytes([247, 237, 227, 245, 215, 195, 222, 70])
PLATFORM_DISC = None  # PlatformConfig names are read separately
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


def main():
    pools = collections.Counter(); graduated = collections.Counter()
    key = None; pages = 0
    while True:
        cfg = {"encoding": "base64", "limit": 10000, "dataSlice": {"offset": 17, "length": 188},
               "filters": [{"memcmp": {"offset": 0, "bytes": b58(POOL_DISC)}}]}
        if key:
            cfg["paginationKey"] = key
        res = rpc("getProgramAccountsV2", [PROGRAM, cfg])
        for a in res["accounts"]:
            d = base64.b64decode(a["account"]["data"][0])
            platform = b58(d[156:188])  # offset 173 - 17
            pools[platform] += 1
            if d[0] != 0:  # status: 0 trading, 1 migrating, 2 migrated
                graduated[platform] += 1
        pages += 1
        key = res.get("paginationKey")
        print(f"page {pages}: {sum(pools.values())} pools", flush=True)
        if not key:
            break

    # Names of each platform config (name is a fixed 64-byte field; read printable prefix)
    top = [p for p, _ in pools.most_common(60)]
    names = {}
    for i in range(0, len(top), 100):
        infos = rpc("getMultipleAccounts", [top[i:i + 100], {"encoding": "base64"}])["value"]
        for p, info in zip(top[i:i + 100], infos):
            raw = base64.b64decode(info["data"][0]) if info else b""
            import re
            m = re.findall(rb"[\x20-\x7e]{3,}", raw)
            names[p] = m[0].decode() if m else "?"
    rows = [{"platform_config": p, "name": names.get(p, ""), "pools": n, "graduated": graduated[p]}
            for p, n in pools.most_common()]
    (OUT / "launchlab_platforms.json").write_text(json.dumps(rows, indent=1))
    print("total pools", sum(pools.values()), "platform configs with pools", len(pools))


if __name__ == "__main__":
    main()
