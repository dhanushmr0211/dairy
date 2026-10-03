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
