# StonkFun on Telegram (@StonkFunXyz)

Collected 2026-09-26.
Raw data is in `telegram.json`.

## What it is

`t.me/StonkFunXyz` is a broadcast channel, not a group.
It works as a "portal": its only real post is a pinned card with a Safeguard "Tap to verify" button, and that button leads into a separate, private community group.

| Field | Value |
|---|---|
| Title | StonkFun |
| Username | @StonkFunXyz |
| Chat id | -1003909480502 |
| Type | channel (Bot API `getChat`) |
| Description | none set |
| Members | 3,617 (`getChatMemberCount`; the web preview shows "3 617 subscribers") |
| Created | 2026-07-24 01:54 UTC (service message #1 "Channel created") |
| Reactions allowed | heart, thumbs up, fire |
| History visible to new members | yes |
| Pinned message | #7 |

## Message history

The public web preview (`https://t.me/s/StonkFunXyz`) shows every public post, and there are only two.
Paging back with `?before=7` returns only #1.
Probing IDs 2-6 and 8-9 one at a time (`t.me/StonkFunXyz/<id>?embed=1`) returned "Post not found" for each, so those messages were deleted or never public.

### #1 - 2026-07-24 01:54 UTC

Service message: "Channel created".

### #7 - pinned - posted 2026-07-24 03:37 UTC, edited 2026-08-20 11:43 UTC

It has one photo: a 1280x426 banner.
Web preview image: https://cdn4.telesco.pe/file/j8Xk8KFno8hJpe7EE-5i89RhR4aGslx1JItZN9M_hSupIa3P4iUevLyMBadjnlIWCDAtuRL4HZ2KsU3EIMFUURLIAFEN4Al1j_JnG5Z0c2HiJU7mZ3IX5n-JwLUHqstBMh5CFfNL15FDhdTmxHulcNMDuvbdqUJGS99r4s0U9kDUOP3m-NCIYSqsx1sel9rmZ27q7mGuRGJredfVov7dLcmfvFnAZb-qhU89gMxJMJP9nU-yBDYAyHf313u5M5ZZAIaGOjWoKV9iKVPPoI5U0-J5iR4sRqecGqGe36WfptIKPVkGpjBUqb5wrkvNr7h9ZZbRh0vfcjq5tnPcvAeWVg.jpg

> Launch Coins / Paired with Anything
>
> Powered by Raydium
>
> Launchpad: stonkpad.xyz
>
> X: x.com/LaunchOnSF
>
> Click below to verify you're human

Inline button: "Tap to verify", which opens `http://t.me/safeguard?start=-1004491672783`.
Views: 20.9K.
Reactions: 143 heart, 42 fire, 11 thumbs up.

## Extracted items

- Announcements: "Launch Coins / Paired with Anything" and "Powered by Raydium".
- Rules: none posted in the channel.
- Links: `stonkpad.xyz`, `x.com/LaunchOnSF`, `t.me/safeguard?start=-1004491672783`.
- Solana addresses: none.
- Bots: `@safeguard`, a third-party verification bot that gates entry to the private group.
- How launching works: the channel says only that the launchpad is at stonkpad.xyz and that coins can pair with anything, via Raydium.
  The detail is all on X (see `x-posts.md`).

## Anomaly: stonkpad.xyz vs stonkfun.xyz

The pinned post names the launchpad as `stonkpad.xyz`.
X (profile website, pinned post, every launch link) uses `stonkfun.xyz`.
The pinned post was edited on 2026-08-20; the X posts before and after that date point to stonkfun.xyz, and they link back to this channel.
Web search shows that unrelated "StonkPad" tokens exist on Ethereum, Robinhood Chain and Solana.
The owner should treat stonkpad.xyz as unverified: it might be an alias, a typo, or a sign that the channel was changed.
We did not visit either domain.

## What the owner's bot can see

These are read-only Bot API calls made as the owner's bot.
We did not call `getUpdates` and did not send any messages.

| Call | Result |
|---|---|
| `getMe` | `@Approval44_bot` (id 8702043371), `can_join_groups: true`, `can_read_all_group_messages: false` (privacy mode on) |
| `getChat @StonkFunXyz` | OK: returns title, type, pinned message #7 with its button, and no description |
| `getChatMemberCount @StonkFunXyz` | 3617 |
| `getChatAdministrators @StonkFunXyz` | `400 Bad Request: member list is inaccessible` |

What this means:
- `getChat` and `getChatMemberCount` work for any bot on a public channel, so they do not prove the bot is a member.
- `getChatAdministrators` failed, so the bot is not an admin of this channel.
  For a channel, that also means it receives no channel posts.
- The group the owner mentioned is almost certainly the private community group behind the Safeguard button, not @StonkFunXyz.
  That group's id (from the Safeguard start parameter) is different from the channel id.
- We did not probe that group with the bot.
  If the owner wants to, `getChat` and `getChatMemberCount` on the group's chat id would confirm membership without side effects.

## Limits on reading the group

- The Bot API cannot read past messages in any chat.
  A bot only receives new updates after it joins, and in groups it only sees all messages if privacy mode is off or it is an admin.
  `@Approval44_bot` has privacy mode on.
- Reading the full history of the private group (rules, pinned messages, announcements, contract addresses posted there) needs a user-account MTProto client, such as Telethon, logged in by the owner with an account that has passed the Safeguard verification.
- The Safeguard verification step itself is a human-verification flow and was not attempted.
