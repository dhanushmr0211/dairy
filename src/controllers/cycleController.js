const asyncHandler = require('../utils/asyncHandler');
const cycleModel = require('../models/cycleModel');
const farmerModel = require('../models/farmerModel');
const { getCyclePaymentSummary } = require('../utils/paymentCalculator');
const { resolveCycleDates } = require('../utils/cycleDates');
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

    const { startDate, endDate, durationDays, cycleType, ratePerLiter, paymentDueDate, status } = req.body;

    if (status && status !== 'active' && status !== 'pending_payment') {
      if (status === 'paid') {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'To pay a cycle, use the payment settlement endpoint.' });
      }
    }

    let resolvedStartDate = startDate ? toIsoDateString(parseValidDate(startDate)) : toIsoDateString(cycle.start_date);
    let resolvedEndDate = endDate ? toIsoDateString(parseValidDate(endDate)) : null;
    let resolvedDuration = durationDays !== undefined ? durationDays : cycle.duration_days;
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
      resolvedEndDate = toIsoDateString(cycle.end_date);
    }

    let parsedRate = cycle.rate_per_liter;
    if (ratePerLiter !== undefined) {
      parsedRate = parsePositiveNumber(ratePerLiter);
      if (!parsedRate) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'ratePerLiter must be greater than 0.' });
      }
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

    await client.query('COMMIT');

    res.json({
      success: true,
      ...updated,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
  deleteCycle,
};
