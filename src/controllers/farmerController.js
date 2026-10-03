const asyncHandler = require('../utils/asyncHandler');
const farmerModel = require('../models/farmerModel');

const createFarmer = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ message: 'name and phone are required.' });
  }

  const farmer = await farmerModel.createFarmer({
    name: String(name).trim(),
    phone: String(phone).trim(),
  });

  res.status(201).json(farmer);
});

const getFarmers = asyncHandler(async (req, res) => {
  const farmers = await farmerModel.getAllFarmers();
  res.json(farmers);
});

module.exports = {
  createFarmer,
  getFarmers,
};
