"""Check which quote mints pump.fun's bonding curve accepts, and estimate how many coins use each one.

Layouts come from pump.fun's public IDL (github.com/pump-fun/pump-public-docs, idl/pump.json):
  Global (PDA "global", borsh, fixed-size fields): initial_virtual_quote_reserves @1005,
    whitelisted_quote_mints [pubkey; 1] @1013
  QuoteControl (PDA "quote-control"): admin @8, 64 reserved bytes, then
    vec<{mint: pubkey, initial_virtual_quote_reserves: u64}> (u32 length @104, entries from @108, 40 bytes each)
  BondingCurve: complete (bool) @48, quote_mint @83 (Pubkey::default() for SOL-paired coins; older, shorter
    accounts predate the field and are SOL-paired)

Counting every pump.fun curve per quote mint needs a full scan of about 23M accounts, and a memcmp filter on
quote_mint still walks the whole key range per mint, so this samples instead: it reads SAMPLE_PAGES pages of
getProgramAccountsV2 starting at random points in the pubkey space.
Each page covers a known slice of the key range, so pool counts scale up by 1 / (covered fraction).
The whitelist and quote-control entries are read exactly, from their PDAs.

Usage: HELIUS_API_KEY=... python3 pumpfun_quote_check.py
Writes pumpfun_quote_mix.json next to this file.
"""
import base64, collections, hashlib, json, random, time
from pathlib import Path

from meteora_dbc_scan import ALPH, STABLES, WSOL, assets, b58, rpc

PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
CURVE_DISC = bytes([23, 183, 248, 55, 96, 216, 172, 96])
SAMPLE_PAGES = 40
SEED = 4663
OUT = Path(__file__).resolve().parent
P = 2 ** 255 - 19
D = -121665 * pow(121666, P - 2, P) % P


def unb58(s):
    n = 0
    for c in s:
        n = n * 58 + ALPH.index(c)
    return n


def on_curve(b):
    """True if 32 bytes decode to an ed25519 point (PDAs must not)."""
    y = int.from_bytes(b, "little") & ((1 << 255) - 1)
    if y >= P:
        return False
    x2 = (y * y - 1) * pow(D * y * y + 1, P - 2, P) % P
    return x2 == 0 or pow(x2, (P - 1) // 2, P) == 1


def pda(seed):
    prog = unb58(PROGRAM).to_bytes(32, "big")
    for bump in range(255, -1, -1):
        h = hashlib.sha256(seed + bytes([bump]) + prog + b"ProgramDerivedAddress").digest()
        if not on_curve(h):
            return b58(h)


def account(addr):
    return base64.b64decode(rpc("getAccountInfo", [addr, {"encoding": "base64"}])["value"]["data"][0])


def main():
    g_addr, qc_addr = pda(b"global"), pda(b"quote-control")
    g = account(g_addr)
    whitelisted = [b58(g[o:o + 32]) for o in range(1013, 1045, 32) if any(g[o:o + 32])]
    qc = account(qc_addr)
    controls = [(b58(qc[o:o + 32]), int.from_bytes(qc[o + 32:o + 40], "little"))
                for o in (108 + i * 40 for i in range(int.from_bytes(qc[104:108], "little")))]

    # Sample the curve key space.
    rng = random.Random(SEED); covered = 0.0; sampled = 0
    by_quote = collections.Counter(); complete = collections.Counter(); samples = collections.defaultdict(list)
    for _ in range(SAMPLE_PAGES):
        start = rng.getrandbits(256)
        res = rpc("getProgramAccountsV2", [PROGRAM, {
            "encoding": "base64", "limit": 10000, "paginationKey": b58(start.to_bytes(32, "big")),
            "dataSlice": {"offset": 48, "length": 67},
            "filters": [{"memcmp": {"offset": 0, "bytes": b58(CURVE_DISC)}}]}])
        end = res.get("paginationKey")
        if not end or not res["accounts"]:
            continue
        covered += (unb58(end) - start) / 2 ** 256
        for a in res["accounts"]:
            d = base64.b64decode(a["account"]["data"][0]); sampled += 1
            q = b58(d[35:67]) if len(d) >= 67 and any(d[35:67]) else WSOL  # quote_mint @83 - 48
            by_quote[q] += 1; complete[q] += d[0] == 1
            if q != WSOL and len(samples[q]) < 3:
                samples[q].append(a["pubkey"])
        print(f"sampled {sampled} curves, covered {covered:.5f} of key space", flush=True)
        time.sleep(0.3)

    mints = list(dict.fromkeys(whitelisted + [m for m, _ in controls] + list(by_quote)))
    meta = assets([m for m in mints if m != WSOL])
    admitted = {**{m: "Global.whitelisted_quote_mints" for m in whitelisted},
                **{m: "QuoteControl" for m, _ in controls if m not in whitelisted}}
    scale = 1 / covered
    rows = []
    for m in mints:
        sym = "SOL" if m == WSOL else STABLES.get(m) or meta.get(m, {}).get("symbol", "")
        rows.append({"quote_mint": m, "symbol": sym, "name": meta.get(m, {}).get("name", ""),
                     "token_program": meta.get(m, {}).get("token_program", ""),
                     "admitted_by": "native SOL" if m == WSOL else admitted.get(m, "not listed now"),
                     "sampled_curves": by_quote[m], "sampled_complete": complete[m],
                     "estimated_curves": round(by_quote[m] * scale), "sample_bonding_curves": samples[m]})
    rows.sort(key=lambda r: -r["sampled_curves"])
    non_sol = sum(v for q, v in by_quote.items() if q != WSOL)
    asset = sum(v for q, v in by_quote.items() if q != WSOL and q not in STABLES)
    out = {"snapshot": time.strftime("%Y-%m-%d"), "program": PROGRAM, "global": g_addr, "quote_control": qc_addr,
           "whitelisted_quote_mints": whitelisted, "quote_control_mints": len(controls),
           "sample": {"pages": SAMPLE_PAGES, "seed": SEED, "curves": sampled, "key_space_covered": round(covered, 6),
                      "estimated_total_curves": round(sampled * scale),
                      "non_sol_share": round(non_sol / sampled, 6), "asset_paired_share": round(asset / sampled, 6),
                      "estimated_asset_paired_curves": round(asset * scale)},
           "quote_mints": rows,
           "quote_control_entries": [{"mint": m, "initial_virtual_quote_reserves": v} for m, v in controls]}
    (OUT / "pumpfun_quote_mix.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out["sample"], indent=1))


if __name__ == "__main__":
    main()
