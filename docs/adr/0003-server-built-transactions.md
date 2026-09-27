# The server builds every transaction; the browser only signs

Raydium's `raydium-sdk-V2` is GPL-3.0, so bundling it into the browser app would oblige us to publish our client code under GPL.
Our API therefore builds every LaunchLab and CPMM transaction (it may use the SDK, because running GPL code on our own servers is not distribution) and returns it unsigned; the browser simulates it, shows the user what it does, and has the wallet sign.
Writing our own instruction builders from the public IDLs was the alternative; we kept it as the fallback, not the default, to avoid owning every Raydium account-layout change ourselves.

## Consequences

- Never import `@raydium-io/raydium-sdk-v2` from browser code; a lint rule should enforce this.
- The SDK must run inside Workers under `nodejs_compat` (ADR 0002); if it does not, the fallback is server-side builders generated from the IDLs, still never in the browser.
- The API is on the critical path for every trade, so it needs the same uptime as the app.
