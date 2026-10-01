# Store Dashboard

Retail sales & store-operations dashboard (Next.js 16 App Router + TypeScript), data from Google Sheets.
Business rules and data contracts: see `ARCHITECTURE.md` and `DECISIONS.md`.

## Local development (synthetic data)

```bash
npm install
cp .env.example .env.local
#   DATA_SOURCE=fixture
#   SESSION_SECRET=$(openssl rand -base64 48)
#   ADMIN_NIK=<your NIK>
#   ADMIN_PASSWORD_HASH=$(npm run -s hash-password -- "<password>")
npm run dev            # http://localhost:3000
npm test               # unit tests (node:test via tsx)
npm run typecheck
```

`DATA_SOURCE=fixture` generates a deterministic synthetic month (placeholder staff, fake articles) and
runs it through the **real** parsers, so every page works without credentials. A "DATA SINTETIS" badge is shown.

## Production (Vercel + Google Sheets)

1. Google Cloud: create a service account, enable **Google Sheets API**, create a JSON key.
2. Create an empty **master sheet**; share it with the service-account email as **Editor**.
   The app creates its tabs on first use: `APP_Months`, `APP_Settings`, `APP_Users`, `APP_Traffic`, `APP_Audit`.
3. Share every **monthly sheet** with the service-account email as **Viewer** (the app never writes to it).
4. Vercel → Environment Variables (see `.env.example`): `DATA_SOURCE=sheets`, `MASTER_SHEET_ID`,
   `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (with `\n`), `SESSION_SECRET`, `ADMIN_NIK`,
   `ADMIN_PASSWORD_HASH`, store identity vars.
5. Log in as admin → **Settings** → register the month: paste the monthly sheet link → *Tes koneksi* → *Simpan*.
   Repeat each month. Enter daily traffic there for CVR. Create viewer accounts (read-only) there.

Data is cached per server instance for `CACHE_TTL_SECONDS` (default 300 s). Admin **↻ Refresh** re-reads now.

## Phase 1 — what's included

| Area | Status |
|---|---|
| Domain engine (normalize, classify, qty inference, KPI, point, reconcile) | done, unit-tested |
| Parsers `Control MR &SP`, `Target Store` (label-based) | done |
| Data layer: Sheets client, master-sheet repositories, fixture source, TTL cache | done |
| Auth: NIK + password, bcrypt, JWT HTTP-only cookie (12 h), proxy gate, login rate limit, admin-only writes, audit log | done |
| Pages: Home (KPI, point, groups, daily chart, top staff, Share Daily), Daily Sales (+ invoice drill-down), Staff, Product Focus (LOB / brand / supplier / provider), Weekly, Cut Off & reconciliation, Settings (months, traffic, viewers, business rules) | done |
| Compare/YTD/LFL, Promo, Feedback, Checklist, Stock/SOH, CX, Weekly Reason, Est. Incentive | phase 2+ (placeholders in the menu) |
