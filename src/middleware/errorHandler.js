function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Route not found' });
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

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
