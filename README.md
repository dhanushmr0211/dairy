# Dairy Management System Backend

Production-ready Node.js + Express + PostgreSQL (Neon DB) backend for comprehensive dairy management:
- 👨‍🌾 **Farmer Management:** Active/inactive status lifecycle, registrations, summaries
- 🔄 **Payment Cycles:** 15-day and 30-day billing periods, consecutive non-overlapping cycles, live rates
- 🥛 **Milk Collection:** Date-matched auto-assignment to cycles, shift validation (morning/evening), date constraints
- 🌾 **Feed & Supplies Deduction:** Automatic deduction for feed records within the cycle date window
- 💳 **Live Payment Calculator & Settlements:** Multi-filter pending queue, live selection & after-payment simulation calculator, atomic multi-cycle batch settlements
- 📊 **Main Dashboard:** Real-time metrics across collections, shift-level totals, and pending/overdue dues
- 🏦 **Company Wallet & Ledger:** Track Hatsun payments, ledger-based balance, automatic farmer payment distribution

---

## 1. Database Setup & Migrations (Neon DB)

### Initial Setup
Run `/db/schema.sql` in your Neon PostgreSQL database SQL Editor.

### Existing Database Migration
Execute migrations **in order** in your Neon database:

```bash
# 1. Payment cycles and farmer status
db/migrations/001_payment_cycles_and_farmer_status.sql

# 2. Multiple cycles and overlap prevention
db/migrations/002_allow_multiple_cycles_prevent_overlap.sql

# 3. Wallet ledger and automatic distribution (NEW)
db/migrations/003_wallet_and_distribution.sql
```

> **Important:** Migration 003 creates `wallet_ledger`, `distribution_previews`, and `distribution_cycles` tables with all indexes and foreign keys. Run it only once.

---

## 2. Environment Variables

Create a `.env` file from `.env.example`:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `PORT` | HTTP server port | `5000` |
| `DATABASE_URL` | Neon PostgreSQL connection string (SSL required) | `postgresql://user:pass@ep-xyz.us-east-2.aws.neon.tech/dairy?sslmode=require` |
| `NODE_ENV` | Environment mode | `production` or `development` |
| `CORS_ORIGIN` | Allowed CORS origins (comma-separated or `*`) | `https://dairy-beta-one.vercel.app,http://localhost:5173` |
| `WALLET_MAX_MARGIN` | Max distribution margin in ₹ (default: 500) | `500` |

---

## 3. Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and supply your Neon DATABASE_URL

# 3. Run automated tests
npm test
# Or run wallet tests only:
npm run test:wallet

# 4. Start development server (with nodemon auto-restart)
npm run dev

# 5. Or start production server
npm start
```

---

## 4. REST API Reference

### 🏥 System Health
- **`GET /health`**  
  *Response:* `{"status": "ok"}`

---

### 👨‍🌾 Farmers
- **`POST /farmers`** — Register a new farmer
- **`GET /farmers`** — List all farmers (`?status=active` or `?status=inactive`)
- **`GET /farmers/:id/summary`** — Full summary of farmer's active cycle, total milk, feed deductions, and net payout
- **`PATCH /farmers/:id/status`** — Update farmer status (`active` / `inactive`)

---

### 🔄 Cycles
- **`POST /cycles/start`** — Start a 15 or 30-day billing cycle (prevents overlapping dates)
- **`GET /cycles/active/:farmerId`** — Get current active/pending cycle for a farmer
- **`GET /cycles/farmer/:farmerId`** — Get all historical and active cycles for a farmer

---

### 🥛 Milk Entries
- **`POST /milk`** — Record daily morning or evening milk entry (auto-matched by date to cycle)
- **`GET /milk/:farmerId`** — List all milk records for a farmer

---

### 🌾 Feed & Supplies
- **`POST /feed`** — Record feed/supply issued to a farmer
- **`GET /feed/:farmerId`** — List all feed purchase records for a farmer

---

### 💳 Live Payment Calculator & Settlements

#### 1. Filtered Unpaid Payments Queue
- **`GET /payments/pending`**  
  *Query Parameters (Combinable):*
  - `status`: `overdue`, `due_today`, `upcoming`, `pending`, `all`
  - `farmerId`: filter by specific farmer ID
  - `date`: filter by exact payment due date (`YYYY-MM-DD`)
  - `dateFrom`: payment due date $\ge$ `dateFrom`
  - `dateTo`: payment due date $\le$ `dateTo`
  - `duration`: `15` or `30`
  
  *Example:* `GET /payments/pending?status=overdue&farmerId=5`

#### 2. Live Selection & After-Payment Simulation Calculator
- **`POST /payments/selected`** — Preview selected cycles with before/after financial metrics

#### 3. Live Financial Summary
- **`GET /payments/financial-summary`** — Current overdue, pending, and total outstanding amounts

#### 4. Batch & Single Settlements
- **`POST /payments/pay-selected`** — Atomically settle multiple selected cycles in a single PostgreSQL transaction
- **`POST /payments/pay`** — Settle a single cycle
- **`GET /payments/preview/:cycleId`** — Preview calculation for a single cycle
- **`GET /payments/:farmerId`** — Historical payment records for a farmer (newest first)

---

### 🏦 Company Wallet & Automatic Distribution

#### Wallet Balance & Summary
- **`GET /wallet`** — Current wallet balance, reserved amount, and available balance
- **`GET /wallet/summary`** — Full summary: total received, total paid, adjustments, reserved
- **`GET /wallet/transactions`** — Full ledger history (newest first)

#### Receipts (Recording Hatsun Payments)
- **`POST /wallet/receipts`** — Record a received payment
  ```json
  {
    "amount": 50000,
    "receiptDate": "2026-10-03",
    "reference": "HATSUN-OCT-03",
    "notes": "October 3rd payment from Hatsun"
  }
  ```
  *Response:*
  ```json
  {
    "success": true,
    "receipt": {
      "id": 1,
      "amount": 50000,
      "runningBalance": 50000,
      "transactionDate": "2026-10-03",
      "reference": "HATSUN-OCT-03",
      "description": "October 3rd payment from Hatsun"
    }
  }
  ```
- **`GET /wallet/receipts`** — List all receipts

#### Automatic Distribution Preview
- **`POST /wallet/distribute/preview`** — Preview automatic farmer payment distribution
  ```json
  {
    "mode": "BELOW_BALANCE",
    "margin": 500
  }
  ```
  *Modes:*
  - `BELOW_BALANCE` (default): Select cycles while total ≤ wallet balance
  - `WITHIN_MARGIN`: Allow total to exceed balance by up to ₹margin (default ₹500)

  *Response:*
  ```json
  {
    "success": true,
    "previewId": 1,
    "walletBalance": 50000,
    "margin": 500,
    "mode": "BELOW_BALANCE",
    "selectedCycleCount": 3,
    "selectedFarmerCount": 3,
    "proposedTotal": 37000,
    "remainingBalance": 13000,
    "shortfall": 0,
    "nextUnselectedReason": "Cycle #8 (Ramesh) requires ₹15000 but...",
    "previewHash": "a1b2c3d4e5f6g7h8",
    "expiresAt": "2026-10-19T11:30:00.000Z",
    "selectedCycles": [],
    "unselectedCycles": []
  }
  ```

#### Confirm Distribution
- **`POST /wallet/distribute/confirm`** — Confirm and execute a distribution
  ```json
  {
    "previewId": 1,
    "previewHash": "a1b2c3d4e5f6g7h8",
    "idempotencyKey": "confirm-2026-10-19-001"
  }
  ```
  *This will:*
  1. Re-validate all selected cycles are still unpaid
  2. Recalculate amounts from the database
  3. Verify wallet has sufficient balance
  4. Create farmer payment records
  5. Mark cycles as paid
  6. Create wallet debit ledger entries
  7. All within a single PostgreSQL transaction

  *Response:*
  ```json
  {
    "success": true,
    "distributionId": 1,
    "farmerCount": 3,
    "cycleCount": 3,
    "totalAmount": 37000,
    "walletBalanceBefore": 50000,
    "walletBalanceAfter": 13000,
    "payments": []
  }
  ```

#### Distribution History
- **`GET /wallet/distributions`** — List all distribution previews/confirmations
- **`GET /wallet/distributions/:id`** — Detail of a specific distribution with its cycles

---

### 📊 Dashboard
- **`GET /dashboard`** — Full real-time dashboard including:
  - Farmer counts, milk totals, cycle counts
  - Payment summaries (overdue, due today, upcoming)
  - **Wallet information:** current balance, latest receipt, proposed distribution
  - **Before/after distribution simulation:** overdue and total outstanding amounts

---

## 5. Render Deployment Instructions

1. Push this repository to GitHub.
2. Ensure Neon DB has all migrations applied (001, 002, 003).
3. Set environment variables on Render:
   - `DATABASE_URL` — your Neon connection string
   - `NODE_ENV` — `production`
   - `CORS_ORIGIN` — your frontend URL(s)
   - `WALLET_MAX_MARGIN` — `500` (optional, defaults to 500)
4. Render auto-deploys upon push.

---

## 6. Architecture Notes

### Wallet Ledger
- Every money movement is a ledger entry with a running balance
- Balance is **derived** from the latest ledger entry's `running_balance`
- Negative balances are **never** permitted
- Receipts with duplicate `reference` numbers are rejected
- No arbitrary balance edits — only through typed ledger entries

### Distribution Flow
1. **Preview** (`POST /wallet/distribute/preview`) — reads balance, selects cycles oldest-first, returns proposal. Nothing changes in the database except the preview record.
2. **Confirm** (`POST /wallet/distribute/confirm`) — re-validates everything inside a PostgreSQL transaction with row-level locks. Creates actual payment records and wallet debits. Idempotent via `idempotencyKey`.

### Margin Modes
- **BELOW_BALANCE** (default): proposed total ≤ wallet balance
- **WITHIN_MARGIN**: proposed total ≤ wallet balance + margin (max ₹500). The shortfall is shown but actual confirmation still requires sufficient wallet funds.
