-- ==========================================================
-- Migration 001: Payment Cycle Management & Farmer Status
-- Compatible with PostgreSQL / Neon DB
-- ==========================================================

-- 1. Add status to farmers
ALTER TABLE farmers 
ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'active' 
CHECK (status IN ('active', 'inactive'));

CREATE INDEX IF NOT EXISTS idx_farmers_status ON farmers (status);

-- 2. Add duration_days and payment_due_date to farmer_cycles
ALTER TABLE farmer_cycles 
ADD COLUMN IF NOT EXISTS duration_days INT DEFAULT 15 CHECK (duration_days IN (15, 30));

-- Populate existing rows
UPDATE farmer_cycles 
SET duration_days = CASE 
    WHEN (end_date - start_date + 1) >= 28 THEN 30 
    ELSE 15 
END 
WHERE duration_days IS NULL;

ALTER TABLE farmer_cycles 
ADD COLUMN IF NOT EXISTS payment_due_date DATE;

-- Default payment_due_date to end_date
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
