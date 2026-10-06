-- ==========================================================
-- Migration 002: Allow Multiple Cycles per Farmer & Prevent Date Overlap
-- Neon PostgreSQL Compatible
-- ==========================================================

-- 1. Drop the single-active-cycle constraint/index
DROP INDEX IF EXISTS idx_farmer_one_active_cycle;

-- 2. Enable btree_gist extension if available for range exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 3. Add exclusion constraint to prevent overlapping date ranges for the same farmer
-- Note: daterange(start_date, end_date, '[]') represents inclusive bounds [start_date, end_date]
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_cycles_per_farmer'
    ) THEN
        ALTER TABLE farmer_cycles
        ADD CONSTRAINT no_overlapping_cycles_per_farmer
        EXCLUDE USING gist (
            farmer_id WITH =,
            daterange(start_date, end_date, '[]') WITH &&
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Fallback: If btree_gist is not permitted, application-level overlap checks remain active
        RAISE NOTICE 'Exclusion constraint could not be applied automatically: %', SQLERRM;
END $$;

-- 4. Ensure index on farmer_id, start_date, end_date for fast overlap queries
CREATE INDEX IF NOT EXISTS idx_farmer_cycles_date_lookup
    ON farmer_cycles (farmer_id, start_date, end_date);
