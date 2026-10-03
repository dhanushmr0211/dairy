function notFound(req, res) {
  res.status(404).json({ message: 'Route not found' });
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  if (err.code === '23505') {
    if (err.constraint === 'idx_farmer_one_active_cycle') {
      return res.status(409).json({ message: 'Farmer already has an active cycle.' });
    }

    if (err.constraint === 'milk_unique_farmer_shift') {
      return res.status(409).json({ message: 'Milk entry already exists for this farmer, date, and time.' });
    }

    if (err.constraint === 'payments_cycle_id_key') {
      return res.status(409).json({ message: 'Cycle already paid.' });
    }

    return res.status(409).json({ message: 'Duplicate value violates unique constraint.' });
  }

  if (err.code === '23503') {
    return res.status(400).json({ message: 'Referenced record does not exist.' });
  }

  if (err.code === '22P02') {
    return res.status(400).json({ message: 'Invalid input syntax.' });
  }

  res.status(statusCode).json({
    message: err.message || 'Something went wrong',
  });
}

module.exports = { notFound, errorHandler };
