const asyncHandler = require('../utils/asyncHandler');
const feedModel = require('../models/feedModel');

const addFeedRecord = asyncHandler(async (req, res) => {
  const { farmerId, date, item, quantity, amount } = req.body;

  if (!farmerId || !date || !item || quantity === undefined || amount === undefined) {
    return res.status(400).json({
      message: 'farmerId, date, item, quantity, and amount are required.',
    });
  }

  if (Number(quantity) < 0 || Number(amount) < 0) {
    return res.status(400).json({ message: 'quantity and amount cannot be negative.' });
  }

  if (Number.isNaN(new Date(date).getTime())) {
    return res.status(400).json({ message: 'date must be a valid date (YYYY-MM-DD).' });
  }

  const record = await feedModel.createFeedRecord({
    farmerId,
    date,
    item: String(item).trim(),
    quantity,
    amount,
  });

  res.status(201).json(record);
});

const getFeedByFarmer = asyncHandler(async (req, res) => {
  const records = await feedModel.getFeedRecordsByFarmerId(req.params.farmerId);
  res.json(records);
});

module.exports = {
  addFeedRecord,
  getFeedByFarmer,
};
