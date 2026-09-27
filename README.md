# Messbook

A responsive mess-management application for PKR accounting. Includes members, attendance, meal expenses, cooking logs, independent oil/gas purchases, shared expenses, payments, personal purchases, settlements, resident statements, daily/monthly reports, and an audit trail.

## Stack

- Next.js App Router and TypeScript
- Tailwind CSS v4, shadcn/ui-style Radix primitives, Lucide React
- React Hook Form and Zod
- TanStack Table and Recharts
- Next.js Route Handlers and a TypeScript business layer
- Cloudflare D1, Drizzle ORM, Drizzle Kit
- OpenNext adapter for Cloudflare Workers
- Custom database-backed cookie sessions
- GitHub verification and manual deployment workflows

## Start locally

Use Node.js 22 or newer. From this directory:

```sh
npm ci
cp .dev.vars.example .dev.vars
```

Set `SETUP_TOKEN` in `.dev.vars` to a long random value. Never commit that file. Generate a value with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm run db:local
npm run dev
```

In PowerShell, use `Copy-Item .dev.vars.example .dev.vars` instead of `cp` if preferred. Open `http://localhost:3000`. Choose **Set up your mess**, enter the private setup token, your name, email, and a password of at least 12 characters. Setup can create only the first administrator. All subsequent visits use the sign-in form.

`http://localhost:3000/?demo=1` opens a clearly labeled demonstration. Sample records are generated in memory. Demo changes are never written to D1 and disappear on reload. The live workspace starts empty.

## Deploy to Cloudflare Workers

The project is configured without paid service dependencies, R2, external authentication, or a remote SQL server. Your own Cloudflare account and D1 database are still required. Free-plan suitability depends on actual usage and Worker CPU limits; monitor your deployment rather than assuming unlimited capacity.

```sh
npx wrangler login
npx wrangler d1 create messbook
```

Copy the returned D1 database ID into `wrangler.jsonc`, replacing `REPLACE_WITH_D1_DATABASE_ID`. Keep the binding name `DB`. If you rename the Worker, update both `name` and the `WORKER_SELF_REFERENCE` service name.

```sh
npm run db:remote
npx wrangler secret put SETUP_TOKEN
npm run deploy
```

Supply a unique production setup token when prompted, open the deployed URL, and create your administrator. Remove the setup token after successful setup with `npx wrangler secret delete SETUP_TOKEN`. The database also prevents a second setup independently of that secret.

For a production-runtime local check, run `npm run preview`. Production cookies require HTTPS; the normal `npm run dev` flow is recommended for local sign-in testing.

Documentation: [OpenNext setup](https://opennext.js.org/cloudflare/get-started), [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

## GitHub

Push this project directory as the repository root. Do not push the parent workspace. The lockfile and D1 migrations belong in source control; credentials, local data, dependency folders, and build outputs are ignored.

```sh
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

The verification workflow runs type checks, accounting tests, and the Next.js production build. The deployment workflow is manual (`workflow_dispatch`) and uses a GitHub environment named `production`. Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository/environment secrets. The token needs access to this Worker's deployment and this D1 database. Configure the runtime `SETUP_TOKEN` with Wrangler before first setup.

No GitHub remote or Cloudflare account is embedded in the source.

## Daily use

1. Add members, their arrival/departure dates, fractional stay units, and opening credit.
2. Open **Attendance**, choose the day, tap meals, and save. Meal column headings select or clear all visible members.
3. Add as many meal expense rows as required. Expenses without eaters remain flagged and unallocated.
4. Add oil/gas purchases. For an average-tier entry, enter its effective date and per-meal flat rates. In **Cooking log**, explicitly choose which oil and gas entry was used for each meal.
5. Add shared expenses using stay units, equal shares, exact manual amounts, or exclusion.
6. Record deposits, refunds, and reimbursements immediately. A personal purchase credits its payer. When funding a meal/shared expense, record that expense first, then link the personal purchase; linking never creates a second expense.
7. Review settlements and select a member to open their statement. Positive balances mean the member owes the mess; negative balances mean the mess owes the member.
8. Close average-tier oil/gas entries by setting an end date. Review the over/undercharge amount and make any refund, reimbursement, or separately documented correction manually.
9. When someone leaves, add their departure time and set status to **Left**. Archive members through their status to retain all financial history.

## Filters and exports

- Date presets: today, this month, last month, all time, and custom dates.
- Search plus module-specific meal, status, category, resource, tier, payment type, method, and member filters.
- Sortable and paginated tables; CSV exports include all rows matching current filters, not only the visible page.
- Settlements are cumulative through the selected end date; the start date narrows statement transactions. Changing the period never discards earlier balances.
- Member listing includes all arrival dates; its date range changes the displayed as-of balance.
- Statements support category filters while retaining the complete ledger's running balance.
- Fuel reconciliation always uses the full history of each entry. Purchase-date filters control which entries are listed.
- Reports distinguish average and direct fuel charges, food by meal, shared categories, and payment types. A meal-type filter affects meal costs, not unrelated payments/shared costs.
- Audit events are stored in UTC; business dates use Pakistan time. Load older activity to search beyond the first 200 events.

## Accounting decisions

The supplied specification contains a contradictory formula in its first section. This implementation follows the detailed ledger rules and section 5:

```text
Net due = food charges
        + applied average-tier oil/gas
        + direct oil/gas purchase splits
        + allocated shared expenses
        - opening credit
        - deposits
        - personal purchases
        + refunds
        + reimbursements
```

Direct fuel purchases are derived once as distinct dated ledger charges. They are never subtracted from what a member owes and never enter the meal-cost engine. Editing the purchase recalculates its single set of charges instead of duplicating postings.

Money is stored as integer paisa. Largest-remainder apportionment distributes residual paisa deterministically by member ID, preserving the exact original amount. Displayed average cost per eater is informational; actual individual shares may differ by one paisa.

Attendance, expenses, payments, direct splits, and stay-unit edits recalculate history. Each cooking log stores its applied oil/gas rates. Editing a fuel rate changes new logs only. Editing the date, meal type, or selected entry on a cooking log intentionally re-snapshots that resource's rate. Historical closing dates cannot invalidate existing logs: correct the affected logs first.

The application is a single-mess administrator workspace, not a multi-tenant or resident-login service. It loads the mess's active records for flexible client-side analysis. Large multi-year datasets need measured capacity planning and server-side report pagination before scaling substantially.

## Integrity and authentication

- Server-side validation prevents duplicate attendance/cooking logs, invalid references, invalid dates, out-of-stay attendance, zero-weight allocations, and non-reconciling manual allocations.
- Archived financial records remain in D1 and all financial edits record actor, timestamp, before, and after values.
- A revision guard and atomic D1 batch reject concurrent stale writes. Bulk changes use JSON batches to avoid one database query per attendance row.
- Passwords are salted and hashed with PBKDF2-SHA-256 via Web Crypto (100,000 iterations). Password policy requires 12–128 characters. Login attempts are limited by account and IP.
- Session tokens are random, only token hashes are stored, expiry is seven days, and cookies use HttpOnly, SameSite=Strict, and Secure in production. Logout revokes the stored session.
- Mutations require a same-origin request, a valid session, and Zod validation. Financial data endpoints are not cached.
- This first version has no email-based password recovery or multi-admin invitation flow. Keep administrator credentials safely; any operator-assisted reset must hash the replacement password and revoke existing sessions.

## Checks and source map

```sh
npm run typecheck
npm test
npm run build
```

`src/lib/settlement.ts` contains the independent accounting service; `src/lib/validation.ts` validates cross-record invariants and snapshots rates. `src/app/api` holds authentication and financial endpoints. `src/db/schema.ts` defines the Drizzle schema; `drizzle/` contains the migration and Drizzle metadata. `src/components` contains the responsive UI, forms, table, and chart components.

For schema changes, use `npm run db:generate`, review the generated migration, test it locally, then apply remotely. Back up D1 before production schema changes. Financial audit history is not a substitute for database backups.
