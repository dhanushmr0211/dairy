const asyncHandler = require('../utils/asyncHandler');
const farmerModel = require('../models/farmerModel');
const cycleModel = require('../models/cycleModel');
const { getCyclePaymentSummary } = require('../utils/paymentCalculator');
const db = require('../config/db');
const { parsePositiveInteger } = require('../utils/validation');

const createFarmer = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ message: 'name and phone are required.' });
  }

  const farmer = await farmerModel.createFarmer({
    name: String(name).trim(),
    phone: String(phone).trim(),
  });

  res.status(201).json(farmer);
});

const getFarmers = asyncHandler(async (req, res) => {
  const farmers = await farmerModel.getAllFarmers();
  res.json(farmers);
});

const getFarmerSummary = asyncHandler(async (req, res) => {
  const parsedFarmerId = parsePositiveInteger(req.params.id);
  if (!parsedFarmerId) {
    return res.status(400).json({ message: 'id must be a positive integer.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ message: 'Farmer not found.' });
  }

  const activeCycle = await cycleModel.findActiveCycleByFarmerId(parsedFarmerId);
  if (!activeCycle) {
    return res.status(404).json({ message: 'No active cycle.' });
  }

  const { totalLiters, totalAmount, feedDeduction, finalAmount } = await getCyclePaymentSummary(
    activeCycle,
    db
  );

  res.json({
    farmer,
    active_cycle: activeCycle,
    total_liters: totalLiters,
    total_amount: totalAmount,
    feed_deduction: feedDeduction,
    final_amount: finalAmount,
  });
});

module.exports = {
  createFarmer,
  getFarmers,
  getFarmerSummary,
};
