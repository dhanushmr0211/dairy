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

  const activeCycle = await cycleModel.findActiveCycleByFarmerId(parsedFarmerId);
  if (!activeCycle) {
    return res.status(404).json({ success: false, message: 'No active cycle found for this farmer.' });
  }

  const cycleStart = toDateOnlyTimeValue(activeCycle.start_date);
  const cycleEnd = toDateOnlyTimeValue(activeCycle.end_date);

  if (entryTimeValue < cycleStart || entryTimeValue > cycleEnd) {
    return res.status(400).json({
      success: false,
      message: 'Milk entry date must be within the active cycle date range.',
    });
  }

  const isoDate = toIsoDateString(parsedDate);
  const entry = await milkModel.createMilkEntry({
    farmerId: parsedFarmerId,
    cycleId: activeCycle.id,
    date: isoDate,
    time: normalizedTime,
    liters: parsedLiters,
  });

  res.status(201).json({ success: true, ...entry });
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
