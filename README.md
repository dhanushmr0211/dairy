# Dairy Management System Backend

Production-ready Node.js + Express + PostgreSQL (Neon DB) backend for comprehensive dairy management:
- 👨‍🌾 **Farmer Management:** Active/inactive status lifecycle, registrations, summaries
- 🔄 **Payment Cycles:** 15-day and 30-day billing periods, consecutive non-overlapping cycles, live live rates
- 🥛 **Milk Collection:** Date-matched auto-assignment to cycles, shift validation (morning/evening), date constraints
- 🌾 **Feed & Supplies Deduction:** Automatic deduction for feed records within the cycle date window
- 💳 **Live Payment Calculator & Settlements:** Multi-filter pending queue, live selection & after-payment simulation calculator, atomic multi-cycle batch settlements
- 📊 **Main Dashboard:** Real-time metrics across collections, shift-level totals, and pending/overdue dues

---

## 1. Database Setup & Migrations (Neon DB)

### Initial Setup
Run `/db/schema.sql` in your Neon PostgreSQL database SQL Editor.

### Existing Database Migration
Execute `/db/migrations/001_payment_cycles_and_farmer_status.sql` and `/db/migrations/002_allow_multiple_cycles_prevent_overlap.sql` in your Neon database.

---

## 2. Environment Variables

Create a `.env` file from `.env.example`:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `PORT` | HTTP server port | `5000` |
| `DATABASE_URL` | Neon PostgreSQL connection string (SSL required) | `postgresql://user:pass@ep-xyz.us-east-2.aws.neon.tech/dairy?sslmode=require` |
| `NODE_ENV` | Environment mode | `production` or `development` |
| `CORS_ORIGIN` | Allowed CORS origins (comma-separated or `*`) | `https://dairy-beta-one.vercel.app,http://localhost:5173` |

---

## 3. Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and supply your Neon DATABASE_URL

# 3. Run automated calculator tests
node test/test_calculator.js

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
- **`POST /payments/selected`**  
  *Request:*
  ```json
  {
    "cycleIds": [1, 3]
  }
  ```
  *Response:*
  ```json
  {
    "success": true,
    "selected": {
      "cycleCount": 2,
      "farmerCount": 1,
      "amount": 13800.00
    },
    "selectedCycles": [
      {
        "cycleId": 1,
        "farmerId": 1,
        "farmerName": "Ramesh",
        "farmerPhone": "9876543210",
        "startDate": "2026-10-01",
        "endDate": "2026-10-15",
        "paymentDueDate": "2026-10-15",
        "durationDays": 15,
        "ratePerLiter": 42.00,
        "totalLiters": 160.00,
        "grossAmount": 6720.00,
        "feedDeduction": 750.00,
        "finalAmount": 5970.00,
        "status": "pending_payment",
        "isOverdue": true,
        "daysRemaining": -5
      }
    ],
    "current": {
      "overdueAmount": 25000.00,
      "pendingAmount": 85000.00,
      "totalOutstanding": 110000.00,
      "overdueCycleCount": 4,
      "pendingCycleCount": 12
    },
    "afterPayment": {
      "overdueAmount": 10700.00,
      "pendingAmount": 85000.00,
      "totalOutstanding": 95700.00,
      "overdueCycleCount": 2,
      "pendingCycleCount": 10
    }
  }
  ```

#### 3. Live Financial Summary
- **`GET /payments/financial-summary`**  
  *Response:*
  ```json
  {
    "success": true,
    "current": {
      "overdueAmount": 25000.00,
      "pendingAmount": 85000.00,
      "totalOutstanding": 110000.00,
      "overdueCycleCount": 4,
      "pendingCycleCount": 12
    }
  }
  ```

#### 4. Batch & Single Settlements
- **`POST /payments/pay-selected`** — Atomically settle multiple selected cycles in a single PostgreSQL transaction
- **`POST /payments/pay`** — Settle a single cycle
- **`GET /payments/preview/:cycleId`** — Preview calculation for a single cycle
- **`GET /payments/:farmerId`** — Historical payment records for a farmer (newest first)

---

## 5. Render Deployment Instructions

1. Push this repository to GitHub.
2. Ensure Neon DB has migrations applied.
3. Render auto-deploys upon push.
