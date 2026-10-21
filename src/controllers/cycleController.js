const asyncHandler = require('../utils/asyncHandler');
const cycleModel = require('../models/cycleModel');
const farmerModel = require('../models/farmerModel');
const milkModel = require('../models/milkModel');
const paymentModel = require('../models/paymentModel');
const { getCyclePaymentSummary } = require('../utils/paymentCalculator');
const { resolveCycleDates, addDays, getInclusiveDays } = require('../utils/cycleDates');
const db = require('../config/db');
const {
  parsePositiveInteger,
  parsePositiveNumber,
  parseValidDate,
  toIsoDateString,
} = require('../utils/validation');

const startCycle = asyncHandler(async (req, res) => {
  const { farmerId, startDate, durationDays, cycleType, month, year, endDate: reqEndDate, ratePerLiter, paymentDueDate } = req.body;

  if (!farmerId || (!startDate && !(year && month)) || !ratePerLiter) {
    return res.status(400).json({
      success: false,
      message: 'farmerId, startDate (or year and month), and ratePerLiter are required.',
    });
  }

  const parsedFarmerId = parsePositiveInteger(farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ success: false, message: 'farmerId must be a positive integer.' });
  }

  let resolvedStartDateStr = null;
  if (startDate) {
    const parsedStartDate = parseValidDate(startDate);
    if (!parsedStartDate) {
      return res.status(400).json({ success: false, message: 'startDate must be a valid date (YYYY-MM-DD).' });
    }
    resolvedStartDateStr = toIsoDateString(parsedStartDate);
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

  // Resolve dates using cycleDates utility (handles 15_days, 30_days, calendar_month, leap years, etc.)
  const resolved = resolveCycleDates({
    startDate: resolvedStartDateStr,
    endDate: reqEndDate ? toIsoDateString(parseValidDate(reqEndDate)) : undefined,
    durationDays,
    cycleType,
    month,
    year,
  });

  const isoStartDate = resolved.startDate;
  const isoEndDate = resolved.endDate;
  const durationNum = resolved.durationDays;
  const resolvedCycleType = resolved.cycleType;

  // Check for any overlapping cycles for this farmer
  const overlappingCycle = await cycleModel.findOverlappingCycle({
    farmerId: parsedFarmerId,
    startDate: isoStartDate,
    endDate: isoEndDate,
  });

  if (overlappingCycle) {
    return res.status(409).json({
      success: false,
      message: 'Cycle dates overlap with an existing cycle for this farmer.',
      existingCycle: {
        id: overlappingCycle.id,
        startDate: toIsoDateString(overlappingCycle.start_date),
        endDate: toIsoDateString(overlappingCycle.end_date),
        status: overlappingCycle.status,
      },
    });
  }

  let dueDate = isoEndDate;
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
    endDate: isoEndDate,
    durationDays: durationNum,
    cycleType: resolvedCycleType,
    ratePerLiter: parsedRate,
    paymentDueDate: dueDate,
  });

  res.status(201).json({
    success: true,
    ...cycle,
    farmer_name: farmer.name,
  });
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

const getCyclesByFarmer = asyncHandler(async (req, res) => {
  const { farmerId } = req.params;
  const parsedFarmerId = parsePositiveInteger(farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ success: false, message: 'farmerId must be a positive integer.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ success: false, message: 'Farmer not found.' });
  }

  const cycles = await cycleModel.getCyclesByFarmerId(parsedFarmerId);
  const detailedCycles = [];

  for (const cycle of cycles) {
    const { totalLiters, grossAmount, feedDeduction, finalAmount } = await getCyclePaymentSummary(cycle, db);
    detailedCycles.push({
      id: cycle.id,
      cycleId: cycle.id,
      farmerId: cycle.farmer_id,
      farmerName: cycle.farmer_name,
      startDate: toIsoDateString(cycle.start_date),
      endDate: toIsoDateString(cycle.end_date),
      durationDays: cycle.duration_days,
      cycleType: cycle.cycle_type,
      ratePerLiter: Number(cycle.rate_per_liter),
      paymentDueDate: toIsoDateString(cycle.payment_due_date),
      status: cycle.status,
      totalLiters,
      grossAmount,
      feedDeduction,
      finalAmount,
      paymentStatus: cycle.status,
      isPaid: cycle.status === 'paid',
      createdAt: cycle.created_at,
    });
  }

  res.json({
    success: true,
    farmer,
    cycles: detailedCycles,
  });
});

const updateCycle = asyncHandler(async (req, res) => {
  const parsedCycleId = parsePositiveInteger(req.params.id);
  if (!parsedCycleId) {
    return res.status(400).json({ success: false, message: 'Invalid cycle ID.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Lock and verify target cycle
    const cycle = await cycleModel.findCycleByIdForUpdate(parsedCycleId, client);
    if (!cycle) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Cycle not found.' });
    }

    if (cycle.status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Cannot modify rate, dates, or details of a paid payment cycle.',
      });
    }

    // Verify no completed payment exists in payments table
    const existingPayment = await paymentModel.findPaymentByCycleId(parsedCycleId, client);
    if (existingPayment) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Cannot modify a cycle that has already been paid.',
      });
    }

    const { startDate, endDate, durationDays, cycleType, ratePerLiter, paymentDueDate, status } = req.body;

    if (status && status !== 'active' && status !== 'pending_payment') {
      if (status === 'paid') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'To pay a cycle, use the payment settlement endpoint.' });
      }
    }

    // Parse ratePerLiter if provided
    let parsedRate = Number(cycle.rate_per_liter);
    const rateWasUpdated = ratePerLiter !== undefined;
    if (rateWasUpdated) {
      parsedRate = parsePositiveNumber(ratePerLiter);
      if (!parsedRate) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'ratePerLiter must be greater than 0.' });
      }
    }

    // Determine target duration and cycleType
    const currentDuration = Number(cycle.duration_days);
    const originalStartDate = toIsoDateString(cycle.start_date);
    const originalEndDate = toIsoDateString(cycle.end_date);

    let requestedDuration = durationDays !== undefined ? Number(durationDays) : null;
    if (!requestedDuration && cycleType) {
      if (cycleType === '15_days') requestedDuration = 15;
      else if (cycleType === '30_days') requestedDuration = 30;
    }

    // ─────────────────────────────────────────────────────────────
    // CASE 1: SHORTEN 30-DAY (OR > 15 DAYS) CYCLE TO 15 DAYS (SPLIT)
    // ─────────────────────────────────────────────────────────────
    if (requestedDuration === 15 && currentDuration > 15) {
      // 1. Invalidate pending distribution previews containing this cycle
      await cycleModel.invalidateDistributionPreviewsForCycles([parsedCycleId], client);

      // Cycle 1: Oct 1 - Oct 15 (15 calendar dates)
      const cycle1EndDate = addDays(originalStartDate, 14);
      // Cycle 2: Oct 16 - originalEndDate
      const cycle2StartDate = addDays(originalStartDate, 15);
      const cycle2EndDate = originalEndDate;
      const cycle2Duration = getInclusiveDays(cycle2StartDate, cycle2EndDate);

      // Check if [cycle2StartDate, cycle2EndDate] would collide with any other cycle
      const otherOverlaps = await cycleModel.findOverlappingCycles(
        {
          farmerId: cycle.farmer_id,
          startDate: cycle2StartDate,
          endDate: cycle2EndDate,
          excludeCycleId: parsedCycleId,
        },
        client
      );

      if (otherOverlaps.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Cannot shorten cycle: target range for second cycle (${cycle2StartDate} to ${cycle2EndDate}) overlaps with existing cycle #${otherOverlaps[0].id}.`,
        });
      }

      // Update original cycle to 15 days
      const cycle1DueDate = paymentDueDate
        ? toIsoDateString(parseValidDate(paymentDueDate))
        : (cycle.payment_due_date < cycle1EndDate ? toIsoDateString(cycle.payment_due_date) : cycle1EndDate);

      const updatedCycle1 = await cycleModel.updateCycle(
        parsedCycleId,
        {
          startDate: originalStartDate,
          endDate: cycle1EndDate,
          durationDays: 15,
          cycleType: '15_days',
          ratePerLiter: parsedRate,
          paymentDueDate: cycle1DueDate,
        },
        client
      );

      // Create second cycle for remaining dates with same rate
      const cycle2DueDate = originalEndDate;
      const insertResult = await client.query(
        `INSERT INTO farmer_cycles (farmer_id, start_date, end_date, duration_days, cycle_type, rate_per_liter, payment_due_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, farmer_id, start_date, end_date, duration_days, cycle_type, rate_per_liter, payment_due_date, status, created_at`,
        [
          cycle.farmer_id,
          cycle2StartDate,
          cycle2EndDate,
          cycle2Duration,
          cycle2Duration === 15 ? '15_days' : 'custom',
          parsedRate,
          cycle2DueDate,
          'active',
        ]
      );
      const createdCycle2 = insertResult.rows[0];

      // Reassign milk entries belonging to remaining dates from cycle1 to cycle2
      const reassignedEntries = await cycleModel.reassignMilkEntriesByDateRange(
        {
          fromCycleId: parsedCycleId,
          toCycleId: createdCycle2.id,
          startDate: cycle2StartDate,
          endDate: cycle2EndDate,
        },
        client
      );

      // Recalculate both cycles' payment summaries
      const summary1 = await getCyclePaymentSummary(
        { id: parsedCycleId, farmer_id: cycle.farmer_id, start_date: originalStartDate, end_date: cycle1EndDate, rate_per_liter: parsedRate },
        client
      );
      const entryCount1 = await milkModel.getMilkEntryCountByCycleId(parsedCycleId, client);

      const summary2 = await getCyclePaymentSummary(
        { id: createdCycle2.id, farmer_id: cycle.farmer_id, start_date: cycle2StartDate, end_date: cycle2EndDate, rate_per_liter: parsedRate },
        client
      );
      const entryCount2 = await milkModel.getMilkEntryCountByCycleId(createdCycle2.id, client);

      await client.query('COMMIT');

      const cycle1Details = {
        id: Number(parsedCycleId),
        cycleId: Number(parsedCycleId),
        farmerId: Number(cycle.farmer_id),
        startDate: originalStartDate,
        endDate: cycle1EndDate,
        durationDays: 15,
        cycleType: '15_days',
        ratePerLiter: parsedRate,
        paymentDueDate: cycle1DueDate,
        status: updatedCycle1.status,
        milkEntryCount: entryCount1,
        milkEntriesCount: entryCount1,
        totalLiters: summary1.totalLiters,
        grossAmount: summary1.grossAmount,
        feedDeduction: summary1.feedDeduction,
        finalAmount: summary1.finalAmount,
      };

      const cycle2Details = {
        id: Number(createdCycle2.id),
        cycleId: Number(createdCycle2.id),
        farmerId: Number(cycle.farmer_id),
        startDate: cycle2StartDate,
        endDate: cycle2EndDate,
        durationDays: cycle2Duration,
        cycleType: createdCycle2.cycle_type,
        ratePerLiter: parsedRate,
        paymentDueDate: cycle2DueDate,
        status: createdCycle2.status,
        milkEntryCount: entryCount2,
        milkEntriesCount: entryCount2,
        totalLiters: summary2.totalLiters,
        grossAmount: summary2.grossAmount,
        feedDeduction: summary2.feedDeduction,
        finalAmount: summary2.finalAmount,
      };

      return res.json({
        success: true,
        message: 'Cycle shortened to 15 days and second cycle created for remaining dates.',
        ...cycle1Details,
        cycle: cycle1Details,
        createdCycle: cycle2Details,
        createdCycles: [cycle2Details],
        mergedCycles: [],
        reassignedEntriesCount: reassignedEntries.length,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // CASE 2: EXTEND 15-DAY CYCLE TO 30 DAYS (DETECT & MERGE)
    // ─────────────────────────────────────────────────────────────
    if (requestedDuration === 30 && currentDuration <= 15) {
      const targetEndDate = addDays(originalStartDate, 29); // exactly 30 calendar dates

      // Find all overlapping cycles for this farmer in [originalStartDate, targetEndDate], excluding target cycle
      const overlappingCycles = await cycleModel.findOverlappingCycles(
        {
          farmerId: cycle.farmer_id,
          startDate: originalStartDate,
          endDate: targetEndDate,
          excludeCycleId: parsedCycleId,
          forUpdate: true,
        },
        client
      );

      // Check if any overlapping cycle is already paid
      for (const overlap of overlappingCycles) {
        if (overlap.status === 'paid') {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: `Cannot extend cycle: overlapping cycle #${overlap.id} (${toIsoDateString(overlap.start_date)} to ${toIsoDateString(overlap.end_date)}) has already been paid.`,
          });
        }

        const overlapPayment = await paymentModel.findPaymentByCycleId(overlap.id, client);
        if (overlapPayment) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: `Cannot extend cycle: payment record already exists for overlapping cycle #${overlap.id}.`,
          });
        }
      }

      // Check if any overlapping cycle extends beyond the target range
      const extendsBeyond = overlappingCycles.find(
        (c) => toIsoDateString(c.end_date) > targetEndDate || toIsoDateString(c.start_date) < originalStartDate
      );
      if (extendsBeyond) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Cannot extend cycle: overlapping cycle #${extendsBeyond.id} (${toIsoDateString(extendsBeyond.start_date)} to ${toIsoDateString(extendsBeyond.end_date)}) extends beyond the 30-day range (${originalStartDate} to ${targetEndDate}).`,
        });
      }

      // Check for duplicate milk entry conflicts between source cycles and destination cycle
      for (const overlap of overlappingCycles) {
        const conflicts = await cycleModel.checkConflictingMilkEntries(overlap.id, parsedCycleId, client);
        if (conflicts && conflicts.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: `Cannot merge cycles: conflicting milk entry exists for date ${toIsoDateString(conflicts[0].date)} (${conflicts[0].time} session).`,
            conflicts,
          });
        }
      }

      // Invalidate pending distribution previews containing destination or any overlapping cycle
      const allAffectedIds = [parsedCycleId, ...overlappingCycles.map((c) => c.id)];
      await cycleModel.invalidateDistributionPreviewsForCycles(allAffectedIds, client);

      // Merge compatible unpaid cycles into destination cycle
      const mergedCyclesInfo = [];
      for (const overlap of overlappingCycles) {
        mergedCyclesInfo.push({
          id: Number(overlap.id),
          cycleId: Number(overlap.id),
          startDate: toIsoDateString(overlap.start_date),
          endDate: toIsoDateString(overlap.end_date),
          durationDays: overlap.duration_days,
          previousRate: Number(overlap.rate_per_liter),
        });

        // Reassign all milk entries to destination cycle
        await client.query(`UPDATE milk_entries SET cycle_id = $1 WHERE cycle_id = $2`, [parsedCycleId, overlap.id]);

        // Delete redundant cycle record
        await client.query(`DELETE FROM farmer_cycles WHERE id = $1`, [overlap.id]);
      }

      // Reassign any unassigned milk entries for this farmer in the expanded date range
      await cycleModel.assignUnassignedMilkEntries(
        {
          farmerId: cycle.farmer_id,
          cycleId: parsedCycleId,
          startDate: originalStartDate,
          endDate: targetEndDate,
        },
        client
      );

      // Update destination cycle to 30 days
      const resolvedDueDate = paymentDueDate
        ? toIsoDateString(parseValidDate(paymentDueDate))
        : (cycle.payment_due_date > targetEndDate ? toIsoDateString(cycle.payment_due_date) : targetEndDate);

      const updatedDest = await cycleModel.updateCycle(
        parsedCycleId,
        {
          startDate: originalStartDate,
          endDate: targetEndDate,
          durationDays: 30,
          cycleType: '30_days',
          ratePerLiter: parsedRate,
          paymentDueDate: resolvedDueDate,
        },
        client
      );

      if (status) {
        await cycleModel.updateCycleStatus(parsedCycleId, status, client);
      }

      // Recalculate destination cycle summary
      const summary = await getCyclePaymentSummary(
        { id: parsedCycleId, farmer_id: cycle.farmer_id, start_date: originalStartDate, end_date: targetEndDate, rate_per_liter: parsedRate },
        client
      );
      const milkEntryCount = await milkModel.getMilkEntryCountByCycleId(parsedCycleId, client);

      await client.query('COMMIT');

      const destDetails = {
        id: Number(parsedCycleId),
        cycleId: Number(parsedCycleId),
        farmerId: Number(cycle.farmer_id),
        startDate: originalStartDate,
        endDate: targetEndDate,
        durationDays: 30,
        cycleType: '30_days',
        ratePerLiter: parsedRate,
        paymentDueDate: resolvedDueDate,
        status: updatedDest.status,
        milkEntryCount,
        milkEntriesCount: milkEntryCount,
        totalLiters: summary.totalLiters,
        grossAmount: summary.grossAmount,
        feedDeduction: summary.feedDeduction,
        finalAmount: summary.finalAmount,
      };

      return res.json({
        success: true,
        message: mergedCyclesInfo.length > 0
          ? `Cycle extended to 30 days and ${mergedCyclesInfo.length} overlapping cycle(s) merged.`
          : 'Cycle extended to 30 days.',
        ...destDetails,
        cycle: destDetails,
        mergedCycles: mergedCyclesInfo,
        createdCycles: [],
        rateDetails: {
          appliedRate: parsedRate,
          destinationPreviousRate: Number(cycle.rate_per_liter),
          mergedCycles: mergedCyclesInfo.map((m) => ({ id: m.id, previousRate: m.previousRate })),
        },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // CASE 3: GENERAL UPDATE (RATE EDIT, DATES, STATUS)
    // ─────────────────────────────────────────────────────────────
    // If rate was updated, invalidate distribution previews referencing this cycle
    if (rateWasUpdated) {
      await cycleModel.invalidateDistributionPreviewsForCycles([parsedCycleId], client);
    }

    let resolvedStartDate = startDate ? toIsoDateString(parseValidDate(startDate)) : originalStartDate;
    let resolvedEndDate = endDate ? toIsoDateString(parseValidDate(endDate)) : null;
    let resolvedDuration = durationDays !== undefined ? Number(durationDays) : cycle.duration_days;
    let resolvedType = cycleType || cycle.cycle_type;

    if (startDate || endDate || durationDays || cycleType) {
      const resolved = resolveCycleDates({
        startDate: resolvedStartDate,
        endDate: resolvedEndDate,
        durationDays: resolvedDuration,
        cycleType: resolvedType,
      });
      resolvedStartDate = resolved.startDate;
      resolvedEndDate = resolved.endDate;
      resolvedDuration = resolved.durationDays;
      resolvedType = resolved.cycleType;

      const overlap = await cycleModel.findOverlappingCycle(
        {
          farmerId: cycle.farmer_id,
          startDate: resolvedStartDate,
          endDate: resolvedEndDate,
          excludeCycleId: parsedCycleId,
        },
        client
      );

      if (overlap) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Cycle dates overlap with an existing cycle for this farmer.',
        });
      }
    } else {
      resolvedEndDate = originalEndDate;
    }

    let resolvedDueDate = cycle.payment_due_date;
    if (paymentDueDate !== undefined) {
      const parsedDue = parseValidDate(paymentDueDate);
      if (!parsedDue) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'paymentDueDate must be a valid date (YYYY-MM-DD).' });
      }
      resolvedDueDate = toIsoDateString(parsedDue);
    }

    const updated = await cycleModel.updateCycle(
      parsedCycleId,
      {
        startDate: resolvedStartDate,
        endDate: resolvedEndDate,
        durationDays: resolvedDuration,
        cycleType: resolvedType,
        ratePerLiter: parsedRate,
        paymentDueDate: resolvedDueDate,
      },
      client
    );

    if (status) {
      await cycleModel.updateCycleStatus(parsedCycleId, status, client);
    }

    // Recalculate summary
    const summary = await getCyclePaymentSummary(
      { id: parsedCycleId, farmer_id: cycle.farmer_id, start_date: resolvedStartDate, end_date: resolvedEndDate, rate_per_liter: parsedRate },
      client
    );
    const milkEntryCount = await milkModel.getMilkEntryCountByCycleId(parsedCycleId, client);

    await client.query('COMMIT');

    const resultCycle = {
      id: Number(parsedCycleId),
      cycleId: Number(parsedCycleId),
      farmerId: Number(cycle.farmer_id),
      startDate: resolvedStartDate,
      endDate: resolvedEndDate,
      durationDays: resolvedDuration,
      cycleType: resolvedType,
      ratePerLiter: parsedRate,
      paymentDueDate: toIsoDateString(resolvedDueDate),
      status: status || updated.status,
      milkEntryCount,
      milkEntriesCount: milkEntryCount,
      totalLiters: summary.totalLiters,
      grossAmount: summary.grossAmount,
      feedDeduction: summary.feedDeduction,
      finalAmount: summary.finalAmount,
    };

    res.json({
      success: true,
      message: 'Cycle updated successfully.',
      ...resultCycle,
      cycle: resultCycle,
      mergedCycles: [],
      createdCycles: [],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

const splitCycle = asyncHandler(async (req, res, next) => {
  req.body.durationDays = 15;
  return updateCycle(req, res, next);
});

const extendCycle = asyncHandler(async (req, res, next) => {
  req.body.durationDays = 30;
  return updateCycle(req, res, next);
});

const mergeCycle = asyncHandler(async (req, res, next) => {
  req.body.durationDays = 30;
  return updateCycle(req, res, next);
});

const deleteCycle = asyncHandler(async (req, res) => {
  const parsedCycleId = parsePositiveInteger(req.params.id);
  if (!parsedCycleId) {
    return res.status(400).json({ success: false, message: 'Invalid cycle ID.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const cycle = await cycleModel.findCycleByIdForUpdate(parsedCycleId, client);
    if (!cycle) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Cycle not found.' });
    }

    if (cycle.status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Cannot delete a paid payment cycle.',
      });
    }

    await cycleModel.deleteCycle(parsedCycleId, client);
    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Cycle deleted successfully.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  startCycle,
  getActiveCycle,
  getCyclesByFarmer,
  updateCycle,
  splitCycle,
  extendCycle,
  mergeCycle,
  deleteCycle,
};

