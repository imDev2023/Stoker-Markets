# The public API

The reference is a page of the site (owner, 2026-10-25: everything on the page, nothing left here to link out to): `/api` on the deployment, `https://stoker.markets/api` on mainnet.
Its content is `apps/web/src/app/(terminal)/api/reference.tsx`, one section per group of endpoints with what each answers or prepares, the sign-send-report walkthrough, the referral rule, the keys and limits, the errors the API really sends, and the operator's endpoints; the page adds a quickstart the API answers live.
The zod contract in `packages/contract` is the source of truth for every shape.

When an endpoint, a field or an error changes, change `reference.tsx` in the same PR.
