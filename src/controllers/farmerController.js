const asyncHandler = require('../utils/asyncHandler');
const farmerModel = require('../models/farmerModel');
const cycleModel = require('../models/cycleModel');
const { getCyclePaymentSummary } = require('../utils/paymentCalculator');
const db = require('../config/db');
const { parsePositiveInteger } = require('../utils/validation');

const createFarmer = asyncHandler(async (req, res) => {
  const { name, phone, status } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ success: false, message: 'name and phone are required.' });
  }

  const farmerStatus = status ? String(status).toLowerCase() : 'active';
  if (!['active', 'inactive'].includes(farmerStatus)) {
    return res.status(400).json({ success: false, message: 'status must be active or inactive.' });
  }

  const farmer = await farmerModel.createFarmer({
    name: String(name).trim(),
    phone: String(phone).trim(),
    status: farmerStatus,
  });

  res.status(201).json({ success: true, ...farmer });
});

const getFarmers = asyncHandler(async (req, res) => {
  const { status } = req.query;
  let filterStatus = null;
  if (status) {
    const s = String(status).toLowerCase();
    if (['active', 'inactive'].includes(s)) {
      filterStatus = s;
    }
  }

  const farmers = await farmerModel.getAllFarmers({ status: filterStatus });
  res.json(farmers);
});

const updateFarmerStatus = asyncHandler(async (req, res) => {
  const parsedFarmerId = parsePositiveInteger(req.params.id);
  if (!parsedFarmerId) {
    return res.status(400).json({ success: false, message: 'id must be a positive integer.' });
  }

  const { status } = req.body;
  if (!status || !['active', 'inactive'].includes(String(status).toLowerCase())) {
    return res.status(400).json({ success: false, message: 'status must be either active or inactive.' });
  }

  const existing = await farmerModel.findFarmerById(parsedFarmerId);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Farmer not found.' });
  }

  const updated = await farmerModel.updateFarmerStatus(parsedFarmerId, String(status).toLowerCase());
  res.json({ success: true, ...updated });
});

const getFarmerSummary = asyncHandler(async (req, res) => {
  const parsedFarmerId = parsePositiveInteger(req.params.id);
  if (!parsedFarmerId) {
    return res.status(400).json({ success: false, message: 'id must be a positive integer.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ success: false, message: 'Farmer not found.' });
  }

  const activeCycle = await cycleModel.findActiveCycleByFarmerId(parsedFarmerId);
  if (!activeCycle) {
    return res.status(404).json({
      success: false,
      message: 'No active cycle found for this farmer.',
      farmer,
      active_cycle: null,
    });
  }

  const { totalLiters, grossAmount, feedDeduction, finalAmount } = await getCyclePaymentSummary(
    activeCycle,
    db
  );

  res.json({
    success: true,
    farmer,
    active_cycle: activeCycle,
    start_date: activeCycle.start_date,
    end_date: activeCycle.end_date,
    duration_days: activeCycle.duration_days,
    payment_due_date: activeCycle.payment_due_date,
    rate_per_liter: activeCycle.rate_per_liter,
    total_liters: totalLiters,
    total_milk: totalLiters,
    gross_amount: grossAmount,
    feed_deduction: feedDeduction,
    final_amount: finalAmount,
    payment_status: activeCycle.status,
  });
});

module.exports = {
  createFarmer,
  getFarmers,
  updateFarmerStatus,
  getFarmerSummary,
};
