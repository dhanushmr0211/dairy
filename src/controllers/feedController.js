const asyncHandler = require('../utils/asyncHandler');
const feedModel = require('../models/feedModel');
const farmerModel = require('../models/farmerModel');
const { parseNonNegativeNumber, parsePositiveInteger, parseValidDate, toIsoDateString } = require('../utils/validation');

const addFeedRecord = asyncHandler(async (req, res) => {
  const { farmerId, date, item, quantity, amount } = req.body;

  if (!farmerId || !date || !item || quantity === undefined || amount === undefined) {
    return res.status(400).json({
      success: false,
      message: 'farmerId, date, item, quantity, and amount are required.',
    });
  }

  const parsedFarmerId = parsePositiveInteger(farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ success: false, message: 'farmerId must be a positive integer.' });
  }

  const parsedQuantity = parseNonNegativeNumber(quantity);
  const parsedAmount = parseNonNegativeNumber(amount);
  if (parsedQuantity === null || parsedAmount === null) {
    return res.status(400).json({ success: false, message: 'quantity and amount cannot be negative.' });
  }

  const parsedDate = parseValidDate(date);
  if (!parsedDate) {
    return res.status(400).json({ success: false, message: 'date must be a valid date (YYYY-MM-DD).' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ success: false, message: 'Farmer not found.' });
  }

  if (farmer.status === 'inactive') {
    return res.status(400).json({ success: false, message: 'Cannot record feed for an inactive farmer.' });
  }

  const record = await feedModel.createFeedRecord({
    farmerId: parsedFarmerId,
    date: toIsoDateString(parsedDate),
    item: String(item).trim(),
    quantity: parsedQuantity,
    amount: parsedAmount,
  });

  res.status(201).json({ success: true, ...record });
});

const getFeedByFarmer = asyncHandler(async (req, res) => {
  const parsedFarmerId = parsePositiveInteger(req.params.farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ success: false, message: 'farmerId must be a positive integer.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ success: false, message: 'Farmer not found.' });
  }

  const records = await feedModel.getFeedRecordsByFarmerId(parsedFarmerId);
  res.json(records);
});

module.exports = {
  addFeedRecord,
  getFeedByFarmer,
};
