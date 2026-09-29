# Validation record

Checked locally on 28 September 2026.

## Passed

- TypeScript strict type check.
- 40 automated accounting, validation, migration, meal, buyer-credit, Chai, and CSV checks (`npm test`).
- Next.js production compilation, type validation, route generation, and static page generation.
- Generated Drizzle migration applied successfully to local Cloudflare D1.
- 12 HTTP integration checks against the actual local Next.js/D1 application: unauthenticated access, first-admin setup, HttpOnly/SameSite cookie attributes, legacy-unit migration, origin checks, persisted combined meals, duplicate meal protection, competing revisions, buyer credits, Chai rates, archive reversal, and logout. The disposable checks remove their own account and records.
- Browser checks at desktop and 390-pixel phone widths: combined meal filters, multi-item meal creation, buyer selection, attendance selection/save, Chai selection, automatic-credit filtering, buyer transfer, item removal, archive reversal, and filtered statements.
- No application errors reported by the browser during the checked flows.

The local integration account and its records were removed after testing. No production data was used.

## Accounting coverage

Tests cover integer-paisa conservation, deterministic residual allocation, zero-eater guards, equal/manual shared allocation, direct fuel charged exactly once, Oil/Gas/Chai rates, buyer credits, repeated meal saves, buyer transfers, historical linked-purchase conversion, inactive historical eaters, effective/closing dates, invalid references, duplicate attendance, residence dates, refunds/reimbursements, historical recalculation, as-of balances, and ledger-to-settlement agreement.

## Deployment status

The source includes Cloudflare Worker/D1 configuration and GitHub verification/deployment workflows. A remote GitHub destination, Cloudflare authentication, and a real D1 binding must be supplied before publication. There is no public deployment or remote repository yet.

Production Free-plan CPU consumption, actual remote account limits, live deployment behavior, and real-device browser behavior have not been measured. The browser mobile check uses a phone-sized viewport.

Units removal: typecheck, all 40 unit tests, 12 disposable local D1/API checks, and the Cloudflare Worker build pass. Legacy weighted shared expenses are converted atomically to exact manual allocations, with original payloads retained in audit history. Member units are removed on authenticated record access.
