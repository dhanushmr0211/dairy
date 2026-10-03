const asyncHandler = require('../utils/asyncHandler');
const cycleModel = require('../models/cycleModel');

function calculateEndDate(startDate, durationDays) {
  const date = new Date(startDate);
  date.setDate(date.getDate() + Number(durationDays) - 1);
  return date.toISOString().slice(0, 10);
}

const startCycle = asyncHandler(async (req, res) => {
  const { farmerId, startDate, durationDays, ratePerLiter } = req.body;

  if (!farmerId || !startDate || !durationDays || !ratePerLiter) {
    return res.status(400).json({
      message: 'farmerId, startDate, durationDays, and ratePerLiter are required.',
    });
  }

  if (![15, 30].includes(Number(durationDays))) {
    return res.status(400).json({ message: 'durationDays must be 15 or 30.' });
  }

  const parsedStartDate = new Date(startDate);
  if (Number.isNaN(parsedStartDate.getTime())) {
    return res.status(400).json({ message: 'startDate must be a valid date (YYYY-MM-DD).' });
  }

  if (Number(ratePerLiter) <= 0) {
    return res.status(400).json({ message: 'ratePerLiter must be greater than 0.' });
  }

  const activeCycle = await cycleModel.findActiveCycleByFarmerId(farmerId);
  if (activeCycle) {
    return res.status(409).json({ message: 'Farmer already has an active cycle.' });
  }

  const endDate = calculateEndDate(startDate, durationDays);
  const cycle = await cycleModel.createCycle({
    farmerId,
    startDate,
    endDate,
    ratePerLiter,
  });

  res.status(201).json(cycle);
});

const getActiveCycle = asyncHandler(async (req, res) => {
  const { farmerId } = req.params;

  const cycle = await cycleModel.findActiveCycleByFarmerId(farmerId);
  if (!cycle) {
    return res.status(404).json({ message: 'No active cycle found.' });
  }

  res.json(cycle);
});

module.exports = {
  startCycle,
  getActiveCycle,
};
