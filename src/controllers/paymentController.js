const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const cycleModel = require('../models/cycleModel');
const milkModel = require('../models/milkModel');
const feedModel = require('../models/feedModel');
const paymentModel = require('../models/paymentModel');

const payCycle = asyncHandler(async (req, res) => {
  const { cycleId, paidDate } = req.body;

  if (!cycleId) {
    return res.status(400).json({ message: 'cycleId is required.' });
  }

  if (paidDate && Number.isNaN(new Date(paidDate).getTime())) {
    return res.status(400).json({ message: 'paidDate must be a valid date (YYYY-MM-DD).' });
  }

  const cycle = await cycleModel.findCycleById(cycleId);
  if (!cycle) {
    return res.status(404).json({ message: 'Cycle not found.' });
  }

  if (cycle.status === 'paid') {
    return res.status(400).json({ message: 'Cycle is already marked as paid.' });
  }

  const existingPayment = await paymentModel.findPaymentByCycleId(cycleId);
  if (existingPayment) {
    return res.status(409).json({ message: 'Payment already exists for this cycle.' });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const totalLiters = await milkModel.getTotalLitersByCycleId(cycleId, client);
    const totalAmount = Number((totalLiters * Number(cycle.rate_per_liter)).toFixed(2));
    const feedDeduction = await feedModel.getFeedDeductionForCycle(
      {
        farmerId: cycle.farmer_id,
        startDate: cycle.start_date,
        endDate: cycle.end_date,
      },
      client
    );
    const finalAmount = Number((totalAmount - feedDeduction).toFixed(2));

    const payment = await paymentModel.createPayment(
      {
        cycleId,
        totalLiters,
        totalAmount,
        feedDeduction,
        finalAmount,
        paidDate: paidDate || new Date().toISOString().slice(0, 10),
      },
      client
    );

    await cycleModel.markCycleAsPaid(cycleId, client);
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
  const payments = await paymentModel.getPaymentsByFarmerId(req.params.farmerId);
  res.json(payments);
});

module.exports = {
  payCycle,
  getPaymentsByFarmer,
};
