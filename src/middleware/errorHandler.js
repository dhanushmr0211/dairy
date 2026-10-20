function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Route not found' });
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  // PostgreSQL PL/pgSQL RAISE EXCEPTION (from triggers or custom checks)
  if (err.code === 'P0001') {
    return res.status(409).json({
      success: false,
      message: err.message || 'Operation violates payment cycle lock constraints.',
    });
  }

  // PostgreSQL Exclusion Constraint Violation (e.g. no_overlapping_cycles_per_farmer)
  if (err.code === '23P01' || err.constraint === 'no_overlapping_cycles_per_farmer') {
    return res.status(409).json({
      success: false,
      message: 'Cycle dates overlap with an existing cycle for this farmer.',
    });
  }

  // PostgreSQL Unique Constraint Violation
  if (err.code === '23505') {
    if (err.constraint === 'idx_farmer_one_active_cycle') {
      return res.status(409).json({ success: false, message: 'Farmer already has an active payment cycle.' });
    }

    if (err.constraint === 'milk_unique_farmer_shift') {
      return res.status(409).json({ success: false, message: 'Milk entry already exists for this farmer, date, and shift.' });
    }

    if (err.constraint === 'payments_cycle_id_key' || err.constraint === 'payments_cycle_id_unique') {
      return res.status(409).json({ success: false, message: 'Payment already recorded for this cycle.' });
    }

    if (err.constraint === 'farmers_phone_key') {
      return res.status(409).json({ success: false, message: 'A farmer with this phone number already exists.' });
    }

    if (err.constraint === 'idx_wallet_ledger_unique_receipt_reference') {
      return res.status(409).json({ success: false, message: 'A receipt with this reference number already exists.' });
    }

    if (err.constraint === 'wallet_ledger_idempotency_key_key') {
      return res.status(409).json({ success: false, message: 'Duplicate wallet transaction (idempotency key already used).' });
    }

    if (err.constraint === 'distribution_previews_idempotency_key_key') {
      return res.status(409).json({ success: false, message: 'Distribution already processed (idempotency key already used).' });
    }

    return res.status(409).json({ success: false, message: 'Duplicate value violates unique constraint.' });
  }

  if (err.code === '23503') {
    return res.status(400).json({ success: false, message: 'Referenced record does not exist.' });
  }

  if (err.code === '22P02') {
    return res.status(400).json({ success: false, message: 'Invalid input data format or ID.' });
  }

  if (err.code === '23514') {
    return res.status(400).json({ success: false, message: 'Value fails database validation constraints.' });
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error occurred.',
  });
}

module.exports = { notFound, errorHandler };
