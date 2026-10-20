const db = require('../config/db');
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

  const isoDate = toIsoDateString(parsedDate);

  // Check if date belongs to a paid payment cycle
  const paidCycle = await feedModel.findPaidCycleForDate(parsedFarmerId, isoDate);
  if (paidCycle) {
    return res.status(409).json({
      success: false,
      message: 'Cannot add feed records for dates belonging to a paid payment cycle.',
    });
  }

  const record = await feedModel.createFeedRecord({
    farmerId: parsedFarmerId,
    date: isoDate,
    item: String(item).trim(),
    quantity: parsedQuantity,
    amount: parsedAmount,
  });

  res.status(201).json({ success: true, ...record });
});

const updateFeedRecord = asyncHandler(async (req, res) => {
  const parsedId = parsePositiveInteger(req.params.id);
  if (!parsedId) {
    return res.status(400).json({ success: false, message: 'Invalid feed record ID.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const record = await feedModel.findFeedRecordByIdForUpdate(parsedId, client);
    if (!record) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Feed record not found.' });
    }

    // Check if the current record date falls within a paid cycle
    const currentPaidCycle = await feedModel.findPaidCycleForDate(record.farmer_id, toIsoDateString(record.date), client);
    if (currentPaidCycle) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Cannot modify feed records for dates belonging to a paid payment cycle.',
      });
    }

    const { date, item, quantity, amount } = req.body;
    let newDate = record.date;
    if (date) {
      const parsedDate = parseValidDate(date);
      if (!parsedDate) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'date must be a valid date (YYYY-MM-DD).' });
      }
      newDate = toIsoDateString(parsedDate);

      // Check if the new date falls within a paid cycle
      const targetPaidCycle = await feedModel.findPaidCycleForDate(record.farmer_id, newDate, client);
      if (targetPaidCycle) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Cannot move feed records to dates belonging to a paid payment cycle.',
        });
      }
    }

    let newItem = record.item;
    if (item !== undefined) {
      newItem = String(item).trim();
    }

    let newQuantity = record.quantity;
    if (quantity !== undefined) {
      const parsedQty = parseNonNegativeNumber(quantity);
      if (parsedQty === null) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'quantity cannot be negative.' });
      }
      newQuantity = parsedQty;
    }

    let newAmount = record.amount;
    if (amount !== undefined) {
      const parsedAmt = parseNonNegativeNumber(amount);
      if (parsedAmt === null) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'amount cannot be negative.' });
      }
      newAmount = parsedAmt;
    }

    const updated = await feedModel.updateFeedRecord(
      parsedId,
      {
        date: newDate,
        item: newItem,
        quantity: newQuantity,
        amount: newAmount,
      },
      client
    );

    await client.query('COMMIT');
    res.json({ success: true, ...updated });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

const deleteFeedRecord = asyncHandler(async (req, res) => {
  const parsedId = parsePositiveInteger(req.params.id);
  if (!parsedId) {
    return res.status(400).json({ success: false, message: 'Invalid feed record ID.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const record = await feedModel.findFeedRecordByIdForUpdate(parsedId, client);
    if (!record) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Feed record not found.' });
    }

    const paidCycle = await feedModel.findPaidCycleForDate(record.farmer_id, toIsoDateString(record.date), client);
    if (paidCycle) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Cannot delete feed records for dates belonging to a paid payment cycle.',
      });
    }

    await feedModel.deleteFeedRecord(parsedId, client);
    await client.query('COMMIT');

    res.json({ success: true, message: 'Feed record deleted successfully.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
  updateFeedRecord,
  deleteFeedRecord,
  getFeedByFarmer,
};
