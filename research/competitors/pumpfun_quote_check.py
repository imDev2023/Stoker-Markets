"""Check which quote mints pump.fun's bonding curve accepts and how many coins use each non-SOL quote.

Layouts come from pump.fun's public IDL (github.com/pump-fun/pump-public-docs, idl/pump.json):
  Global (borsh, fixed-size fields): initial_virtual_quote_reserves @1005, whitelisted_quote_mints [pubkey; 1] @1013
  QuoteControl (PDA "quote-control"): admin @8, 64 reserved bytes, then vec<{mint: pubkey, initial_virtual_quote_reserves: u64}> @104
  BondingCurve: complete (bool) @48, quote_mint @83 (Pubkey::default() for SOL-paired coins)

SOL-paired coins are not counted: that needs a scan of every pump.fun curve, and the IDL already settles the question.
Each non-SOL quote mint is counted with a memcmp filter on BondingCurve.quote_mint, so RPC load stays small.

Usage: HELIUS_API_KEY=... python3 pumpfun_quote_check.py
Writes pumpfun_quote_mix.json next to this file.
"""
import base64, json, time
from pathlib import Path

from meteora_dbc_scan import WSOL, assets, b58, rpc

PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
GLOBAL_DISC = bytes([167, 232, 232, 177, 200, 108, 114, 127])
QUOTE_CONTROL_DISC = bytes([56, 244, 35, 238, 193, 213, 162, 201])
CURVE_DISC = bytes([23, 183, 248, 55, 96, 216, 172, 96])
OUT = Path(__file__).resolve().parent


def accounts(disc, data_slice=None, extra=()):
    key = None
    while True:
        cfg = {"encoding": "base64", "limit": 10000,
               "filters": [{"memcmp": {"offset": 0, "bytes": b58(disc)}}, *extra]}
        if data_slice:
            cfg["dataSlice"] = {"offset": data_slice[0], "length": data_slice[1]}
        if key:
            cfg["paginationKey"] = key
        res = rpc("getProgramAccountsV2", [PROGRAM, cfg])
        for a in res["accounts"]:
            yield a["pubkey"], base64.b64decode(a["account"]["data"][0])
        key = res.get("paginationKey")
        if not key:
            return


def main():
    globals_ = list(accounts(GLOBAL_DISC))
    whitelisted = []
    for pk, d in globals_:
        whitelisted += [b58(d[o:o + 32]) for o in range(1013, 1045, 32) if any(d[o:o + 32])]
    controls = []
    for pk, d in accounts(QUOTE_CONTROL_DISC):
        n = int.from_bytes(d[104:108], "little")
        for i in range(n):
            o = 108 + i * 40
            controls.append({"quote_control": pk, "mint": b58(d[o:o + 32]),
                             "initial_virtual_quote_reserves": int.from_bytes(d[o + 32:o + 40], "little")})
    mints = list(dict.fromkeys(whitelisted + [c["mint"] for c in controls]))
    meta = assets(mints)
    rows = []
    for m in mints:
        total = complete = 0; samples = []
        for pk, d in accounts(CURVE_DISC, (48, 1), [{"memcmp": {"offset": 83, "bytes": m}}]):
            total += 1; complete += d[0] == 1
            if len(samples) < 3:
                samples.append(pk)
        rows.append({"quote_mint": m, "symbol": meta.get(m, {}).get("symbol", ""), "name": meta.get(m, {}).get("name", ""),
                     "token_program": meta.get(m, {}).get("token_program", ""),
                     "admitted_by": "Global.whitelisted_quote_mints" if m in whitelisted else "QuoteControl",
                     "bonding_curves": total, "complete": complete, "sample_bonding_curves": samples})
        print(rows[-1]["symbol"] or m, total, complete, flush=True)
    out = {"snapshot": time.strftime("%Y-%m-%d"), "program": PROGRAM, "global_accounts": [g[0] for g in globals_],
           "whitelisted_quote_mints": whitelisted, "quote_control_entries": controls,
           "note": f"SOL-paired coins store Pubkey::default() as quote_mint and are not counted here; {WSOL} is the unified SOL id.",
           "non_sol_quote_mints": sorted(rows, key=lambda r: -r["bonding_curves"])}
    (OUT / "pumpfun_quote_mix.json").write_text(json.dumps(out, indent=1))
    print(json.dumps({k: v for k, v in out.items() if k != "non_sol_quote_mints"}, indent=1))


if __name__ == "__main__":
    main()
