const asyncHandler = require('../utils/asyncHandler');
const cycleModel = require('../models/cycleModel');
const milkModel = require('../models/milkModel');
const farmerModel = require('../models/farmerModel');
const { parsePositiveInteger, parsePositiveNumber, parseValidDate, toIsoDateString } = require('../utils/validation');

function toDateOnlyTimeValue(value) {
  const date = new Date(value);
  return date.setHours(0, 0, 0, 0);
}

const addMilkEntry = asyncHandler(async (req, res) => {
  const { farmerId, date, time, liters } = req.body;

  if (!farmerId || !date || !time || liters === undefined) {
    return res.status(400).json({
      success: false,
      message: 'farmerId, date, time, and liters are required.',
    });
  }

  const parsedFarmerId = parsePositiveInteger(farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ success: false, message: 'farmerId must be a positive integer.' });
  }

  const normalizedTime = String(time).trim().toLowerCase();
  if (!['morning', 'evening'].includes(normalizedTime)) {
    return res.status(400).json({ success: false, message: 'time must be morning or evening.' });
  }

  const parsedLiters = parsePositiveNumber(liters);
  if (!parsedLiters) {
    return res.status(400).json({ success: false, message: 'liters must be greater than 0.' });
  }

  const parsedDate = parseValidDate(date);
  if (!parsedDate) {
    return res.status(400).json({ success: false, message: 'date must be a valid date (YYYY-MM-DD).' });
  }

  // Prevent future dates
  const todayVal = toDateOnlyTimeValue(new Date());
  const entryTimeValue = toDateOnlyTimeValue(parsedDate);
  if (entryTimeValue > todayVal) {
    return res.status(400).json({ success: false, message: 'Cannot record milk entry for a future date.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ success: false, message: 'Farmer not found.' });
  }

  if (farmer.status === 'inactive') {
    return res.status(400).json({ success: false, message: 'Cannot add milk entry for an inactive farmer.' });
  }

  const isoDate = toIsoDateString(parsedDate);

  // Find the exact cycle whose date range contains this milk entry date:
  // milk_date >= cycle.start_date AND milk_date <= cycle.end_date
  const matchingCycle = await cycleModel.findCycleByFarmerAndDate(parsedFarmerId, isoDate);
  if (!matchingCycle) {
    return res.status(400).json({
      success: false,
      message: 'No payment cycle exists for this farmer on this date.',
    });
  }

  const entry = await milkModel.createMilkEntry({
    farmerId: parsedFarmerId,
    cycleId: matchingCycle.id,
    date: isoDate,
    time: normalizedTime,
    liters: parsedLiters,
  });

  res.status(201).json({
    success: true,
    ...entry,
    cycle_id: matchingCycle.id,
    rate_per_liter: matchingCycle.rate_per_liter,
  });
});

const getMilkByFarmer = asyncHandler(async (req, res) => {
  const parsedFarmerId = parsePositiveInteger(req.params.farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ success: false, message: 'farmerId must be a positive integer.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ success: false, message: 'Farmer not found.' });
  }

  const entries = await milkModel.getMilkEntriesByFarmerId(parsedFarmerId);
  res.json(entries);
});

module.exports = {
  addMilkEntry,
  getMilkByFarmer,
};
