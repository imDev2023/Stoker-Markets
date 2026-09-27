# Creator Fees are on-chain and end at Graduation

Our wedge against StonkFun is trust: its ~0.5% creator share is forwarded off-chain by a cron job, which broke for about three weeks in September 2026 (see `research/social/telegram-group-insights.md`).
So on the curve traders pay what they pay at StonkFun (1.25%: 0.25% Raydium, 0.5% Platform Fee, 0.5% Creator Fee), but the Creator Fee is set in our LaunchLab PlatformConfig and claimed by the Creator on-chain, with nothing forwarded by us.
After Graduation we copy StonkFun: the platform is the CPMM pool's creator (`platform_cp_creator`) and holds 100% of the locked-LP Fee Keys, so Creators earn nothing post-graduation.

## Considered Options

- Creator gets the post-graduation CPMM creator fee, platform keeps the LP Fee Keys: creator-friendly, but cuts our post-graduation revenue by roughly 80%.
- Creator gets the LP Fee Key NFT (about 0.2% of volume, on-chain): rejected by the owner in favour of matching StonkFun.

## Consequences

- Each migrated pool's CPMM creator and Fee Key owner are fixed at migration, so changing this later only affects coins that graduate afterwards.
- The Platform Fee and Creator Fee rates live in the PlatformConfig and can be changed by the platform admin; a change applies to all live curves at once, so any change must be announced first.
