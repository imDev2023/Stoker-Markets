# Copy Protection: a launched coin's name, ticker and image are nobody else's for a window, then anyone's with a label

Status: accepted by the owner on 2026-10-26 (#120, item 1; the window and the defaults in the issue's comment of that day).

A copycat coin (a "vamp") takes a coin's name, ticker or picture the moment it gets attention, and traders buy the wrong one.
StonkFun has no check; uselaunch.fun, a front end on StonkFun, refuses a ticker forever once used.
The owner wants the protection, but not a permanent registry: a dead coin would hold its ticker for good, and bots could lock up names by mass-launching.

## Decision

- For `COPY_PROTECTION_SECONDS` after a coin launches here (seven days; the owner may make it thirty, so it is a setting, never a constant), nobody else may launch a coin on Stoker with its name, its ticker or its image.
  The Creator may reuse their own.
- After the window anyone may, and the check only labels: a later coin that takes an earlier coin's name, ticker or image carries "its ticker is that of X, launched on <date>" on its page, and stays listed.
- Names and tickers are compared by folded keys, each coarser than the last (`apps/api/src/copies/keys.ts`): strict (NFKC, upper case, lookalike letters from other scripts mapped to Latin, letters and digits only, so `$PEPE`, `pepe` and a Cyrillic `РЕРЕ` are one), loose (leetspeak digits read as letters), core (claim words such as OFFICIAL, REAL, V2 and a trailing 2 taken off the ends while four characters remain).
  An equal core key is a copy.
  One edit on keys of five characters or more, or a derivative word such as BABY or MINI in front, is a near copy, refused inside the window like a copy (owner's default, 2026-10-26); near matches on shorter keys are ignored, since most three-letter tickers are one edit from a real one (Top-pad's copycat research, 2026-10-26).
- Tickers are ASCII letters, digits and `$` on the form and in the contract (unchanged), so lookalike tricks are left to names.
- Images are compared by a 64-bit difference hash over the picture scaled to 9 by 8 grey cells (`apps/api/src/copies/imageHash.ts`); a Hamming distance of 10 or under is a copy.
  Measured on the suite's logo: a resize, a JPEG re-encode, a grey version and a channel swap all keep the hash exactly, a palette version differs by 2 bits, a 5% crop by 3, an unrelated logo by 17 and noise by 37.
  An inverted picture differs in every bit and is not caught; a flat picture (fewer than 6 bits set) and one under 16 pixels a side are not compared.
  PNG and JPEG are decoded; WebP and GIF are not yet, so such pictures go unchecked and the form says so.
- The check is the API's (`POST /v1/launches/check` for the form as the Creator types, and `POST /v1/launches/prepare`, which refuses with 409 and the verdict) and the Indexer's (which sets the keys and the label when a launch lands).
  A pool created on our PlatformConfig without our API cannot be refused, so it lands with the label; so does one prepared in the minute before the original was indexed.
- The keys and the hash are columns of `launches` (`name_key`, `symbol_key`, `image_hash`, set once), the label `copy_of` and `copy_kind`; `GET /v1/launches/:mint` carries `protection.until` and `copyOf`.
  No claims table and no cron: the window is the launch time plus the setting, read at check time.

## Consequences

- A Creator sees the verdicts on the form before sending it; the API refuses the same way, so a client without the form gets the same answer.
- The test stack's window is 45 seconds, so a test can see a copy refused and then, after the window, landed with its label; every test launch gets a name and ticker of its own, and every UI launch a picture of its own, or they would be copies of each other.
- Which coins outside Stoker are protected (a Quote Asset's own ticker, Jupiter-verified tokens) is not decided here: the owner's proposed defaults (refuse the first always, label the second) are a follow-up on #120.
- The embedding Top-pad measured (SSCD) can follow if the hash misses too many copies; the hash's threshold is a starting value to re-measure on real launches.
