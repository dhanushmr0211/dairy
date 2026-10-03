const asyncHandler = require('../utils/asyncHandler');
const feedModel = require('../models/feedModel');
const farmerModel = require('../models/farmerModel');
const { parseNonNegativeNumber, parsePositiveInteger, parseValidDate } = require('../utils/validation');

const addFeedRecord = asyncHandler(async (req, res) => {
  const { farmerId, date, item, quantity, amount } = req.body;

  if (!farmerId || !date || !item || quantity === undefined || amount === undefined) {
    return res.status(400).json({
      message: 'farmerId, date, item, quantity, and amount are required.',
    });
  }

  const parsedFarmerId = parsePositiveInteger(farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ message: 'farmerId must be a positive integer.' });
  }

  if (parseNonNegativeNumber(quantity) === null || parseNonNegativeNumber(amount) === null) {
    return res.status(400).json({ message: 'quantity and amount cannot be negative.' });
  }

  if (!parseValidDate(date)) {
    return res.status(400).json({ message: 'date must be a valid date (YYYY-MM-DD).' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ message: 'Farmer not found.' });
  }

  const record = await feedModel.createFeedRecord({
    farmerId: parsedFarmerId,
    date,
    item: String(item).trim(),
    quantity,
    amount,
  });

  res.status(201).json(record);
});

const getFeedByFarmer = asyncHandler(async (req, res) => {
  const parsedFarmerId = parsePositiveInteger(req.params.farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ message: 'farmerId must be a positive integer.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ message: 'Farmer not found.' });
  }

  const records = await feedModel.getFeedRecordsByFarmerId(parsedFarmerId);
  res.json(records);
});

module.exports = {
  addFeedRecord,
  getFeedByFarmer,
};
