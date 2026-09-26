# /// script
# requires-python = ">=3.10"
# dependencies = ["telethon>=1.36", "python-dotenv>=1.0"]
# ///
"""Read-only export of a Telegram group's history through the owner's own account.

Run it yourself so the login code and 2FA password are typed into your terminal, not a chat:

    uv run research/scripts/telegram_export.py            # list your chats matching "stonk"
    uv run research/scripts/telegram_export.py <chat-id>  # export that chat

Needs TG_API_ID and TG_API_HASH in the project .env (from https://my.telegram.org -> API development tools).
The login session is stored outside the repo in ~/.telegram-sessions/, and it never sends, reacts or joins anything.
"""
import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.tl.types import InputMessagesFilterPinned

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "research" / "social" / "telegram-group"
SESSION_DIR = Path.home() / ".telegram-sessions"


def message_record(m):
    return {
        "id": m.id,
        "date": m.date.isoformat() if m.date else None,
        "sender_id": m.sender_id,
        "reply_to": m.reply_to_msg_id,
        "text": m.message,
        "views": m.views,
        "forwards": m.forwards,
        "pinned": m.pinned,
        "has_media": m.media is not None,
        "media_type": type(m.media).__name__ if m.media else None,
    }


async def main():
    load_dotenv(ROOT / ".env")
    api_id, api_hash = os.environ.get("TG_API_ID"), os.environ.get("TG_API_HASH")
    if not api_id or not api_hash:
        sys.exit("Add TG_API_ID and TG_API_HASH to .env first (https://my.telegram.org).")
    SESSION_DIR.mkdir(mode=0o700, exist_ok=True)
    client = TelegramClient(str(SESSION_DIR / "research"), int(api_id), api_hash)
    await client.start()  # prompts for phone, login code and 2FA password on first run

    if len(sys.argv) < 2:
        async for d in client.iter_dialogs():
            if "stonk" in (d.name or "").lower():
                kind = "channel" if d.is_channel and not d.is_group else "group"
                print(f"{d.id}\t{kind}\t{d.name}")
        print("\nRe-run with the id of the group to export.")
        return

    chat = await client.get_entity(int(sys.argv[1]))
    OUT.mkdir(parents=True, exist_ok=True)
    count = 0
    with (OUT / "messages.jsonl").open("w") as f:
        async for m in client.iter_messages(chat, reverse=True, wait_time=1):
            f.write(json.dumps(message_record(m), ensure_ascii=False) + "\n")
            count += 1
            if count % 1000 == 0:
                print(f"{count} messages", flush=True)
    pinned = [message_record(m) async for m in client.iter_messages(chat, filter=InputMessagesFilterPinned)]
    (OUT / "chat.json").write_text(json.dumps(
        {"id": chat.id, "title": getattr(chat, "title", None), "exported_messages": count, "recent_pinned": pinned},
        indent=1, ensure_ascii=False,
    ))
    print(f"Done: {count} messages -> {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
