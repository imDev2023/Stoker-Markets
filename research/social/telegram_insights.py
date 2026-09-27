#!/usr/bin/env python3
"""Aggregate insights from the owner's export of the private StonkFun Telegram group.

Reads the gitignored export in research/social/telegram-group/ (chat.json, messages.jsonl),
streams it once and writes only aggregate, non-personal numbers to
research/social/telegram-group-stats.json.
No usernames, user ids, wallet addresses or message text are written to disk.

Usage:
    python3 research/social/telegram_insights.py            # compute stats, print summary
    python3 research/social/telegram_insights.py --sample rewards_missing --limit 30
        # print (to stdout only) id, date and a truncated, address-redacted text of
        # user messages matching one theme, for manual reading; nothing is saved.

Stdlib only.
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import random
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXPORT = HERE / "telegram-group"
MESSAGES = EXPORT / "messages.jsonl"
OUT = HERE / "telegram-group-stats.json"

# Key dates (UTC).
LAUNCH = "2026-07-23"  # StonkFun went live (group created 2026-07-24).
LAUNCHLAB_SWITCH = "2026-08-28"  # first LaunchLab pools per research/README.md
LAUNCHLAB_PUBLIC = "2026-09-05"  # public LaunchLab release per X posts
EVENTS = {
    "2026-07-24": "Telegram group created",
    "2026-08-10": "Rewards V3",
    "2026-08-18": "Airdrop Mode",
    "2026-08-23": "Relaunch post; admin history cleared",
    LAUNCHLAB_SWITCH: "LaunchLab switch (first pools)",
    "2026-09-01": "GPRO pairing sniped",
    LAUNCHLAB_PUBLIC: "LaunchLab public release",
    "2026-09-11": "CPMM fee-claim outage fixed",
    "2026-09-15": "Rewards distributor rebuild",
    "2026-09-20": "New distributor live",
}

# --- redaction (used only for --sample stdout) ---------------------------------
ADDR = re.compile(r"\b[1-9A-HJ-NP-Za-km-z]{32,44}\b")
URL = re.compile(r"https?://\S+|t\.me/\S+")
MENTION = re.compile(r"@\w+")
PHONE = re.compile(r"\+?\d[\d\s().-]{8,}\d")


def redact(text: str) -> str:
    text = URL.sub("<url>", text)
    text = ADDR.sub("<address>", text)
    text = MENTION.sub("<@>", text)
    text = PHONE.sub("<number>", text)
    return text


# --- bot detection (behavioural, no hard-coded ids) ----------------------------
BOT_TEMPLATES = re.compile(
    r"⇄.*\bMC\b|Message reported to admins|^User was banned|^Welcome\b|"
    r"temporarily muted by flood control|^- Don't shill coins below",
    re.S,
)

# --- themes --------------------------------------------------------------------
def rx(p: str) -> re.Pattern:
    return re.compile(p, re.I)


NEG = r"(not|no|never|haven'?t|hasn'?t|didn'?t|don'?t|isn'?t|aren'?t|wasn'?t|missing|where|stuck|late|delay\w*|still|wen|when)"
THEMES: dict[str, re.Pattern] = {
    # product problems
    "bug_error": rx(r"\b(bug\w*|error\w*|broken|not working|doesn'?t work|isn'?t working|glitch\w*|fail(ed|ing|s)?|crash\w*)\b"),
    "site_ui": rx(r"\b(site|website|ui|ux|frontend|front end|mobile|page|loading|lag\w*|slow site)\b"),
    "launch_problem": rx(r"\b(launch\w*|deploy\w*|creat\w*|mint\w*)\b.{0,60}\b(fail\w*|stuck|error\w*|not work\w*|won'?t|can'?t|cannot|issue\w*|problem\w*|bug\w*)\b|\b(fail\w*|stuck|error\w*|can'?t|cannot)\b.{0,40}\b(launch|deploy|creat\w*)\b"),
    "graduation": rx(r"\b(bond(ed|ing|s)?|graduat\w*|migrat\w*|final stretch|curve)\b"),
    "graduation_problem": rx(r"\b(bond\w*|graduat\w*|migrat\w*)\b.{0,60}\b(fail\w*|stuck|error|not|didn'?t|won'?t|issue\w*|problem\w*|wrong)\b"),
    "routing_fill": rx(r"\b(routing|route|fill(s|ed)?|slippage|swap (fail|error)\w*|tx (fail|error)\w*|transaction (fail|error)\w*)\b"),
    # rewards / fees
    "rewards": rx(r"\b(reward\w*|distribut\w*|payout\w*|pot|thresholds?|dividend\w*)\b"),
    "rewards_missing": rx(r"\b(reward\w*|payout\w*|distribut\w*)\b.{0,60}\b" + NEG + r"\b|\b" + NEG + r"\b.{0,40}\b(reward\w*|payout\w*|distribut\w*)\b"),
    "rewards_clog_sell": rx(r"\b(clog\w*|clip\w*|(distro|distributor|reward\w*|rew) wallet|sell(s|ing)? pressure)\b"),
    "creator_fees": rx(r"\b(creator ?(fee|reward|forward)\w*|dev (fee|reward)s?|creator forwarding|forwarding)\b"),
    "creator_fees_missing": rx(r"\b(creator|dev) ?(fee|reward)s?\b.{0,80}\b" + NEG + r"\b|\b" + NEG + r"\b.{0,60}\b(creator|dev) ?(fee|reward)s?\b"),
    "fees_tax": rx(r"\b(fee|fees|tax|taxes|transfer tax|4%|1%|3%)\b"),
    "buyback_burn": rx(r"\b(buy ?backs?|burn\w*|flywheel)\b"),
    # pairing
    "pairing": rx(r"\b(pair(ed|ing|ings|s)?|quote\w*)\b"),
    "tokenized_stocks": rx(r"\b(x ?stocks?|tokeni[sz]ed|stocks?|equit\w*|backpack|sunrise|tradfi|rwa\w*|nasdaq|nyse)\b|\b(?-i:[A-Z]{2,5}x)\b"),
    "prestocks_preipo": rx(r"\b(pre-?stocks?|pre-?ipo|ipo|anthropic|openai|spacex|spcx\w*)\b"),
    "stonk_pairing": rx(r"(paired|pair|pairs|pairing)\s+(with|to|against|on)?\s*\$?stonk\b|\$?stonk\s+(pair\w*|quote)"),
    "sol_pairing": rx(r"(paired|pair|pairs|pairing)\s+(with|to|against|on)?\s*\$?sol\b|\bsol\s+(pair\w*|quote)"),
    "listing_request": rx(r"\b(list(ing)?|add|pair with|request\w*|can we get|please add|need|want)\b.{0,40}(\$[A-Za-z]{2,10}|\b[A-Z]{2,6}x?\b)"),
    # safety / moderation
    "scam_rug": rx(r"\b(scam\w*|rug\w*|honeypot|fake|impersonat\w*|drain\w*|phish\w*|exit scam|cabal)\b"),
    "snipers_bots": rx(r"\b(snip(e|er|ers|ing|ed)|bundl\w*|mev|front ?run\w*)\b"),
    "moderation": rx(r"\b(ban(ned)?|mute\w*|spam\w*|report(ed)?|admins?|mods?)\b"),
    "support_request": rx(r"\b(help|support|dm me|dm'?d|ticket|refund\w*|anyone (know|help)|how do i|how to)\b"),
    "trust": rx(r"\b(centrali[sz]\w*|decentrali[sz]\w*|multisig|squads|custod\w*|immutab\w*|hot (key|wallet)s?|operator wallet|turnkey|audit(ed|s)?|transparen\w*|on-?chain distributor|exit scam|(team|dev|devs|stonk ?fun|platform) (is|are)? ?(rug\w*|scam\w*|stealing|stole))\b"),
    "slow_waiting": rx(r"\b(slow\w*|delay\w*|waiting|patience|still waiting|hours|days)\b"),
    # regulatory / geo
    "geo_regulatory": rx(r"\b(vpn|geo-?block\w*|geoblock\w*|restricted (country|region|in)|not available in|blocked in|banned in (the )?(uk|us|usa|canada|eu|my country)|my (country|region)|jurisdiction\w*|regulat\w*|securities|the sec|sec (approv|filing|chair)\w*|lawsuit|legal (issue|risk)s?)\b"),
    # ecosystem
    "terminals": rx(r"\b(axiom|fomo|gmgn|photon|bullx|jupiter|jup|dexscreener|dex paid|trojan|titan|padre|bloom)\b"),
    "competitors": rx(r"\b(pump ?\.?fun|pumpfun|pumpswap|dumpfun|bonk\.?fun|letsbonk|bags\.fm|bags app|on bags|believe app|meteora|moonshot|four\.?meme|flap|bankr|zora|clanker|pons|printr|heaven\.?(xyz|fun)?)\b"),
    "launchlab_raydium": rx(r"\b(launch ?lab|raydium|cpmm|clmm)\b"),
    "api_integrators": rx(r"\b(api|integrat\w*|sdk|docs?|gitbook)\b"),
    "airdrop_mode": rx(r"\bairdrop\w*\b"),
    "hype_price": rx(r"\b(ath|moon\w*|pump\w*|send it|lfg|bullish|bearish|dump\w*|jeet\w*)\b"),
}

QUESTION_INTENTS: dict[str, re.Pattern] = {
    "where are my rewards / when do rewards pay": rx(r"\b(where|when|why)\b.{0,40}\b(reward\w*|distribut\w*|payout\w*|pot)\b|\b(reward\w*|distribut\w*)\b.{0,40}\?"),
    "where are my creator fees": rx(r"\b(creator|dev) ?(fee|reward)s?\b.{0,60}\?"),
    "how do I launch / pair / add a quote": rx(r"\bhow\b.{0,30}\b(launch|deploy|create|pair|add|quote)\w*"),
    "what is the CA / link": rx(r"\b(ca|contract( address)?|link|website|site)\b\s*\??\s*$|\bwhat'?s the (ca|link|site)\b"),
    "when LaunchLab / update / new feature": rx(r"\b(when|wen|eta)\b.{0,30}\b(launch ?lab|update|feature|release|mobile|app|v2|dex)\b"),
    "when new listing / which asset next": rx(r"\b(when|wen|next|which|any)\b.{0,30}\b(listing|list|pair\w*|quote\w*|stock\w*)\b"),
    "is it safe / legit / a scam": rx(r"\b(legit|safe|scam|rug\w*|trust\w*)\b.{0,20}\?"),
    "why is the chart dumping / who is selling": rx(r"\bwhy\b.{0,40}\b(dump\w*|sell\w*|red|down|drop\w*)\b|\bwho\b.{0,20}\bsell\w*"),
    "how do rewards / tax work": rx(r"\bhow\b.{0,30}\b(reward\w*|tax|fee\w*|flywheel|burn\w*)\b.{0,20}\b(work|calculat|generat|paid|distribut)\w*"),
    "can I sell / swap / tx failing": rx(r"\b(can'?t|cannot|unable to)\b.{0,20}\b(sell|buy|swap|claim)\b"),
    "fee claim / claim how": rx(r"\bclaim\w*\b.{0,40}\?"),
}

# Quote assets and asset classes people talk about (name or ticker, case-insensitive).
NAMED_ASSETS: dict[str, re.Pattern] = {
    "SOL": rx(r"\$sol\b|\bsol pair\w*|paired (with|to) sol\b|\bsolana pair\w*"),
    "STONK": rx(r"\$?stonk\b(?! ?(fun|pad|szn))"),
    "USDC/stables": rx(r"\b(usdc|usdt|usd1|stable ?coins?)\b"),
    "gold (GLDx etc.)": rx(r"\b(gold|gldx?|xau\w*|bullion)\b"),
    "silver/commodities": rx(r"\b(silver|slv\w*|oil|uso|copper|copx|commodit\w*)\b"),
    "NVDA": rx(r"\b(nvda\w*|nvidia)\b"),
    "TSLA": rx(r"\b(tsla\w*|tesla)\b"),
    "SPY/QQQ index": rx(r"\b(spy\w?|qqq\w?|s&p|sp500|nasdaq)\b"),
    "GME/AMC meme stocks": rx(r"\b(gme\w?|gamestop|amc)\b"),
    "AAPL/MSFT/META/AMZN/GOOG": rx(r"\b(aapl\w?|apple stock|msft\w?|meta\s?x|amzn\w?|googl?\w?)\b"),
    "MCD/WEN/food stocks": rx(r"\b(mcd\w?|mcdonald\w*|wendy\w*|\$wen\b|cmg|chipotle)\b"),
    "penny stocks": rx(r"\bpenny ?stock\w*\b"),
    "Pre-IPO (Anthropic/OpenAI/SpaceX)": rx(r"\b(anthropic|openai|spacex|spcx\w*|pre-?ipo|prestock\w*)\b"),
    "BTC/wBTC": rx(r"\b(btc|wbtc|bitcoin)\b"),
    "ETH": rx(r"\b(eth|weth|ethereum)\b"),
    "ZEC/XMR privacy": rx(r"\b(zec|zcash|xmr|monero)\b"),
    "HYPE/PURR": rx(r"\b(hype|xhype|purr|hyperliquid)\b"),
    "PEPE/memecoin quotes": rx(r"\b(pepe|bonk|wif|popcat|fartcoin)\b"),
    "Pokemon/collectibles": rx(r"\b(pokemon|pok[eé]mon|collectible\w*|cards?)\b"),
    "Polymarket/prediction": rx(r"\b(polymarket|prediction market\w*)\b"),
    "leveraged tokens": rx(r"\b(leveraged|3x|2x)\b"),
}

COMPETITORS: dict[str, re.Pattern] = {
    "pump.fun / PumpSwap": rx(r"\b(pump ?\.?fun|pumpfun|pumpswap|dumpfun)\b"),
    "letsbonk / bonk.fun": rx(r"\b(bonk\.?fun|letsbonk)\b"),
    "Bags": rx(r"\b(bags\.fm|bags app|on bags)\b"),
    "Meteora": rx(r"\bmeteora\b"),
    "Flap (BNB)": rx(r"\bflap\b"),
    "four.meme (BNB)": rx(r"\bfour\.?meme\b"),
    "Pons": rx(r"\bpons\b"),
    "Clanker / Zora / Bankr (Base)": rx(r"\b(clanker|zora|bankr)\b"),
    "Printr": rx(r"\bprintr\b"),
    "Believe": rx(r"\bbelieve app\b"),
}

TEAM_ASK = rx(r"\b(dev|devs|admin|admins|mod|mods|team|support)\b")

STOP = set(
    "the a an to of and or is are was were be been it this that these those i you he she we they me my your our their "
    "in on at for with by from as so if but not no yes do does did can could would should will just what when where why how who "
    "any anyone some there here have has had get got its it's im i'm u ur pls please guys bro lol".split()
)


def norm_question(t: str) -> str:
    t = redact(t).lower()
    t = re.sub(r"<[a-z@]+>", " ", t)
    t = re.sub(r"[^a-z0-9$%?' ]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def day(d: str) -> str:
    return d[:10]


def week(d: str) -> str:
    y, m, dd = map(int, d[:10].split("-"))
    iso = dt.date(y, m, dd).isocalendar()
    monday = dt.date.fromisocalendar(iso[0], iso[1], 1)
    return monday.isoformat()


def phase(d: str) -> str:
    return "pre_launchlab" if d[:10] < LAUNCHLAB_SWITCH else "launchlab"


# --- pass 1: classify senders --------------------------------------------------
def classify_senders() -> set:
    """Return the set of bot sender ids, detected by behaviour only (never written out)."""
    total = collections.Counter()
    templ = collections.Counter()
    for line in open(MESSAGES, encoding="utf-8"):
        m = json.loads(line)
        t = m.get("text")
        if not t or m["sender_id"] is None:
            continue
        total[m["sender_id"]] += 1
        if BOT_TEMPLATES.search(t):
            templ[m["sender_id"]] += 1
    bots = {s for s, n in total.items() if n >= 50 and templ[s] / n >= 0.3}
    return bots


def iter_messages():
    for line in open(MESSAGES, encoding="utf-8"):
        yield json.loads(line)


def compute() -> dict:
    bots = classify_senders()
    daily = collections.defaultdict(lambda: {"all": 0, "user": 0, "admin": 0, "bot": 0, "service": 0, "senders": set()})
    weekly = collections.defaultdict(lambda: {"user": 0, "senders": set()})
    cls_counts = collections.Counter()
    sender_msgs = collections.Counter()
    theme_msgs = {k: collections.Counter() for k in THEMES}  # phase -> count
    theme_senders = {k: set() for k in THEMES}
    theme_weekly = {k: collections.Counter() for k in THEMES}
    admin_theme = collections.Counter()
    intents = collections.Counter()
    intent_senders = collections.defaultdict(set)
    questions = collections.defaultdict(set)  # normalized question -> senders
    q_bigrams = collections.Counter()
    user_cashtags = collections.Counter()
    user_cashtag_senders = collections.defaultdict(set)
    request_cashtags = collections.Counter()
    request_cashtag_senders = collections.defaultdict(set)
    card_quotes = collections.Counter()
    card_quotes_phase = collections.defaultdict(collections.Counter)
    xstock_mentions = collections.Counter()
    asset_msgs = collections.Counter()
    asset_senders = collections.defaultdict(set)
    asset_pairing_ctx = collections.Counter()
    comp_msgs = collections.Counter()
    shape = collections.Counter()
    sender_of = {}  # message id -> class, for reply analysis (no ids are written out)
    support = collections.Counter()
    support_weekly = collections.Counter()
    bot_events = collections.Counter()
    cmd_counts = collections.Counter()
    mod_cmd_issuers = collections.defaultdict(set)
    phase_user = collections.Counter()
    pinned_admin = 0
    media = collections.Counter()
    first = last = None
    total = 0

    for m in iter_messages():
        total += 1
        d = m["date"]
        first = first or d
        last = d
        dy = day(d)
        s = m["sender_id"]
        t = m.get("text")
        media[m.get("media_type") or "none"] += 1
        if t is None:
            cls = "service"
        elif s is None:
            cls = "admin"
        elif s in bots:
            cls = "bot"
        else:
            cls = "user"
        cls_counts[cls] += 1
        sender_of[m["id"]] = cls
        rt = m.get("reply_to")
        if t and rt in sender_of:
            support[f"{cls}_replies_to_{sender_of[rt]}"] += 1
        daily[dy]["all"] += 1
        daily[dy][cls] += 1
        if cls == "user":
            daily[dy]["senders"].add(s)
            weekly[week(d)]["user"] += 1
            weekly[week(d)]["senders"].add(s)
            sender_msgs[s] += 1
            phase_user[phase(d)] += 1
        if cls == "admin" and m.get("pinned"):
            pinned_admin += 1
        if not t:
            continue

        if cls == "bot":
            if "⇄" in t:
                q = re.search(r"⇄\s*\$?([A-Za-z0-9.]+)", t)
                if q:
                    card_quotes[q.group(1).upper()] += 1
                    card_quotes_phase[phase(d)][q.group(1).upper()] += 1
            if "reported to admins" in t:
                bot_events["report_ack"] += 1
            elif t.startswith("User was banned"):
                bot_events["ban"] += 1
            elif t.startswith("Welcome"):
                bot_events["welcome"] += 1
            elif "flood control" in t:
                bot_events["flood_mute"] += 1
            elif "Don't shill coins below" in t:
                bot_events["rules_reply"] += 1
            continue

        if cls == "user":
            if ADDR.search(t):
                shape["user_msgs_with_contract_address"] += 1
            if len(t) < 20:
                shape["user_msgs_under_20_chars"] += 1
            if "?" in t:
                shape["user_msgs_with_question_mark"] += 1
        if t.startswith("/"):
            c = t.split()[0].split("@")[0].lower()
            cmd_counts[c] += 1
            if c in {"/ban", "/unban", "/mute", "/unmute", "/warn", "/kick", "/tban", "/tmute", "/del"} and s is not None:
                mod_cmd_issuers[c].add(s)

        for k, p in THEMES.items():
            if p.search(t):
                if cls == "user":
                    theme_msgs[k][phase(d)] += 1
                    theme_senders[k].add(s)
                    theme_weekly[k][week(d)] += 1
                elif cls == "admin":
                    admin_theme[k] += 1

        if cls != "user":
            continue

        tags = {x.upper() for x in re.findall(r"\$([A-Za-z][A-Za-z0-9]{1,9})\b", t)}
        for x in tags:
            user_cashtags[x] += 1
            user_cashtag_senders[x].add(s)
        for name, cp in COMPETITORS.items():
            if cp.search(t):
                comp_msgs[name] += 1
        pair_ctx = bool(THEMES["pairing"].search(t) or re.search(r"\b(list\w*|add|request\w*)\b", t, re.I))
        for name, ap in NAMED_ASSETS.items():
            if ap.search(t):
                asset_msgs[name] += 1
                asset_senders[name].add(s)
                if pair_ctx:
                    asset_pairing_ctx[name] += 1
        for x in re.findall(r"\b([A-Z]{2,5}x)\b", t):
            xstock_mentions[x] += 1
        if THEMES["listing_request"].search(t) or re.search(r"\b(list|add|pair|quote)\b", t, re.I):
            for x in tags:
                request_cashtags[x] += 1
                request_cashtag_senders[x].add(s)

        if "?" in t and TEAM_ASK.search(t):
            support["user_questions_addressed_to_team"] += 1
            support_weekly[week(d)] += 1
        if "?" in t:
            support["user_questions_total"] += 1
        if "?" in t and len(t) <= 200:
            for label, p in QUESTION_INTENTS.items():
                if p.search(t):
                    intents[label] += 1
                    intent_senders[label].add(s)
            nq = norm_question(t)
            if 15 <= len(nq) <= 80:
                questions[nq].add(s)
            words = [w for w in re.findall(r"[a-z$][a-z0-9$']+", nq) if w not in STOP]
            for a, b in zip(words, words[1:]):
                q_bigrams[f"{a} {b}"] += 1

    active = sorted(sender_msgs.values(), reverse=True)
    top10 = sum(active[:10])
    top100 = sum(active[:100])
    user_total = sum(active)

    daily_out = []
    for dy in sorted(daily):
        v = daily[dy]
        daily_out.append({
            "date": dy,
            "all": v["all"],
            "user": v["user"],
            "admin": v["admin"],
            "bot": v["bot"],
            "service": v["service"],
            "active_users": len(v["senders"]),
            "event": EVENTS.get(dy),
        })

    def phase_avg(key: str, lo: str, hi: str) -> float:
        rows = [r for r in daily_out if lo <= r["date"] < hi]
        return round(sum(r[key] for r in rows) / max(1, len(rows)), 1)

    common_q = sorted(
        ((q, len(ss)) for q, ss in questions.items() if len(ss) >= 3),
        key=lambda x: -x[1],
    )[:60]

    result = {
        "note": "Aggregate counts only. Generated by telegram_insights.py from the gitignored export; no user ids, names, addresses or message text.",
        "range": {"first": first, "last": last, "days": len(daily_out)},
        "totals": {
            "messages": total,
            "by_class": dict(cls_counts),
            "bot_accounts_detected": len(bots),
            "distinct_user_senders": len(sender_msgs),
            "user_messages_share_top10_senders": round(top10 / max(1, user_total), 3),
            "user_messages_share_top100_senders": round(top100 / max(1, user_total), 3),
            "users_with_1_message": sum(1 for n in active if n == 1),
            "users_with_100plus_messages": sum(1 for n in active if n >= 100),
            "admin_pinned_posts_in_stream": pinned_admin,
            "media": dict(media),
        },
        "phase_daily_averages": {
            "launch_to_launchlab_switch (07-24..08-27)": {k: phase_avg(k, "2026-07-24", LAUNCHLAB_SWITCH) for k in ("all", "user", "active_users")},
            "switch_to_public_launchlab (08-28..09-04)": {k: phase_avg(k, LAUNCHLAB_SWITCH, LAUNCHLAB_PUBLIC) for k in ("all", "user", "active_users")},
            "launchlab_public (09-05..09-26)": {k: phase_avg(k, LAUNCHLAB_PUBLIC, "2026-09-27") for k in ("all", "user", "active_users")},
        },
        "daily": daily_out,
        "weekly_user": [{"week_of": w, "user_messages": v["user"], "active_users": len(v["senders"])} for w, v in sorted(weekly.items())],
        "user_messages_by_phase": dict(phase_user),
        "themes_user": {
            k: {
                "messages": sum(theme_msgs[k].values()),
                "pre_launchlab": theme_msgs[k]["pre_launchlab"],
                "launchlab": theme_msgs[k]["launchlab"],
                "per_1k_user_msgs_pre": round(1000 * theme_msgs[k]["pre_launchlab"] / max(1, phase_user["pre_launchlab"]), 1),
                "per_1k_user_msgs_launchlab": round(1000 * theme_msgs[k]["launchlab"] / max(1, phase_user["launchlab"]), 1),
                "distinct_senders": len(theme_senders[k]),
            }
            for k in THEMES
        },
        "themes_weekly_user": {k: dict(sorted(v.items())) for k, v in theme_weekly.items()},
        "themes_admin": dict(admin_theme.most_common()),
        "question_intents": {k: {"messages": intents[k], "distinct_senders": len(intent_senders[k])} for k, _ in intents.most_common()},
        "common_questions_3plus_senders": [{"question": q, "distinct_senders": n} for q, n in common_q],
        "question_bigrams_top": q_bigrams.most_common(60),
        "user_cashtags_top": [{"tag": k, "mentions": v, "distinct_senders": len(user_cashtag_senders[k])} for k, v in user_cashtags.most_common(60)],
        "request_context_cashtags_top": [{"tag": k, "mentions": v, "distinct_senders": len(request_cashtag_senders[k])} for k, v in request_cashtags.most_common(40)],
        "named_assets_user": [
            {"asset": k, "messages": v, "distinct_senders": len(asset_senders[k]), "in_pairing_or_listing_context": asset_pairing_ctx[k]}
            for k, v in asset_msgs.most_common()
        ],
        "user_message_shape": dict(shape),
        "support": {**dict(support), "team_addressed_questions_weekly": dict(sorted(support_weekly.items()))},
        "competitor_mentions_user": dict(comp_msgs.most_common()),
        "xstock_style_tickers_top": xstock_mentions.most_common(30),
        "new_pair_bot_quote_assets": {
            "all": card_quotes.most_common(40),
            "total_cards": sum(card_quotes.values()),
            "by_phase": {p: c.most_common(15) for p, c in card_quotes_phase.items()},
        },
        "moderation": {
            "bot_events": dict(bot_events),
            "slash_commands_top": cmd_counts.most_common(25),
            "moderation_command_distinct_issuers": {k: len(v) for k, v in mod_cmd_issuers.items()},
        },
    }
    return result


def sample(theme: str, limit: int, since: str | None, seed: int) -> None:
    pats = {**THEMES, **{f"q:{k}": v for k, v in QUESTION_INTENTS.items()}}
    if theme not in pats:
        sys.exit(f"unknown theme {theme}; choose from: {', '.join(pats)}")
    p = pats[theme]
    bots = classify_senders()
    hits = []
    for m in iter_messages():
        t = m.get("text")
        if not t or m["sender_id"] is None or m["sender_id"] in bots:
            continue
        if since and m["date"][:10] < since:
            continue
        if p.search(t) and len(t) >= 25:
            hits.append((m["id"], m["date"][:10], redact(t)[:260].replace("\n", " / ")))
    random.Random(seed).shuffle(hits)
    print(f"{len(hits)} matches; showing {min(limit, len(hits))}")
    for i, d, t in sorted(hits[:limit], key=lambda x: x[0]):
        print(f"#{i} {d} {t}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", help="theme name (or q:<intent>) to print redacted examples to stdout")
    ap.add_argument("--limit", type=int, default=25)
    ap.add_argument("--since")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    if not MESSAGES.exists():
        sys.exit(f"export not found at {MESSAGES}; run research/scripts/telegram_export.py first")
    if a.sample:
        sample(a.sample, a.limit, a.since, a.seed)
        return
    res = compute()
    OUT.write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({k: res[k] for k in ("range", "totals", "phase_daily_averages", "user_messages_by_phase")}, indent=1))
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
