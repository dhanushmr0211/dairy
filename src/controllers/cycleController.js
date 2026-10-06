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
  const { farmerId, startDate, durationDays, ratePerLiter, paymentDueDate } = req.body;

  if (!farmerId || !startDate || !durationDays || !ratePerLiter) {
    return res.status(400).json({
      success: false,
      message: 'farmerId, startDate, durationDays, and ratePerLiter are required.',
    });
  }

  const parsedFarmerId = parsePositiveInteger(farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ success: false, message: 'farmerId must be a positive integer.' });
  }

  const durationNum = Number(durationDays);
  if (![15, 30].includes(durationNum)) {
    return res.status(400).json({ success: false, message: 'durationDays must be 15 or 30.' });
  }

  const parsedStartDate = parseValidDate(startDate);
  if (!parsedStartDate) {
    return res.status(400).json({ success: false, message: 'startDate must be a valid date (YYYY-MM-DD).' });
  }

  const parsedRate = parsePositiveNumber(ratePerLiter);
  if (!parsedRate) {
    return res.status(400).json({ success: false, message: 'ratePerLiter must be greater than 0.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ success: false, message: 'Farmer not found.' });
  }

  if (farmer.status === 'inactive') {
    return res.status(400).json({ success: false, message: 'Cannot start a cycle for an inactive farmer.' });
  }

  const activeCycle = await cycleModel.findActiveCycleByFarmerId(parsedFarmerId);
  if (activeCycle) {
    return res.status(409).json({ success: false, message: 'Farmer already has an active payment cycle.' });
  }

  const isoStartDate = toIsoDateString(parsedStartDate);
  const endDate = calculateEndDate(isoStartDate, durationNum);
  
  let dueDate = endDate;
  if (paymentDueDate) {
    const parsedDueDate = parseValidDate(paymentDueDate);
    if (!parsedDueDate) {
      return res.status(400).json({ success: false, message: 'paymentDueDate must be a valid date (YYYY-MM-DD).' });
    }
    dueDate = toIsoDateString(parsedDueDate);
  }

  const cycle = await cycleModel.createCycle({
    farmerId: parsedFarmerId,
    startDate: isoStartDate,
    endDate,
    durationDays: durationNum,
    ratePerLiter: parsedRate,
    paymentDueDate: dueDate,
  });

  res.status(201).json({ success: true, ...cycle });
});

const getActiveCycle = asyncHandler(async (req, res) => {
  const { farmerId } = req.params;
  const parsedFarmerId = parsePositiveInteger(farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ success: false, message: 'farmerId must be a positive integer.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ success: false, message: 'Farmer not found.' });
  }

  const cycle = await cycleModel.findActiveCycleByFarmerId(parsedFarmerId);
  if (!cycle) {
    return res.status(404).json({ success: false, message: 'No active cycle found for this farmer.' });
  }

  res.json({ success: true, ...cycle });
});

module.exports = {
  startCycle,
  getActiveCycle,
};
