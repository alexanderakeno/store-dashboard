# Store Dashboard — Architecture Plan

Retail Sales & Store Operations Dashboard for a multi-brand store (Apple + Android + Accessories + VAS).
Next.js (App Router) + TypeScript, deployed to Vercel, data in Google Sheets.

> No store identity, spreadsheet IDs, credentials, staff names or sales numbers live in this repo.
> Everything comes from environment variables or from the spreadsheets at runtime.

---

## 1. Data sources

| Source | Lifetime | Contents | Access |
|---|---|---|---|
| **Monthly sheet** (one file per month, link registered in the app) | per month | `Control MR &SP` (final raw sales), `Target Store` (targets), archive tabs | read |
| **Master sheet** (one file, `MASTER_SHEET_ID`) | permanent | app tabs `APP_*`: months registry, settings, users, staff master, traffic, focus targets, supplier mapping, promo, feedback, checklist, SOH, historical raw, audit log | read/write |

The app **never writes** into the monthly sheet's formula tabs. All app inputs go to the master sheet.

### 1.1 `Control MR &SP` layout (detected by labels, not fixed rows)

Left block = **Merchandise Report** (anchor: header cell `Brand Name`), offsets from anchor:
`0 Brand · 1 Division · 2 Group · 3 Category · 4 Date · 5 "Article / Description" · 6 Qty · 7 Discount · 8 Net Sales`

Right block = **Sales Person** (anchor: header cell `Sales Name`), offsets from anchor:
`-2 Date · -1 NIK · 0 Sales Name · 1 "Article / Description" · 2 Invoice · 3 Amount · 4 Type · 5 Brand · 6 Details(Category)`

Daily control block (left): `Date · MR total · SP total · Difference`.

Only rows whose date falls in the **active month** are used (a new monthly file may still contain last month's rows before the first import).

### 1.2 `Target Store` layout (label based)
- `Total Target` row → store total + per-group totals (Apple / Android / Accessories / VAS)
- Sections `Apple`, `Android`, `Accessories`, `VAS`: `Target (IDR)` row = per-LOB/brand/supplier/provider targets, header row `Name | Target | <cols…> | Total`, staff rows until `Total`.

---

## 2. Business rules (single source: `lib/domain/*`)

### 2.1 Classification (one service, used by every page)
Input: SP line `{type, brand, category}`.

1. Brand ∈ VAS providers (`KOALA/QOALA→Qoala`, `TELKOMSEL`, `XL`, `INDOSAT`) → **VAS** (ignores type ACCESSORIES).
2. Override table (configurable) — default `SAMSUNG+WATCH → ACC`, `XIAOMI+WATCH → ACC` (matches the sheet's Data - Akeno totals).
3. `DEVICES` + brand `APPLE` → **Apple**; `DEVICES` + other brand → **Android**.
4. Everything else (`ACCESSORIES`, `MOTORIZED`, `MERCHANDISE`, `SUPPORTING`) → **ACC**.

LOB views (display only, never added to totals twice):
- Apple LOB: iPhone (PHONE), iPad (TABLETS), Mac (LAPTOPS), Apple Watch (WATCH), **AirPods** (Apple EARPHONES — achievement counted in ACC, shown in LOB).
- Android LOB: per brand (Samsung, Oppo, Xiaomi, Huawei, Motorola, Infinix, …).
- ACC supplier (Third Party / ACC Fokus): brand→supplier mapping (default: Dino = MICROPACK, A.ELEMENTS, ZAAG · iBack = IBACKS · IGA = RAPTIC · Medpoin = MEDPOIN · Mutual = MUTURAL · Kaizen = —). Editable in Settings.

### 2.2 Channel
Lines without NIK and named `Mapemall` (configurable list) = **online channel**: counted in store totals, excluded from staff ranking.

### 2.3 Quantity inference (SP has no qty column)
SP amount = qty × unit price. For each SP line:
1. Candidate unit prices = distinct `net/qty` of that article in MR (current month), then historical prices.
2. Pick the highest price `p` where `amount / p` is a whole number ≥ 1 → qty.
3. Amount 0 (bundled/free) → qty 1. Negative amount → qty −1 × inferred.
4. Otherwise qty 1, flagged `uncertain`.
5. Reconcile per article: Σ inferred qty vs MR qty → mismatches listed in the reconciliation panel.

Verified on Sept 2026 data: all merchandise articles reconcile; only zero-value shopping bags (SUPPORTING) differ, and those are excluded from Qty.

### 2.4 KPI definitions
| KPI | Formula |
|---|---|
| Sales | Σ SP amount (= Σ MR net; checked) |
| Achievement | Actual ÷ Target × 100 |
| Gap (variance) | Actual − Target |
| Estimate closing | MTD ÷ days elapsed × days in month (shown as "belum stabil" for the first 3 days) |
| Invoice / Transaction | count of **unique normalized invoice numbers** |
| Qty | Σ inferred qty where type ∈ {DEVICES, ACCESSORIES} (excludes MOTORIZED, MERCHANDISE, SUPPORTING) |
| UPT | Qty ÷ unique invoices |
| ATV | Sales ÷ unique invoices |
| CVR | Transactions ÷ Traffic × 100 (traffic entered manually in the app) |
| AR VAS/Qoala | VAS (Qoala) qty ÷ device qty |
| Growth | (Current − Previous) ÷ Previous × 100 |
| **Point** | per group `MIN(MTD ÷ (Target ÷ daysInMonth), cap)` — caps Apple 30, Android 30, ACC 30, VAS 10 (configurable). Est. Point uses the estimate instead of MTD. |

### 2.5 Periods
- Timezone Asia/Jakarta; API dates `YYYY-MM-DD`.
- Week = **Sunday–Saturday**, numbered within the month (Week 1 = week containing day 1, clipped to the month).
- Monthly = `YYYY-MM`; daily target = monthly target ÷ days in month (until a daily-target rule is supplied).

### 2.6 Reconciliation checks (run on every load, shown in Cut Off / Settings)
- Σ SP amount = Σ MR net (per day and total)
- Σ staff sales + channel sales = store sales
- Σ staff qty = store qty; Σ invoice detail = invoice count
- Apple + Android + ACC + VAS = total (no double count)

---

## 3. Folder structure
```
app/                     Next.js routes (App Router)
  (auth)/login
  (app)/home | sales | staff | focus | weekly | compare | promo | feedback | cx | checklist | stock | cutoff | settings
  api/                   route handlers (server only)
components/
  ui/                    Card, KpiCard, Progress, Badge, Pill, Tabs, BottomSheet, Skeleton, EmptyState, ErrorState
  layout/                BottomNav, Sidebar, MoreSheet, Header
  modules/               feature components per page
config/                  app identity (env), business defaults
lib/
  domain/                normalize, classify, qty, period, kpi, point, reconcile  (pure, unit-tested)
  parsers/               controlSheet, targetStore (2D values → typed rows)
  repositories/          DataSource interface (types.ts) + factory (index.ts)
    sheets/              Google Sheets REST client + master/monthly implementation
    fixture/             synthetic in-memory implementation (DATA_SOURCE=fixture)
  auth/                  token (jose JWT), session (bcrypt login, guards), rateLimit
  cache/                 server cache with TTL + force refresh, `lastUpdated`
  services/dashboard.ts  month snapshot: load → parse → enrich → reconcile (cached)
  domain/views.ts        page view-models (home, daily, day detail, staff, focus, weekly)
proxy.ts                 Next 16 proxy (ex-middleware): optimistic auth gate
types/                   data contracts
tests/                   unit tests (node:test)
```

## 4. Auth
- Login with NIK + password. Admin = `ADMIN_NIK` + `ADMIN_PASSWORD_HASH` (bcrypt, env). Viewer accounts in master sheet `APP_Users` (bcrypt hashes only).
- Session = signed JWT (`SESSION_SECRET`) in HTTP-only, Secure, SameSite=Lax cookie, 12h expiry; middleware protects all routes except `/login`.
- Login rate limit per IP + NIK. All write endpoints require role `admin`.

## 5. Env variables
```
APP_NAME= STORE_NAME= STORE_CODE= STORE_LOCATION= TIMEZONE=Asia/Jakarta CURRENCY=IDR
MASTER_SHEET_ID= GOOGLE_SERVICE_ACCOUNT_EMAIL= GOOGLE_PRIVATE_KEY=
SALES_SHEET_NAME="Control MR &SP" TARGET_SHEET_NAME="Target Store"
SESSION_SECRET= ADMIN_NIK= ADMIN_PASSWORD_HASH=
DATA_SOURCE=sheets            # "fixture" only for local development
```

## 6. Module status
| Module | Status |
|---|---|
| Home, Daily Sales (+UPT/Invoice/Qty drilldown), Daily Summary, Staff, LOB, VAS, Point, Share Daily | **built (phase 1)** |
| Cut Off & reconciliation, Settings (months, traffic, viewers, rules) | **built (phase 1)** |
| Product Focus (LOB/VAS/ACC supplier) | targets entered in app |
| Weekly | **built (phase 1)** · Weekly Reason: phase 2 |
| Compare / YTD / LFL | waiting for historical import |
| Traffic / CVR | **built** — input in Settings |
| Promo, Feedback, Checklist, BNPL & Trade-In, Mading | app input (M238-style) |
| SOH / Stokan / Stock Request + email | waiting for SOH file sample |
| Est. Incentive | waiting for incentive scheme |
| CX & Member | later (user decision) |
