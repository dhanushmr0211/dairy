const asyncHandler = require('../utils/asyncHandler');
const cycleModel = require('../models/cycleModel');
const milkModel = require('../models/milkModel');

function toDateOnlyTimeValue(value) {
  const date = new Date(value);
  return date.setHours(0, 0, 0, 0);
}

const addMilkEntry = asyncHandler(async (req, res) => {
  const { farmerId, date, time, liters } = req.body;

  if (!farmerId || !date || !time || !liters) {
    return res.status(400).json({ message: 'farmerId, date, time, and liters are required.' });
  }

  if (!['morning', 'evening'].includes(String(time).toLowerCase())) {
    return res.status(400).json({ message: 'time must be morning or evening.' });
  }

  if (Number(liters) <= 0) {
    return res.status(400).json({ message: 'liters must be greater than 0.' });
  }

  const entryTimeValue = toDateOnlyTimeValue(date);
  if (Number.isNaN(entryTimeValue)) {
    return res.status(400).json({ message: 'date must be a valid date (YYYY-MM-DD).' });
  }

  const activeCycle = await cycleModel.findActiveCycleByFarmerId(farmerId);
  if (!activeCycle) {
    return res.status(404).json({ message: 'No active cycle found for this farmer.' });
  }

  const cycleStart = toDateOnlyTimeValue(activeCycle.start_date);
  const cycleEnd = toDateOnlyTimeValue(activeCycle.end_date);

  if (entryTimeValue < cycleStart || entryTimeValue > cycleEnd) {
    return res.status(400).json({
      message: 'Milk entry date must be within the active cycle date range.',
    });
  }

  const entry = await milkModel.createMilkEntry({
    farmerId,
    cycleId: activeCycle.id,
    date,
    time: String(time).toLowerCase(),
    liters,
  });

  res.status(201).json(entry);
});

const getMilkByFarmer = asyncHandler(async (req, res) => {
  const entries = await milkModel.getMilkEntriesByFarmerId(req.params.farmerId);
  res.json(entries);
});

module.exports = {
  addMilkEntry,
  getMilkByFarmer,
};
