-- Migration 005: Allow negative final_amount in payments table
-- Business rule: when feed deduction exceeds gross amount, the farmer owes the dairy.
-- The final_amount must be allowed to be negative, zero, or positive.

-- Drop the non-negative constraint on payments.final_amount
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_final_amount_check;

-- Verify: no constraint blocks negative values. The column remains NUMERIC(12,2) NOT NULL.
