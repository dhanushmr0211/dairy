const asyncHandler = require('../utils/asyncHandler');
const cycleModel = require('../models/cycleModel');
const milkModel = require('../models/milkModel');
const farmerModel = require('../models/farmerModel');
const { parsePositiveInteger, parsePositiveNumber, parseValidDate } = require('../utils/validation');

function toDateOnlyTimeValue(value) {
  const date = new Date(value);
  return date.setHours(0, 0, 0, 0);
}

const addMilkEntry = asyncHandler(async (req, res) => {
  const { farmerId, date, time, liters } = req.body;

  if (!farmerId || !date || !time || !liters) {
    return res.status(400).json({ message: 'farmerId, date, time, and liters are required.' });
  }

  const parsedFarmerId = parsePositiveInteger(farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ message: 'farmerId must be a positive integer.' });
  }

  if (!['morning', 'evening'].includes(String(time).toLowerCase())) {
    return res.status(400).json({ message: 'time must be morning or evening.' });
  }

  if (!parsePositiveNumber(liters)) {
    return res.status(400).json({ message: 'liters must be greater than 0.' });
  }

  const parsedDate = parseValidDate(date);
  if (!parsedDate) {
    return res.status(400).json({ message: 'date must be a valid date (YYYY-MM-DD).' });
  }
  const entryTimeValue = toDateOnlyTimeValue(parsedDate);

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ message: 'Farmer not found.' });
  }

  const activeCycle = await cycleModel.findActiveCycleByFarmerId(parsedFarmerId);
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
    farmerId: parsedFarmerId,
    cycleId: activeCycle.id,
    date,
    time: String(time).toLowerCase(),
    liters,
  });

  res.status(201).json(entry);
});

const getMilkByFarmer = asyncHandler(async (req, res) => {
  const parsedFarmerId = parsePositiveInteger(req.params.farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ message: 'farmerId must be a positive integer.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ message: 'Farmer not found.' });
  }

  const entries = await milkModel.getMilkEntriesByFarmerId(parsedFarmerId);
  res.json(entries);
});

module.exports = {
  addMilkEntry,
  getMilkByFarmer,
};
