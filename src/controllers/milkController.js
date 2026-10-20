const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const cycleModel = require('../models/cycleModel');
const milkModel = require('../models/milkModel');
const farmerModel = require('../models/farmerModel');
const { parsePositiveInteger, parsePositiveNumber, parseValidDate, toIsoDateString } = require('../utils/validation');

function toDateOnlyTimeValue(value) {
  const date = new Date(value);
  return date.setHours(0, 0, 0, 0);
}

const addMilkEntry = asyncHandler(async (req, res) => {
  const { farmerId, date, time, liters } = req.body;

  if (!farmerId || !date || !time || liters === undefined) {
    return res.status(400).json({
      success: false,
      message: 'farmerId, date, time, and liters are required.',
    });
  }

  const parsedFarmerId = parsePositiveInteger(farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ success: false, message: 'farmerId must be a positive integer.' });
  }

  const normalizedTime = String(time).trim().toLowerCase();
  if (!['morning', 'evening'].includes(normalizedTime)) {
    return res.status(400).json({ success: false, message: 'time must be morning or evening.' });
  }

  const parsedLiters = parsePositiveNumber(liters);
  if (!parsedLiters) {
    return res.status(400).json({ success: false, message: 'liters must be greater than 0.' });
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
    return res.status(400).json({ success: false, message: 'Cannot add milk entry for an inactive farmer.' });
  }

  const isoDate = toIsoDateString(parsedDate);

  // Find the exact cycle whose date range contains this milk entry date:
  // milk_date >= cycle.start_date AND milk_date <= cycle.end_date
  const matchingCycle = await cycleModel.findCycleByFarmerAndDate(parsedFarmerId, isoDate);
  if (!matchingCycle) {
    return res.status(400).json({
      success: false,
      message: 'No payment cycle exists for this farmer on this date.',
    });
  }

  // Permanently lock completed payments: block adding milk entries to a paid cycle
  if (matchingCycle.status === 'paid') {
    return res.status(409).json({
      success: false,
      message: 'Cannot add milk entries to a paid payment cycle.',
    });
  }

  const entry = await milkModel.createMilkEntry({
    farmerId: parsedFarmerId,
    cycleId: matchingCycle.id,
    date: isoDate,
    time: normalizedTime,
    liters: parsedLiters,
  });

  res.status(201).json({
    success: true,
    ...entry,
    cycle_id: matchingCycle.id,
    rate_per_liter: matchingCycle.rate_per_liter,
  });
});

const updateMilkEntry = asyncHandler(async (req, res) => {
  const parsedId = parsePositiveInteger(req.params.id);
  if (!parsedId) {
    return res.status(400).json({ success: false, message: 'Invalid milk entry ID.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const entry = await milkModel.findMilkEntryByIdForUpdate(parsedId, client);
    if (!entry) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Milk entry not found.' });
    }

    if (entry.cycle_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Cannot modify milk entries for a paid payment cycle.',
      });
    }

    const { date, time, liters } = req.body;
    let newDate = entry.date;
    let newCycleId = entry.cycle_id;

    if (date) {
      const parsedDate = parseValidDate(date);
      if (!parsedDate) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'date must be a valid date (YYYY-MM-DD).' });
      }
      newDate = toIsoDateString(parsedDate);

      // Find matching cycle for new date
      const targetCycle = await cycleModel.findCycleByFarmerAndDate(entry.farmer_id, newDate, client);
      if (!targetCycle) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'No payment cycle exists for this farmer on the updated date.' });
      }

      if (targetCycle.status === 'paid') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Cannot move milk entries to a paid payment cycle.',
        });
      }

      newCycleId = targetCycle.id;
    }

    let newTime = entry.time;
    if (time) {
      const normalizedTime = String(time).trim().toLowerCase();
      if (!['morning', 'evening'].includes(normalizedTime)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'time must be morning or evening.' });
      }
      newTime = normalizedTime;
    }

    let newLiters = entry.liters;
    if (liters !== undefined) {
      const parsedLiters = parsePositiveNumber(liters);
      if (!parsedLiters) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'liters must be greater than 0.' });
      }
      newLiters = parsedLiters;
    }

    const updated = await milkModel.updateMilkEntry(
      parsedId,
      {
        date: newDate,
        time: newTime,
        liters: newLiters,
        cycleId: newCycleId,
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

const deleteMilkEntry = asyncHandler(async (req, res) => {
  const parsedId = parsePositiveInteger(req.params.id);
  if (!parsedId) {
    return res.status(400).json({ success: false, message: 'Invalid milk entry ID.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const entry = await milkModel.findMilkEntryByIdForUpdate(parsedId, client);
    if (!entry) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Milk entry not found.' });
    }

    if (entry.cycle_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Cannot delete milk entries for a paid payment cycle.',
      });
    }

    await milkModel.deleteMilkEntry(parsedId, client);
    await client.query('COMMIT');

    res.json({ success: true, message: 'Milk entry deleted successfully.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

const getMilkByFarmer = asyncHandler(async (req, res) => {
  const parsedFarmerId = parsePositiveInteger(req.params.farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ success: false, message: 'farmerId must be a positive integer.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ success: false, message: 'Farmer not found.' });
  }

  const entries = await milkModel.getMilkEntriesByFarmerId(parsedFarmerId);
  res.json(entries);
});

module.exports = {
  addMilkEntry,
  updateMilkEntry,
  deleteMilkEntry,
  getMilkByFarmer,
};
