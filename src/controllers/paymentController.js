const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const cycleModel = require('../models/cycleModel');
const paymentModel = require('../models/paymentModel');
const farmerModel = require('../models/farmerModel');
const { parsePositiveInteger, parseValidDate, toIsoDateString } = require('../utils/validation');
const { getCyclePaymentSummary } = require('../utils/paymentCalculator');

const payCycle = asyncHandler(async (req, res) => {
  const { cycleId, paidDate } = req.body;

  if (!cycleId) {
    return res.status(400).json({ message: 'cycleId is required.' });
  }
  const parsedCycleId = parsePositiveInteger(cycleId);
  if (!parsedCycleId) {
    return res.status(400).json({ message: 'cycleId must be a positive integer.' });
  }

  const parsedPaidDate = paidDate ? parseValidDate(paidDate) : null;
  if (paidDate && !parsedPaidDate) {
    return res.status(400).json({ message: 'paidDate must be a valid date (YYYY-MM-DD).' });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const cycle = await cycleModel.findCycleByIdForUpdate(parsedCycleId, client);
    if (!cycle) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Cycle not found.' });
    }

    if (cycle.status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Cycle already paid.' });
    }

    const existingPayment = await paymentModel.findPaymentByCycleId(parsedCycleId, client);
    if (existingPayment) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Cycle already paid.' });
    }

    const { totalLiters, totalAmount, feedDeduction, finalAmount } = await getCyclePaymentSummary(
      cycle,
      client
    );

    const payment = await paymentModel.createPayment(
      {
        cycleId: parsedCycleId,
        totalLiters,
        totalAmount,
        feedDeduction,
        finalAmount,
        paidDate: parsedPaidDate ? toIsoDateString(parsedPaidDate) : toIsoDateString(new Date()),
      },
      client
    );

    await cycleModel.markCycleAsPaid(parsedCycleId, client);
    await client.query('COMMIT');

    res.status(201).json(payment);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

const getPaymentsByFarmer = asyncHandler(async (req, res) => {
  const parsedFarmerId = parsePositiveInteger(req.params.farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ message: 'farmerId must be a positive integer.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ message: 'Farmer not found.' });
  }

  const payments = await paymentModel.getPaymentsByFarmerId(parsedFarmerId);
  res.json(payments);
});

const getPaymentPreview = asyncHandler(async (req, res) => {
  const { cycleId } = req.params;
  const parsedCycleId = parsePositiveInteger(cycleId);
  if (!parsedCycleId) {
    return res.status(400).json({ message: 'cycleId must be a positive integer.' });
  }

  const cycle = await cycleModel.findCycleById(parsedCycleId);
  if (!cycle) {
    return res.status(404).json({ message: 'Cycle not found.' });
  }

  if (cycle.status === 'paid') {
    return res.status(409).json({ message: 'Cycle already paid.' });
  }

  const { totalLiters, totalAmount, feedDeduction, finalAmount } = await getCyclePaymentSummary(cycle, db);

  res.json({
    cycle_id: parsedCycleId,
    total_liters: totalLiters,
    total_amount: totalAmount,
    feed_deduction: feedDeduction,
    final_amount: finalAmount,
  });
});

module.exports = {
  payCycle,
  getPaymentsByFarmer,
  getPaymentPreview,
};
