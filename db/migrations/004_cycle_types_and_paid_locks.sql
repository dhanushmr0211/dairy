-- ==========================================================
-- Migration 004: Cycle Types & Paid Cycle Locks
-- Neon PostgreSQL Compatible
-- ==========================================================

-- 1. Modify duration_days check constraint on farmer_cycles to support calendar months (28, 29, 30, 31)
ALTER TABLE farmer_cycles DROP CONSTRAINT IF EXISTS farmer_cycles_duration_days_check;
ALTER TABLE farmer_cycles ADD CONSTRAINT farmer_cycles_duration_days_check CHECK (duration_days > 0);

-- 2. Add cycle_type to farmer_cycles
ALTER TABLE farmer_cycles 
ADD COLUMN IF NOT EXISTS cycle_type VARCHAR(30) DEFAULT '15_days' 
CHECK (cycle_type IN ('15_days', '30_days', 'calendar_month'));

-- Backfill cycle_type based on duration_days
UPDATE farmer_cycles 
SET cycle_type = CASE 
    WHEN duration_days = 30 THEN '30_days' 
    WHEN duration_days = 15 THEN '15_days' 
    ELSE 'calendar_month' 
END 
WHERE cycle_type IS NULL;

-- 3. Trigger to permanently lock completed payment cycles on farmer_cycles
CREATE OR REPLACE FUNCTION check_farmer_cycle_paid_lock()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow administrative/test cleanup session override if explicitly requested
    IF current_setting('app.bypass_paid_locks', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- If cycle is already paid, block reopening/resetting or altering critical financial fields
        IF OLD.status = 'paid' THEN
            IF NEW.status != 'paid' THEN
                RAISE EXCEPTION 'Cannot reopen or reset a paid payment cycle.';
            END IF;
            IF NEW.rate_per_liter != OLD.rate_per_liter OR 
               NEW.start_date != OLD.start_date OR 
               NEW.end_date != OLD.end_date OR 
               NEW.farmer_id != OLD.farmer_id OR
               NEW.duration_days != OLD.duration_days THEN
                RAISE EXCEPTION 'Cannot modify rate, dates, or details of a paid payment cycle.';
            END IF;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status = 'paid' THEN
            RAISE EXCEPTION 'Cannot delete a paid payment cycle.';
        END IF;
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_farmer_cycle_paid_lock ON farmer_cycles;
CREATE TRIGGER trg_farmer_cycle_paid_lock
BEFORE UPDATE OR DELETE ON farmer_cycles
FOR EACH ROW EXECUTE FUNCTION check_farmer_cycle_paid_lock();

-- 4. Trigger to permanently block inserting, updating, or deleting milk entries for paid cycles
CREATE OR REPLACE FUNCTION check_milk_entry_paid_lock()
RETURNS TRIGGER AS $$
DECLARE
    cycle_st VARCHAR(20);
BEGIN
    IF current_setting('app.bypass_paid_locks', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT status INTO cycle_st FROM farmer_cycles WHERE id = NEW.cycle_id;
        IF cycle_st = 'paid' THEN
            RAISE EXCEPTION 'Cannot add milk entries to a paid payment cycle.';
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        SELECT status INTO cycle_st FROM farmer_cycles WHERE id = OLD.cycle_id;
        IF cycle_st = 'paid' THEN
            RAISE EXCEPTION 'Cannot modify milk entries for a paid payment cycle.';
        END IF;
        IF NEW.cycle_id != OLD.cycle_id THEN
            SELECT status INTO cycle_st FROM farmer_cycles WHERE id = NEW.cycle_id;
            IF cycle_st = 'paid' THEN
                RAISE EXCEPTION 'Cannot move milk entries to a paid payment cycle.';
            END IF;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        SELECT status INTO cycle_st FROM farmer_cycles WHERE id = OLD.cycle_id;
        IF cycle_st = 'paid' THEN
            RAISE EXCEPTION 'Cannot delete milk entries for a paid payment cycle.';
        END IF;
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_milk_entry_paid_lock ON milk_entries;
CREATE TRIGGER trg_milk_entry_paid_lock
BEFORE INSERT OR UPDATE OR DELETE ON milk_entries
FOR EACH ROW EXECUTE FUNCTION check_milk_entry_paid_lock();

-- 5. Trigger to permanently block inserting, updating, or deleting feed records belonging to dates of paid cycles
CREATE OR REPLACE FUNCTION check_feed_record_paid_lock()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.bypass_paid_locks', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF EXISTS (
            SELECT 1 FROM farmer_cycles 
            WHERE farmer_id = NEW.farmer_id 
              AND status = 'paid' 
              AND NEW.date BETWEEN start_date AND end_date
        ) THEN
            RAISE EXCEPTION 'Cannot add feed records for dates belonging to a paid payment cycle.';
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF EXISTS (
            SELECT 1 FROM farmer_cycles 
            WHERE farmer_id = OLD.farmer_id 
              AND status = 'paid' 
              AND OLD.date BETWEEN start_date AND end_date
        ) OR EXISTS (
            SELECT 1 FROM farmer_cycles 
            WHERE farmer_id = NEW.farmer_id 
              AND status = 'paid' 
              AND NEW.date BETWEEN start_date AND end_date
        ) THEN
            RAISE EXCEPTION 'Cannot modify feed records for dates belonging to a paid payment cycle.';
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF EXISTS (
            SELECT 1 FROM farmer_cycles 
            WHERE farmer_id = OLD.farmer_id 
              AND status = 'paid' 
              AND OLD.date BETWEEN start_date AND end_date
        ) THEN
            RAISE EXCEPTION 'Cannot delete feed records for dates belonging to a paid payment cycle.';
        END IF;
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feed_record_paid_lock ON feed_records;
CREATE TRIGGER trg_feed_record_paid_lock
BEFORE INSERT OR UPDATE OR DELETE ON feed_records
FOR EACH ROW EXECUTE FUNCTION check_feed_record_paid_lock();

-- 6. Trigger to permanently block updates and deletions on completed payment records
CREATE OR REPLACE FUNCTION check_payment_immutable()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.bypass_paid_locks', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Completed payment records cannot be edited.';
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Completed payment records cannot be deleted.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_immutable ON payments;
CREATE TRIGGER trg_payment_immutable
BEFORE UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION check_payment_immutable();
