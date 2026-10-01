# MessBook — Mess Management Platform

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-orange?style=flat-square&logo=cloudflare&logoColor=white)
![Cloudflare D1](https://img.shields.io/badge/D1_Database-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Mobile_Optimised-4CAF50?style=flat-square)

**A PKR mess-management platform for Marcha House — handling members, attendance, meal costing, shared expenses, payments, fuel, settlements, resident statements, daily/monthly reports, and a full audit trail.**

[Get Started](#start-locally) • [Deploy](#deploy-to-cloudflare-workers) • [CI/CD](#cicd--github-actions) • [Daily Use](#daily-use) • [Accounting](#accounting-decisions) • [Security](#integrity-and-authentication) • [Tests](#checks-and-source-map)

---

## Table of Contents

- [Stack](#stack)
- [Start Locally](#start-locally)
- [Deploy to Cloudflare Workers](#deploy-to-cloudflare-workers)
- [CI/CD & GitHub Actions](#cicd--github-actions)
- [Daily Use](#daily-use)
  - [Existing Data](#existing-data)
- [Filters and Exports](#filters-and-exports)
- [Accounting Decisions](#accounting-decisions)
- [Integrity and Authentication](#integrity-and-authentication)
- [Checks and Source Map](#checks-and-source-map)
- [Feature Verification](#feature-verification)

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router + TypeScript |
| UI | Tailwind CSS v4, Radix UI primitives, Lucide React |
| Forms | React Hook Form + Zod |
| Tables / Charts | TanStack Table, Recharts |
| Backend | Next.js Route Handlers + TypeScript business layer |
| Database | Cloudflare D1, Drizzle ORM, Drizzle Kit |
| Hosting | OpenNext adapter → Cloudflare Workers |
| Auth | Custom database-backed cookie sessions (PBKDF2-SHA-256) |
| CI/CD | GitHub Actions (ci, deploy-production, migrate-production, security) |

---

## Start Locally

Requires **Node.js 22+**. From the repository root:

```sh
npm ci
cp .dev.vars.example .dev.vars
```

Set `SETUP_TOKEN` in `.dev.vars` to a long random string — never commit this file. Generate one with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Then initialise the local D1 database and start the dev server:

```sh
npm run db:local
npm run dev
```

> **PowerShell users:** use `Copy-Item .dev.vars.example .dev.vars` instead of `cp`.

Open `http://localhost:3000`. Choose **Set up your mess**, enter the setup token, your name, email, and a password of at least 12 characters. Only the first administrator can be created via setup. All subsequent visits use the sign-in form.

`http://localhost:3000/?demo=1` opens a clearly labelled demonstration. Sample records are generated in memory; demo changes are never written to D1 and disappear on reload.

---

## Deploy to Cloudflare Workers

The project requires no paid service dependencies, R2, external authentication, or a remote SQL server — only a Cloudflare account and a D1 database.

```sh
npx wrangler login
npx wrangler d1 create messbook
```

Copy the returned D1 database ID into `wrangler.jsonc`, replacing `REPLACE_WITH_D1_DATABASE_ID`. Keep the binding name `DB`.

```sh
npm run db:remote
npx wrangler secret put SETUP_TOKEN
npm run deploy
```

Supply a unique production setup token when prompted, open the deployed URL, and create your administrator. After successful setup:

```sh
npx wrangler secret delete SETUP_TOKEN
```

The database prevents a second setup independently of that secret. For a production-runtime local check, run `npm run preview`.

**Reference docs:**
- [OpenNext Cloudflare setup](https://opennext.js.org/cloudflare/get-started)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

---

## CI/CD & GitHub Actions

Four workflows with clearly separated responsibilities:

| Workflow | Trigger | Purpose | Production secrets |
|---|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | Push (non-`main`) + PR → `main` | typecheck → test → build | ❌ Never |
| [`deploy-production.yml`](.github/workflows/deploy-production.yml) | Push to `main` + manual | verify → deploy Worker | ✅ Deploy job only |
| [`migrate-production.yml`](.github/workflows/migrate-production.yml) | **Manual only** | Apply Drizzle D1 migrations | ✅ Yes |
| [`security.yml`](.github/workflows/security.yml) | PR → `main` + weekly Monday | `npm audit --audit-level=high` | ❌ Never |

### One-time GitHub setup

1. **Secrets** (Settings → Secrets → Actions):
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
2. **Environment** named `production` (Settings → Environments). Optionally add required reviewers.
3. **Branch protection** on `main` — require the `Typecheck, Test & Build` status check before merge.

### Everyday developer workflow

```
git checkout -b feature/my-feature
# code → commit → push
```
→ `ci.yml` runs (typecheck + test + build)
→ open PR → `ci.yml` + `security.yml` run
→ merge to `main` → `deploy-production.yml` auto-deploys ✅

**Schema changes:**
```
npm run db:generate   # review drizzle/<migration>.sql
npm run db:local      # test locally
# merge to main → auto Worker deploy
# GitHub Actions → "Migrate Production D1 Database" → Run workflow
```

---

## Daily Use

1. Add members, arrival/departure dates, and opening credit. Shared expenses use Equal, Manual, or Excluded allocation.
2. Open **Meals** → **Add meal**. Choose the date and Breakfast, Lunch, or Dinner. Editing an existing meal loads its items and attendance.
3. Add ingredient rows with item name, PKR price, and buyer. Member buyers receive automatic credit — no separate payment entry needed.
4. Select active members who ate, choose Oil/Gas/Chai entries used, and save once. Saving replaces the meal's charges and buyer credits.
5. In **Oil, gas & chai**, record each purchase and its buyer. Choose a direct split or average rates per meal.
6. Add shared expenses with buyer and allocation type. Record deposits, refunds, and reimbursements in **Payments & credit**.
7. Review settlements; select a member for their full statement. Positive balance = member owes the mess; negative = mess owes the member.
8. Close average resource entries with an end date and review over/undercharges. Use documented refunds or corrections as needed.
9. When someone leaves, set their departure and status to **Left**. Retain the record for financial history.

### Existing Data

Authenticated record access atomically converts legacy weighted shared expenses into exact Manual shares and removes old member weights. Original payloads remain in the audit history. Existing food, cooking, and attendance records are read together as one meal without deleting history.

---

## Filters and Exports

- **Date presets:** today, this month, last month, all time, and custom dates.
- **Search + filters** per module: meal, status, category, resource, tier, payment type, method, and member. Meals also filter by eater/buyer role, resource used, missing attendance, and funding source.
- **Sortable, paginated tables**; CSV exports include all rows matching current filters, not just the visible page.
- Settlements are cumulative through the selected end date. Changing the period never discards earlier balances.
- Audit events are stored in UTC; business dates use Pakistan time. Load older activity to search beyond the first 200 events.

---

## Accounting Decisions

The supplied specification contains a contradictory formula. This implementation follows the detailed ledger rules (section 5):

```
Net due = food charges
        + applied average-tier oil/gas/chai
        + direct oil/gas/chai purchase splits
        + allocated shared expenses
        − opening credit
        − deposits
        − member-paid purchases (automatic or legacy credit)
        + refunds
        + reimbursements
```

Money is stored as **integer paisa**. Largest-remainder apportionment distributes residual paisa deterministically by member ID, preserving the exact original amount. Displayed average cost per eater is informational; individual shares may differ by one paisa.

---

## Integrity and Authentication

- Server-side Zod validation prevents duplicate logs, invalid references, invalid dates, out-of-stay attendance, zero-weight allocations, and non-reconciling manual allocations.
- All financial edits record actor, timestamp, before value, and after value.
- A **revision guard + atomic D1 batch** rejects concurrent stale writes.
- Passwords are hashed with **PBKDF2-SHA-256** (100,000 iterations, Web Crypto API). Policy: 12–128 characters. Login attempts are rate-limited by account and IP.
- Session tokens are random; only token hashes are stored. Expiry: 7 days. Cookies: `HttpOnly`, `SameSite=Strict`, `Secure` in production. Logout revokes the stored session.
- Mutations require a same-origin request, a valid session, and Zod validation. Financial data endpoints are not cached.

> ⚠️ No email-based password recovery exists in v1. Keep administrator credentials safely. Any operator-assisted reset must hash the replacement password and revoke existing sessions.

---

## Checks and Source Map

```sh
npm run typecheck   # TypeScript strict check
npm test            # accounting unit tests
npm run build       # Next.js production build
```

| Path | Purpose |
|---|---|
| `src/lib/settlement.ts` | Independent accounting service |
| `src/lib/validation.ts` | Cross-record invariants + rate snapshots |
| `src/app/api/` | Auth and financial Route Handlers |
| `src/db/schema.ts` | Drizzle schema |
| `drizzle/` | Migrations and Drizzle metadata |
| `src/components/` | Responsive UI, forms, tables, charts |
| `.github/workflows/` | CI, deploy, migrate, security workflows |

For schema changes: `npm run db:generate` → review migration → test locally → apply remotely. **Back up D1 before any production schema change.** The audit trail is not a substitute for database backups.

---

## Feature Verification

```sh
npm test
npm run typecheck
npm run build:worker   # verifies the Cloudflare bundle
```

The optional local integration suite:

```sh
node --import tsx tests/api-integration.mts
```

Requires Node 24, an empty local D1 database, and `.dev.vars`. It refuses an existing administrator workspace and removes its own test records and account afterward. It never targets a remote database.
