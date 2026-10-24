const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const cycleModel = require('../models/cycleModel');
const milkModel = require('../models/milkModel');
const farmerModel = require('../models/farmerModel');
const { getCyclePaymentSummary } = require('../utils/paymentCalculator');
const { parsePositiveInteger, parsePositiveNumber, parseValidDate, toIsoDateString } = require('../utils/validation');

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

  // Prevent duplicate entries for the same farmer, date, and session
  const duplicate = await milkModel.checkDuplicateMilkEntry({
    farmerId: parsedFarmerId,
    date: isoDate,
    time: normalizedTime,
  });
  if (duplicate) {
    return res.status(409).json({
      success: false,
      message: 'A milk entry already exists for this farmer, date, and session.',
    });
  }

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

  // Invalidate any pending distribution previews referencing this cycle
  await cycleModel.invalidateDistributionPreviewsForCycles([matchingCycle.id]);

  res.status(201).json({
    success: true,
    ...entry,
    cycle_id: matchingCycle.id,
    rate_per_liter: matchingCycle.rate_per_liter,
  });
});

const getMilkEntryById = asyncHandler(async (req, res) => {
  const parsedId = parsePositiveInteger(req.params.id || req.params.entryId);
  if (!parsedId) {
    return res.status(400).json({ success: false, message: 'Invalid milk entry ID.' });
  }

  const entry = await milkModel.findMilkEntryById(parsedId);
  if (!entry) {
    return res.status(404).json({ success: false, message: 'Milk entry not found.' });
  }

  const cycle = await cycleModel.findCycleById(entry.cycle_id);
  const cycleSummary = cycle ? await getCyclePaymentSummary(cycle) : null;

  res.json({
    success: true,
    entry,
    cycle: cycle
      ? {
          ...cycle,
          ...cycleSummary,
        }
      : null,
    ...entry,
  });
});

const updateMilkEntry = asyncHandler(async (req, res) => {
  const parsedId = parsePositiveInteger(req.params.id || req.params.entryId);
  if (!parsedId) {
    return res.status(400).json({ success: false, message: 'Invalid milk entry ID.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Lock existing milk entry and its cycle row
    const entry = await milkModel.findMilkEntryByIdForUpdate(parsedId, client);
    if (!entry) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Milk entry not found.' });
    }

    // 2. Reject modifications to entries in paid cycles
    if (entry.cycle_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Cannot modify milk entries for a paid payment cycle.',
      });
    }

    const { farmerId, farmer_id, date, time, liters } = req.body;

    // Validate and resolve target farmer
    let targetFarmerId = entry.farmer_id;
    const submittedFarmerId = farmerId !== undefined ? farmerId : farmer_id;
    if (submittedFarmerId !== undefined) {
      const parsedFarmerId = parsePositiveInteger(submittedFarmerId);
      if (!parsedFarmerId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'farmerId must be a positive integer.' });
      }
      const farmer = await farmerModel.findFarmerById(parsedFarmerId, client);
      if (!farmer) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Farmer not found.' });
      }
      if (farmer.status === 'inactive') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Cannot assign milk entry to an inactive farmer.' });
      }
      targetFarmerId = parsedFarmerId;
    }

    // Validate and resolve target date
    let targetDate = entry.date;
    if (date !== undefined) {
      const parsedDate = parseValidDate(date);
      if (!parsedDate) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'date must be a valid date (YYYY-MM-DD).' });
      }
      targetDate = toIsoDateString(parsedDate);
    }

    // Validate and resolve target session
    let targetTime = entry.time;
    if (time !== undefined) {
      const normalizedTime = String(time).trim().toLowerCase();
      if (!['morning', 'evening'].includes(normalizedTime)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'time must be morning or evening.' });
      }
      targetTime = normalizedTime;
    }

    // Validate and resolve target liters
    let targetLiters = entry.liters;
    if (liters !== undefined) {
      const parsedLiters = parsePositiveNumber(liters);
      if (!parsedLiters) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'liters must be greater than 0.' });
      }
      targetLiters = parsedLiters;
    }

    // Check for duplicate milk entry for same farmer, date, and session
    const duplicate = await milkModel.checkDuplicateMilkEntry(
      {
        farmerId: targetFarmerId,
        date: targetDate,
        time: targetTime,
        excludeEntryId: parsedId,
      },
      client
    );
    if (duplicate) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'A milk entry already exists for this farmer, date, and session.',
      });
    }

    // Recalculate cycle assignment using entry's actual date and farmer
    const targetCycle = await cycleModel.findCycleByFarmerAndDate(targetFarmerId, targetDate, client);
    if (!targetCycle) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No payment cycle exists for this farmer on the specified date.',
      });
    }

    // Ensure destination cycle is unpaid
    if (targetCycle.status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Cannot move milk entries to a paid payment cycle.',
      });
    }

    // If moving across cycles, lock the destination cycle row as well
    if (targetCycle.id !== entry.cycle_id) {
      await cycleModel.findCycleByIdForUpdate(targetCycle.id, client);
    }

    // Perform the update
    const updated = await milkModel.updateMilkEntry(
      parsedId,
      {
        farmerId: targetFarmerId,
        date: targetDate,
        time: targetTime,
        liters: targetLiters,
        cycleId: targetCycle.id,
      },
      client
    );

    // Invalidate wallet distribution previews referencing affected cycles
    const affectedCycleIds = Array.from(new Set([entry.cycle_id, targetCycle.id]));
    await cycleModel.invalidateDistributionPreviewsForCycles(affectedCycleIds, client);

    // Recalculate unpaid cycle payment summaries
    const destCycleSummary = await getCyclePaymentSummary(targetCycle, client);

    let sourceCycleSummary = null;
    if (entry.cycle_id !== targetCycle.id) {
      const sourceCycle = await cycleModel.findCycleById(entry.cycle_id, client);
      if (sourceCycle) {
        sourceCycleSummary = await getCyclePaymentSummary(sourceCycle, client);
      }
    }

    // Audit logging
    console.info(
      `[AUDIT] Milk entry updated: id=${parsedId}, previous={ farmer_id: ${entry.farmer_id}, date: '${entry.date}', time: '${entry.time}', liters: ${entry.liters}, cycle_id: ${entry.cycle_id} }, new={ farmer_id: ${targetFarmerId}, date: '${targetDate}', time: '${targetTime}', liters: ${targetLiters}, cycle_id: ${targetCycle.id} }, timestamp=${new Date().toISOString()}`
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Milk entry updated successfully.',
      entry: updated,
      cycle: {
        id: targetCycle.id,
        farmer_id: targetFarmerId,
        start_date: targetCycle.start_date,
        end_date: targetCycle.end_date,
        rate_per_liter: targetCycle.rate_per_liter,
        status: targetCycle.status,
        ...destCycleSummary,
      },
      sourceCycle: sourceCycleSummary
        ? {
            id: entry.cycle_id,
            ...sourceCycleSummary,
          }
        : null,
      ...updated,
      totalLiters: destCycleSummary.totalLiters,
      grossAmount: destCycleSummary.grossAmount,
      feedDeduction: destCycleSummary.feedDeduction,
      finalAmount: destCycleSummary.finalAmount,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A milk entry already exists for this farmer, date, and session.',
      });
    }
    if (error.message && (error.message.includes('paid payment cycle') || error.message.includes('paid'))) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }
    throw error;
  } finally {
    client.release();
  }
});

const deleteMilkEntry = asyncHandler(async (req, res) => {
  const parsedId = parsePositiveInteger(req.params.id || req.params.entryId);
  if (!parsedId) {
    return res.status(400).json({ success: false, message: 'Invalid milk entry ID.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Lock entry and associated cycle row
    const entry = await milkModel.findMilkEntryByIdForUpdate(parsedId, client);
    if (!entry) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Milk entry not found.' });
    }

    // Reject deletion if entry belongs to a paid cycle
    if (entry.cycle_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Cannot delete milk entries for a paid payment cycle.',
      });
    }

    // Delete ONLY the specified milk entry
    await milkModel.deleteMilkEntry(parsedId, client);

    // Invalidate pending distribution previews for the affected cycle
    await cycleModel.invalidateDistributionPreviewsForCycles([entry.cycle_id], client);

    // Recalculate affected unpaid cycle amounts
    const cycle = await cycleModel.findCycleById(entry.cycle_id, client);
    const cycleSummary = cycle ? await getCyclePaymentSummary(cycle, client) : null;

    // Audit logging
    console.info(
      `[AUDIT] Milk entry deleted: id=${parsedId}, farmer_id=${entry.farmer_id}, date='${entry.date}', time='${entry.time}', liters=${entry.liters}, cycle_id=${entry.cycle_id}, timestamp=${new Date().toISOString()}`
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Milk entry deleted successfully.',
      deletedEntryId: parsedId,
      cycle: cycle
        ? {
            id: cycle.id,
            farmer_id: cycle.farmer_id,
            start_date: cycle.start_date,
            end_date: cycle.end_date,
            rate_per_liter: cycle.rate_per_liter,
            status: cycle.status,
            ...cycleSummary,
          }
        : null,
      totalLiters: cycleSummary ? cycleSummary.totalLiters : 0,
      grossAmount: cycleSummary ? cycleSummary.grossAmount : 0,
      feedDeduction: cycleSummary ? cycleSummary.feedDeduction : 0,
      finalAmount: cycleSummary ? cycleSummary.finalAmount : 0,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.message && (error.message.includes('paid payment cycle') || error.message.includes('paid'))) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }
    throw error;
  } finally {
    client.release();
  }
});

const getMilkByFarmer = asyncHandler(async (req, res) => {
  const farmerIdParam = req.params.farmerId || req.params.id;
  const parsedFarmerId = parsePositiveInteger(farmerIdParam);
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
  getMilkEntryById,
  updateMilkEntry,
  deleteMilkEntry,
  getMilkByFarmer,
};
