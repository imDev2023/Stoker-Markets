# One hot operations wallet, one cold admin key

Our LaunchLab PlatformConfig's address is derived from its admin key (seeds `["platform_config", platform_admin]`) and LaunchLab has no instruction to change the admin, so that key is our platform's permanent identity.
We keep that admin key offline (hardware wallet or Squads multisig) and use it only to change PlatformConfig settings.
Every day-to-day role (platform fee wallet, Fee Key NFT wallet, `platform_cp_creator`, Reward Tax withdraw authority, Reward Round payer, Burn and Flywheel buyer) shares one hot operations wallet, as StonkFun does, because the owner chose operational simplicity over splitting roles across a signing service.

## Considered Options

- Separate hot keys per role behind a policy-limited signing service (for example Turnkey) with automatic sweeps to a multisig treasury: rejected for v1 as extra build and operations work.
- One hot wallet including the admin: rejected because a leak would permanently hand over our fee settings, and the only fix would be a new PlatformConfig that orphans every existing Launch.

## Consequences

- A leaked operations key exposes whatever revenue sits in that wallet until it is moved, plus the Reward Tax withdraw authority on every Reward Launch; the fee, NFT and tax-authority roles can all be re-pointed with the admin key, so recovery is possible.
- Revenue should be swept out of the operations wallet regularly so its balance stays small.
