# Dairy Management System Backend

Production-ready Node.js + Express + PostgreSQL (Neon DB) backend for comprehensive dairy management:
- 👨‍🌾 **Farmer Management:** Active/inactive status lifecycle, registrations, summaries
- 🔄 **Payment Cycles:** 15-day and 30-day billing periods, flexible rates per liter, payment due dates
- 🥛 **Milk Collection:** Automatic association with active cycles, shift validation (morning/evening), date constraints
- 🌾 **Feed & Supplies Deduction:** Automatic deduction for feed records within the cycle date window
- 💳 **Cycle Payments & Settlements:** Single & atomic multi-farmer settlements, payout previews, upcoming/due/overdue queues, complete payment history
- 📊 **Main Dashboard:** Real-time metrics across collections, shift-level totals, and pending dues

---

## 1. Database Setup & Migrations (Neon DB)

### Initial Setup
Run `/db/schema.sql` in your Neon PostgreSQL database SQL Editor.

### Existing Database Migration
If updating an existing database, execute `/db/migrations/001_payment_cycles_and_farmer_status.sql`:

```sql
-- 1. Add status to farmers
ALTER TABLE farmers 
ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'active' 
CHECK (status IN ('active', 'inactive'));

CREATE INDEX IF NOT EXISTS idx_farmers_status ON farmers (status);

-- 2. Add duration_days and payment_due_date to farmer_cycles
ALTER TABLE farmer_cycles 
ADD COLUMN IF NOT EXISTS duration_days INT DEFAULT 15 CHECK (duration_days IN (15, 30));

UPDATE farmer_cycles 
SET duration_days = CASE 
    WHEN (end_date - start_date + 1) >= 28 THEN 30 
    ELSE 15 
END 
WHERE duration_days IS NULL;

ALTER TABLE farmer_cycles 
ADD COLUMN IF NOT EXISTS payment_due_date DATE;

UPDATE farmer_cycles 
SET payment_due_date = end_date 
WHERE payment_due_date IS NULL;

-- 3. Expand farmer_cycles status constraint to support ('active', 'pending_payment', 'paid')
ALTER TABLE farmer_cycles ALTER COLUMN status TYPE VARCHAR(20);

ALTER TABLE farmer_cycles DROP CONSTRAINT IF EXISTS farmer_cycles_status_check;
ALTER TABLE farmer_cycles ADD CONSTRAINT farmer_cycles_status_check CHECK (status IN ('active', 'pending_payment', 'paid'));

-- 4. Update partial unique index to allow only ONE active/pending_payment cycle per farmer
DROP INDEX IF EXISTS idx_farmer_one_active_cycle;
CREATE UNIQUE INDEX IF NOT EXISTS idx_farmer_one_active_cycle
    ON farmer_cycles (farmer_id)
    WHERE status IN ('active', 'pending_payment');

-- 5. Additional index for due dates and statuses
CREATE INDEX IF NOT EXISTS idx_farmer_cycles_status_due_date
    ON farmer_cycles (status, payment_due_date);
```

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

# 3. Start development server (with nodemon auto-restart)
npm run dev

# 4. Or start production server
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
  ```json
  // Request
  { "name": "Ramesh", "phone": "9876543210", "status": "active" }
  ```
- **`GET /farmers`** — List all farmers (optional query: `?status=active` or `?status=inactive`)
- **`GET /farmers/:id/summary`** — Full summary of farmer's active cycle, total milk, feed deductions, and net payout
- **`PATCH /farmers/:id/status`** — Update farmer status (`active` / `inactive`)
  ```json
  // Request
  { "status": "inactive" }
  ```

---

### 🔄 Cycles
- **`POST /cycles/start`** — Start a 15 or 30-day billing cycle
  ```json
  // Request
  {
    "farmerId": 1,
    "startDate": "2026-10-01",
    "durationDays": 15,
    "ratePerLiter": 42.50,
    "paymentDueDate": "2026-10-15" // optional, defaults to end date
  }
  ```
- **`GET /cycles/active/:farmerId`** — Get the current active/pending cycle for a farmer

---

### 🥛 Milk Entries
- **`POST /milk`** — Record daily morning or evening milk entry (automatically attached to active cycle)
  ```json
  // Request
  {
    "farmerId": 1,
    "date": "2026-10-02",
    "time": "morning", // "morning" or "evening"
    "liters": 12.50
  }
  ```
- **`GET /milk/:farmerId`** — List all milk records for a farmer

---

### 🌾 Feed & Supplies
- **`POST /feed`** — Record feed/supply issued to a farmer
  ```json
  // Request
  {
    "farmerId": 1,
    "date": "2026-10-03",
    "item": "Cattle Feed (50kg)",
    "quantity": 1,
    "amount": 750.00
  }
  ```
- **`GET /feed/:farmerId`** — List all feed purchase records for a farmer

---

### 💳 Payments & Settlements
- **`GET /payments/preview/:cycleId`** — Preview calculation for a specific cycle without marking it paid
- **`GET /payments/upcoming`** — List unpaid cycles categorized into `overdue`, `due_today`, and `upcoming` (optional: `?days=7`)
- **`GET /payments/summary`** — Summary metrics (farmers due today, overdue count/amount, upcoming count/amount, total pending dues)
- **`POST /payments/selected`** — Preview multi-farmer settlement totals before payment
  ```json
  // Request
  { "cycleIds": [1, 2, 3] }
  ```
- **`POST /payments/pay-selected`** — Atomically settle multiple selected cycles in a single PostgreSQL transaction
  ```json
  // Request
  {
    "cycleIds": [1, 2, 3],
    "paidDate": "2026-10-15"
  }
  ```
- **`POST /payments/pay`** — Settle a single cycle
  ```json
  // Request
  {
    "cycleId": 1,
    "paidDate": "2026-10-15"
  }
  ```
- **`GET /payments/:farmerId`** — Complete historical payments for a farmer (newest first)

---

### 📊 Main Dashboard
- **`GET /dashboard`** — Real-time metrics
  ```json
  // Response
  {
    "success": true,
    "active_farmer_count": 12,
    "today_morning_milk": 140.50,
    "today_evening_milk": 115.00,
    "today_total_milk": 255.50,
    "farmers_due_today": 2,
    "amount_due_today": 12500.00,
    "overdue_farmers": 1,
    "overdue_amount": 6200.00,
    "upcoming_payment_count": 9,
    "upcoming_payment_amount": 54000.00,
    "total_pending_payment_amount": 72700.00,
    "active_cycles_count": 12
  }
  ```

---

## 5. Render Deployment Instructions

1. Push this repository to GitHub.
2. In Render:
   - Create a **Web Service** and connect your repository.
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. Add the following **Environment Variables** in Render:
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = `your_neon_postgres_connection_string`
   - `CORS_ORIGIN` = `https://dairy-beta-one.vercel.app` (do not add trailing slashes)
4. Deploy and verify at `https://<your-render-subdomain>.onrender.com/health`.
