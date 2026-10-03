# Dairy Management System Backend

Node.js + Express + PostgreSQL (Neon DB) backend for managing:
- Farmers
- Milk billing cycles
- Milk entries
- Feed records
- Cycle payments

## 1) SQL Queries for Neon DB

Run `/db/schema.sql` in your Neon PostgreSQL database.

```sql
CREATE TABLE IF NOT EXISTS farmers (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS farmer_cycles (
    id BIGSERIAL PRIMARY KEY,
    farmer_id BIGINT NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    rate_per_liter NUMERIC(10,2) NOT NULL CHECK (rate_per_liter > 0),
    status VARCHAR(10) NOT NULL CHECK (status IN ('active', 'paid')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cycle_date_range_check CHECK (end_date >= start_date),
    CONSTRAINT farmer_cycles_id_farmer_unique UNIQUE (id, farmer_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_farmer_one_active_cycle
    ON farmer_cycles (farmer_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_farmer_cycles_farmer_id_status
    ON farmer_cycles (farmer_id, status);

CREATE TABLE IF NOT EXISTS milk_entries (
    id BIGSERIAL PRIMARY KEY,
    farmer_id BIGINT NOT NULL,
    cycle_id BIGINT NOT NULL,
    date DATE NOT NULL,
    time VARCHAR(10) NOT NULL CHECK (time IN ('morning', 'evening')),
    liters NUMERIC(10,2) NOT NULL CHECK (liters > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT milk_entries_farmer_fk FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE,
    CONSTRAINT milk_entries_cycle_farmer_fk FOREIGN KEY (cycle_id, farmer_id) REFERENCES farmer_cycles(id, farmer_id) ON DELETE CASCADE,
    CONSTRAINT milk_unique_farmer_shift UNIQUE (farmer_id, date, time)
);

CREATE INDEX IF NOT EXISTS idx_milk_entries_farmer_date
    ON milk_entries (farmer_id, date);

CREATE INDEX IF NOT EXISTS idx_milk_entries_cycle_id
    ON milk_entries (cycle_id);

CREATE TABLE IF NOT EXISTS feed_records (
    id BIGSERIAL PRIMARY KEY,
    farmer_id BIGINT NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    item VARCHAR(100) NOT NULL,
    quantity NUMERIC(10,2) NOT NULL CHECK (quantity >= 0),
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feed_records_farmer_date
    ON feed_records (farmer_id, date);

CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    cycle_id BIGINT NOT NULL UNIQUE REFERENCES farmer_cycles(id) ON DELETE CASCADE,
    total_liters NUMERIC(12,2) NOT NULL CHECK (total_liters >= 0),
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    feed_deduction NUMERIC(12,2) NOT NULL CHECK (feed_deduction >= 0),
    final_amount NUMERIC(12,2) NOT NULL,
    paid_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_paid_date
    ON payments (paid_date);
```

## 2) Backend Project Structure

```text
dairy/
├── db/
│   └── schema.sql
├── src/
│   ├── config/
│   │   └── db.js
│   ├── controllers/
│   │   ├── cycleController.js
│   │   ├── farmerController.js
│   │   ├── feedController.js
│   │   ├── milkController.js
│   │   └── paymentController.js
│   ├── middleware/
│   │   └── errorHandler.js
│   ├── models/
│   │   ├── cycleModel.js
│   │   ├── farmerModel.js
│   │   ├── feedModel.js
│   │   ├── milkModel.js
│   │   └── paymentModel.js
│   ├── routes/
│   │   ├── cycleRoutes.js
│   │   ├── farmerRoutes.js
│   │   ├── feedRoutes.js
│   │   ├── milkRoutes.js
│   │   └── paymentRoutes.js
│   ├── utils/
│   │   └── asyncHandler.js
│   ├── app.js
│   └── server.js
├── .env.example
├── package.json
└── README.md
```

## 3) Setup

```bash
npm install
cp .env.example .env
# set DATABASE_URL in .env
npm run dev
```

## 4) REST API Endpoints

### Farmers
- `POST /farmers` - Add farmer
- `GET /farmers` - List all farmers

### Cycles
- `POST /cycles/start` - Start new cycle with duration and rate
- `GET /cycles/active/:farmerId` - Get active cycle

### Milk
- `POST /milk` - Add milk entry (auto attaches to active cycle)
- `GET /milk/:farmerId` - Get milk entries

### Feed
- `POST /feed` - Add feed record
- `GET /feed/:farmerId` - Get feed records

### Payments
- `POST /payments/pay` - Mark cycle as paid and calculate totals
- `GET /payments/:farmerId` - Get farmer payment history

## 5) Example Request/Response JSON

### Add Farmer
**POST** `/farmers`

Request:
```json
{
  "name": "Ramesh",
  "phone": "9876543210"
}
```

Response:
```json
{
  "id": 1,
  "name": "Ramesh",
  "phone": "9876543210"
}
```

### Start Cycle
**POST** `/cycles/start`

Request:
```json
{
  "farmerId": 1,
  "startDate": "2026-10-01",
  "durationDays": 15,
  "ratePerLiter": 42.5
}
```

Response:
```json
{
  "id": 1,
  "farmer_id": "1",
  "start_date": "2026-10-01T00:00:00.000Z",
  "end_date": "2026-10-15T00:00:00.000Z",
  "rate_per_liter": "42.50",
  "status": "active"
}
```

### Add Milk Entry
**POST** `/milk`

Request:
```json
{
  "farmerId": 1,
  "date": "2026-10-02",
  "time": "morning",
  "liters": 12.5
}
```

Response:
```json
{
  "id": 1,
  "farmer_id": "1",
  "cycle_id": "1",
  "date": "2026-10-02T00:00:00.000Z",
  "time": "morning",
  "liters": "12.50"
}
```

### Add Feed Record
**POST** `/feed`

Request:
```json
{
  "farmerId": 1,
  "date": "2026-10-03",
  "item": "Cattle Feed",
  "quantity": 25,
  "amount": 750
}
```

Response:
```json
{
  "id": 1,
  "farmer_id": "1",
  "date": "2026-10-03T00:00:00.000Z",
  "item": "Cattle Feed",
  "quantity": "25.00",
  "amount": "750.00"
}
```

### Pay Cycle
**POST** `/payments/pay`

Request:
```json
{
  "cycleId": 1,
  "paidDate": "2026-10-15"
}
```

Response:
```json
{
  "id": 1,
  "cycle_id": "1",
  "total_liters": "160.00",
  "total_amount": "6800.00",
  "feed_deduction": "750.00",
  "final_amount": "6050.00",
  "paid_date": "2026-10-15T00:00:00.000Z"
}
```

## 6) Business Logic Implemented

- Total Milk = `SUM(liters)` per cycle
- Total Amount = `total_liters × rate_per_liter`
- Final Amount = `total_amount - feed_deduction`
- Milk entry stores no rate and uses active cycle automatically
- Only one active cycle per farmer enforced by partial unique index
