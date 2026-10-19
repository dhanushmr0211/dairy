-- ==========================================================
-- Migration 003: Wallet Ledger & Automatic Distribution
-- Neon PostgreSQL Compatible
-- ==========================================================

-- 1. Wallet Ledger – The single source of truth for all money movements
CREATE TABLE IF NOT EXISTS wallet_ledger (
    id BIGSERIAL PRIMARY KEY,
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('receipt', 'farmer_payment', 'adjustment')),
    amount NUMERIC(14,2) NOT NULL,
    running_balance NUMERIC(14,2) NOT NULL,
    transaction_date DATE NOT NULL,
    reference VARCHAR(100),
    description TEXT,
    related_distribution_id BIGINT,  -- FK added after distribution_previews is created
    related_payment_id BIGINT,       -- FK to payments(id)
    idempotency_key VARCHAR(100) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_type
    ON wallet_ledger (transaction_type);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_date
    ON wallet_ledger (transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_reference
    ON wallet_ledger (reference) WHERE reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created_at
    ON wallet_ledger (created_at DESC);

-- Partial unique index on non-null references to prevent duplicate receipts
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_unique_receipt_reference
    ON wallet_ledger (reference) WHERE transaction_type = 'receipt' AND reference IS NOT NULL AND reference != '';

-- 2. Distribution Previews – snapshot of each proposed/confirmed distribution
CREATE TABLE IF NOT EXISTS distribution_previews (
    id BIGSERIAL PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired', 'rejected')),
    mode VARCHAR(20) NOT NULL DEFAULT 'BELOW_BALANCE' CHECK (mode IN ('BELOW_BALANCE', 'WITHIN_MARGIN')),
    margin NUMERIC(10,2) NOT NULL DEFAULT 500.00,
    wallet_balance_at_preview NUMERIC(14,2) NOT NULL,
    proposed_total NUMERIC(14,2) NOT NULL,
    selected_cycle_count INT NOT NULL DEFAULT 0,
    selected_farmer_count INT NOT NULL DEFAULT 0,
    remaining_balance NUMERIC(14,2) NOT NULL,
    shortfall NUMERIC(14,2) NOT NULL DEFAULT 0,
    next_unselected_reason TEXT,
    preview_hash VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(100) UNIQUE,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')
);

CREATE INDEX IF NOT EXISTS idx_distribution_previews_status
    ON distribution_previews (status);

CREATE INDEX IF NOT EXISTS idx_distribution_previews_created_at
    ON distribution_previews (created_at DESC);

-- 3. Distribution Cycles – links previews to the cycles they select
CREATE TABLE IF NOT EXISTS distribution_cycles (
    id BIGSERIAL PRIMARY KEY,
    distribution_id BIGINT NOT NULL REFERENCES distribution_previews(id),
    cycle_id BIGINT NOT NULL REFERENCES farmer_cycles(id),
    farmer_id BIGINT NOT NULL REFERENCES farmers(id),
    calculated_amount NUMERIC(14,2) NOT NULL,
    payment_id BIGINT,  -- populated on confirm, FK to payments(id)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT distribution_cycles_unique UNIQUE (distribution_id, cycle_id)
);

CREATE INDEX IF NOT EXISTS idx_distribution_cycles_dist_id
    ON distribution_cycles (distribution_id);

CREATE INDEX IF NOT EXISTS idx_distribution_cycles_cycle_id
    ON distribution_cycles (cycle_id);

-- 4. Add foreign keys that reference newly created tables
ALTER TABLE wallet_ledger
    ADD CONSTRAINT fk_wallet_ledger_distribution
    FOREIGN KEY (related_distribution_id) REFERENCES distribution_previews(id);

ALTER TABLE wallet_ledger
    ADD CONSTRAINT fk_wallet_ledger_payment
    FOREIGN KEY (related_payment_id) REFERENCES payments(id);

ALTER TABLE distribution_cycles
    ADD CONSTRAINT fk_distribution_cycles_payment
    FOREIGN KEY (payment_id) REFERENCES payments(id);
