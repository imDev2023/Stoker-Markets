"""Pull StonkFun's public API in full, staying under the published 300 req/min per-IP limit."""
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://www.stonkfun.xyz/api"
OUT = Path(__file__).resolve().parent.parent / "website" / "api" / "bulk"
MIN_INTERVAL = 60 / 240  # 240 req/min, headroom under 300


def get(url, _last=[0.0]):
    for attempt in range(8):
        wait = MIN_INTERVAL - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request(url, headers={"User-Agent": "research-pull/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(int(e.headers.get("Retry-After", "10")) + 1)
                continue
            if e.code >= 500:
                time.sleep(2 ** attempt)
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 ** attempt)
    raise RuntimeError(f"gave up on {url}")


def pull_paged(name, url_for_page, items_of, has_more):
    out = OUT / f"{name}.jsonl"
    done = OUT / f"{name}.progress"
    page = int(done.read_text()) + 1 if done.exists() else 1
    with out.open("a") as f:
        while True:
            body = get(url_for_page(page))
            items = items_of(body)
            for it in items:
                f.write(json.dumps(it) + "\n")
            done.write_text(str(page))
            if page % 25 == 0:
                print(f"{name}: page {page}", flush=True)
            if not has_more(body, page, len(items)):
                break
            page += 1
    print(f"{name}: finished at page {page}", flush=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    which = sys.argv[1:] or ["assets", "tokens", "launches"]
    if "assets" in which:
        pull_paged(
            "total-assets",
            lambda p: f"{BASE}/public/total-assets?limit=500&offset={(p - 1) * 500}",
            lambda b: b.get("assets", []),
            lambda b, p, n: b.get("pagination", {}).get("hasMore", False),
        )
    # The full /tokens list is ~1,400 uncached pages at ~8 s each; only these slices carry signal.
    token_slices = {
        "tokens-graduated": "status=graduated&sort=marketCap",
        "tokens-top-marketcap": "sort=marketCap",
        "tokens-top-volume": "sort=volume",
    }
    max_pages = {"tokens-graduated": 10_000, "tokens-top-marketcap": 20, "tokens-top-volume": 10}
    for name, query in token_slices.items():
        if "tokens" in which:
            pull_paged(
                name,
                lambda p, q=query: f"{BASE}/public/v1/tokens?{q}&pageSize=100&page={p}",
                lambda b: (b.get("data") or {}).get("tokens", []),
                lambda b, p, n, cap=max_pages[name]: p < min(
                    cap, (b.get("data") or {}).get("pagination", {}).get("totalPages", 0)
                ),
            )
    if "launches" in which:
        pull_paged(
            "launches",
            lambda p: f"{BASE}/public/v1/launches?pageSize=100&page={p}",
            lambda b: (b.get("data") or {}).get("launches", []),
            lambda b, p, n: p < (b.get("data") or {}).get("pagination", {}).get("totalPages", 0),
        )


if __name__ == "__main__":
    main()
