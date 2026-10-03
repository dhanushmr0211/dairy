const asyncHandler = require('../utils/asyncHandler');
const cycleModel = require('../models/cycleModel');
const farmerModel = require('../models/farmerModel');
const {
  parsePositiveInteger,
  parsePositiveNumber,
  parseValidDate,
  toIsoDateString,
} = require('../utils/validation');

function calculateEndDate(startDate, durationDays) {
  const date = new Date(startDate);
  date.setDate(date.getDate() + Number(durationDays) - 1);
  return toIsoDateString(date);
}

const startCycle = asyncHandler(async (req, res) => {
  const { farmerId, startDate, durationDays, ratePerLiter } = req.body;

  if (!farmerId || !startDate || !durationDays || !ratePerLiter) {
    return res.status(400).json({
      message: 'farmerId, startDate, durationDays, and ratePerLiter are required.',
    });
  }

  const parsedFarmerId = parsePositiveInteger(farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ message: 'farmerId must be a positive integer.' });
  }

  if (![15, 30].includes(Number(durationDays))) {
    return res.status(400).json({ message: 'durationDays must be 15 or 30.' });
  }

  const parsedStartDate = parseValidDate(startDate);
  if (!parsedStartDate) {
    return res.status(400).json({ message: 'startDate must be a valid date (YYYY-MM-DD).' });
  }

  if (!parsePositiveNumber(ratePerLiter)) {
    return res.status(400).json({ message: 'ratePerLiter must be greater than 0.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ message: 'Farmer not found.' });
  }

  const activeCycle = await cycleModel.findActiveCycleByFarmerId(parsedFarmerId);
  if (activeCycle) {
    return res.status(409).json({ message: 'Farmer already has an active cycle.' });
  }

  const endDate = calculateEndDate(startDate, durationDays);
  const cycle = await cycleModel.createCycle({
    farmerId: parsedFarmerId,
    startDate,
    endDate,
    ratePerLiter,
  });

  res.status(201).json(cycle);
});

const getActiveCycle = asyncHandler(async (req, res) => {
  const { farmerId } = req.params;
  const parsedFarmerId = parsePositiveInteger(farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ message: 'farmerId must be a positive integer.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ message: 'Farmer not found.' });
  }

  const cycle = await cycleModel.findActiveCycleByFarmerId(parsedFarmerId);
  if (!cycle) {
    return res.status(404).json({ message: 'No active cycle.' });
  }

  res.json(cycle);
});

module.exports = {
  startCycle,
  getActiveCycle,
};
