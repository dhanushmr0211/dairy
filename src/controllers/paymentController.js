const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const cycleModel = require('../models/cycleModel');
const paymentModel = require('../models/paymentModel');
const farmerModel = require('../models/farmerModel');
const { parsePositiveInteger, parseValidDate, toIsoDateString } = require('../utils/validation');
const { getCyclePaymentSummary } = require('../utils/paymentCalculator');

function getDaysDiff(targetDateStr, baseDateStr) {
  const target = new Date(targetDateStr).setHours(0, 0, 0, 0);
  const base = new Date(baseDateStr).setHours(0, 0, 0, 0);
  const diffTime = target - base;
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculates live financial metrics from the list of unpaid cycles and selected cycle IDs.
 */
function computeFinancialMetrics(unpaidCycles, selectedIdsSet = new Set(), todayStr) {
  let curOverdueAmount = 0;
  let curPendingAmount = 0;
  let curOverdueCount = 0;
  let curPendingCount = 0;

  let selOverdueAmount = 0;
  let selPendingAmount = 0;
  let selOverdueCount = 0;
  let selPendingCount = 0;

  for (const c of unpaidCycles) {
    const dueDateStr = toIsoDateString(c.paymentDueDate);
    const daysRemaining = getDaysDiff(dueDateStr, todayStr);
    const isOverdue = daysRemaining < 0;

    if (isOverdue) {
      curOverdueAmount += c.finalAmount;
      curOverdueCount += 1;
    } else {
      curPendingAmount += c.finalAmount;
      curPendingCount += 1;
    }

    if (selectedIdsSet.has(c.cycleId)) {
      if (isOverdue) {
        selOverdueAmount += c.finalAmount;
        selOverdueCount += 1;
      } else {
        selPendingAmount += c.finalAmount;
        selPendingCount += 1;
      }
    }
  }

  const curTotalOutstanding = Number((curOverdueAmount + curPendingAmount).toFixed(2));
  const selTotalAmount = Number((selOverdueAmount + selPendingAmount).toFixed(2));

  const afterOverdueAmount = Number(Math.max(0, curOverdueAmount - selOverdueAmount).toFixed(2));
  const afterPendingAmount = Number(Math.max(0, curPendingAmount - selPendingAmount).toFixed(2));
  const afterTotalOutstanding = Number((afterOverdueAmount + afterPendingAmount).toFixed(2));

  const afterOverdueCount = Math.max(0, curOverdueCount - selOverdueCount);
  const afterPendingCount = Math.max(0, curPendingCount - selPendingCount);

  return {
    current: {
      overdueAmount: Number(curOverdueAmount.toFixed(2)),
      pendingAmount: Number(curPendingAmount.toFixed(2)),
      totalOutstanding: curTotalOutstanding,
      overdueCycleCount: curOverdueCount,
      pendingCycleCount: curPendingCount,
    },
    selectedTotals: {
      amount: selTotalAmount,
    },
    afterPayment: {
      overdueAmount: afterOverdueAmount,
      pendingAmount: afterPendingAmount,
      totalOutstanding: afterTotalOutstanding,
      overdueCycleCount: afterOverdueCount,
      pendingCycleCount: afterPendingCount,
    },
  };
}

// ── GET /payments/pending (Filtered Payment Cycles) ──
const getPendingPayments = asyncHandler(async (req, res) => {
  const { status, farmerId, date, dateFrom, dateTo, duration } = req.query;
  const todayStr = toIsoDateString(new Date());

  const unpaidCycles = await cycleModel.getUnpaidCyclesWithCalculations();

  const filtered = unpaidCycles.filter((c) => {
    const dueDateStr = toIsoDateString(c.paymentDueDate);
    const daysRemaining = getDaysDiff(dueDateStr, todayStr);
    const isOverdue = daysRemaining < 0;
    const isDueToday = daysRemaining === 0;
    const isUpcoming = daysRemaining > 0;

    // Status filter
    if (status) {
      const s = String(status).toLowerCase();
      if (s === 'overdue' && !isOverdue) return false;
      if (s === 'due_today' && !isDueToday) return false;
      if (s === 'upcoming' && !isUpcoming) return false;
    }

    // Farmer filter
    if (farmerId) {
      const pFarmerId = parsePositiveInteger(farmerId);
      if (pFarmerId && c.farmerId !== pFarmerId) return false;
    }

    // Specific date filter
    if (date) {
      const parsedDate = parseValidDate(date);
      if (parsedDate && dueDateStr !== toIsoDateString(parsedDate)) return false;
    }

    // Date range filter
    if (dateFrom) {
      const parsedFrom = parseValidDate(dateFrom);
      if (parsedFrom && dueDateStr < toIsoDateString(parsedFrom)) return false;
    }
    if (dateTo) {
      const parsedTo = parseValidDate(dateTo);
      if (parsedTo && dueDateStr > toIsoDateString(parsedTo)) return false;
    }

    // Duration filter
    if (duration) {
      const pDur = Number(duration);
      if ([15, 30].includes(pDur) && c.durationDays !== pDur) return false;
    }

    return true;
  });

  const formattedCycles = filtered.map((c) => {
    const dueDateStr = toIsoDateString(c.paymentDueDate);
    const daysRemaining = getDaysDiff(dueDateStr, todayStr);
    return {
      cycleId: c.cycleId,
      farmerId: c.farmerId,
      farmerName: c.farmerName,
      farmerPhone: c.farmerPhone,
      farmerStatus: c.farmerStatus,
      startDate: toIsoDateString(c.startDate),
      endDate: toIsoDateString(c.endDate),
      durationDays: c.durationDays,
      paymentDueDate: dueDateStr,
      daysRemaining,
      ratePerLiter: c.ratePerLiter,
      totalLiters: c.totalLiters,
      grossAmount: c.grossAmount,
      feedDeduction: c.feedDeduction,
      finalAmount: c.finalAmount,
      status: c.status,
      isOverdue: daysRemaining < 0,
      isDueToday: daysRemaining === 0,
    };
  });

  res.json({
    success: true,
    count: formattedCycles.length,
    cycles: formattedCycles,
  });
});

// ── GET /payments/financial-summary ──
const getFinancialSummary = asyncHandler(async (req, res) => {
  const todayStr = toIsoDateString(new Date());
  const unpaidCycles = await cycleModel.getUnpaidCyclesWithCalculations();

  const metrics = computeFinancialMetrics(unpaidCycles, new Set(), todayStr);

  res.json({
    success: true,
    current: metrics.current,
  });
});

// ── POST /payments/selected (Live Calculator with Simulation) ──
const getSelectedPaymentsPreview = asyncHandler(async (req, res) => {
  const { cycleIds } = req.body;

  if (!cycleIds || !Array.isArray(cycleIds)) {
    return res.status(400).json({
      success: false,
      message: 'cycleIds must be an array of cycle IDs (e.g. [1, 3, 7]).',
    });
  }

  const todayStr = toIsoDateString(new Date());
  const unpaidCycles = await cycleModel.getUnpaidCyclesWithCalculations();

  const unpaidCyclesMap = new Map();
  for (const c of unpaidCycles) {
    unpaidCyclesMap.set(c.cycleId, c);
  }

  const selectedCycles = [];
  const selectedFarmerIds = new Set();
  const selectedIdsSet = new Set();

  for (const rawId of cycleIds) {
    const cycleId = parsePositiveInteger(rawId);
    if (!cycleId) {
      return res.status(400).json({
        success: false,
        message: `Invalid cycle ID: ${rawId}`,
      });
    }

    const cycle = unpaidCyclesMap.get(cycleId);
    if (!cycle) {
      return res.status(400).json({
        success: false,
        message: `Cycle ID ${cycleId} not found or is already paid.`,
      });
    }

    if (!selectedIdsSet.has(cycleId)) {
      selectedIdsSet.add(cycleId);
      selectedFarmerIds.add(cycle.farmerId);

      const dueDateStr = toIsoDateString(cycle.paymentDueDate);
      const daysRemaining = getDaysDiff(dueDateStr, todayStr);

      selectedCycles.push({
        cycleId: cycle.cycleId,
        farmerId: cycle.farmerId,
        farmerName: cycle.farmerName,
        farmerPhone: cycle.farmerPhone,
        startDate: toIsoDateString(cycle.startDate),
        endDate: toIsoDateString(cycle.endDate),
        paymentDueDate: dueDateStr,
        durationDays: cycle.durationDays,
        ratePerLiter: cycle.ratePerLiter,
        totalLiters: cycle.totalLiters,
        grossAmount: cycle.grossAmount,
        feedDeduction: cycle.feedDeduction,
        finalAmount: cycle.finalAmount,
        status: cycle.status,
        isOverdue: daysRemaining < 0,
        isDueToday: daysRemaining === 0,
        daysRemaining,
      });
    }
  }

  const metrics = computeFinancialMetrics(unpaidCycles, selectedIdsSet, todayStr);

  res.json({
    success: true,
    selected: {
      cycleCount: selectedCycles.length,
      farmerCount: selectedFarmerIds.size,
      amount: metrics.selectedTotals.amount,
    },
    selectedCycles,
    current: metrics.current,
    afterPayment: metrics.afterPayment,
  });
});

// ── GET /payments/preview/:cycleId ──
const getPaymentPreview = asyncHandler(async (req, res) => {
  const { cycleId } = req.params;
  const parsedCycleId = parsePositiveInteger(cycleId);
  if (!parsedCycleId) {
    return res.status(400).json({ success: false, message: 'cycleId must be a positive integer.' });
  }

  const cycle = await cycleModel.findCycleById(parsedCycleId);
  if (!cycle) {
    return res.status(404).json({ success: false, message: 'Cycle not found.' });
  }

  const { totalLiters, grossAmount, feedDeduction, finalAmount } = await getCyclePaymentSummary(cycle, db);

  res.json({
    success: true,
    farmer: {
      id: cycle.farmer_id,
      name: cycle.farmer_name,
      phone: cycle.farmer_phone,
    },
    cycle: {
      id: cycle.id,
      start_date: toIsoDateString(cycle.start_date),
      end_date: toIsoDateString(cycle.end_date),
      duration_days: cycle.duration_days,
      payment_due_date: toIsoDateString(cycle.payment_due_date),
      rate_per_liter: cycle.rate_per_liter,
      status: cycle.status,
    },
    start_date: toIsoDateString(cycle.start_date),
    end_date: toIsoDateString(cycle.end_date),
    payment_due_date: toIsoDateString(cycle.payment_due_date),
    rate: Number(cycle.rate_per_liter),
    rate_per_liter: Number(cycle.rate_per_liter),
    total_liters: totalLiters,
    gross_amount: grossAmount,
    feed_deduction: feedDeduction,
    final_amount: finalAmount,
    is_paid: cycle.status === 'paid',
  });
});

// ── GET /payments/upcoming (?days=7) ──
const getUpcomingPayments = asyncHandler(async (req, res) => {
  const daysLimit = req.query.days ? parseInt(req.query.days, 10) : null;
  const todayStr = toIsoDateString(new Date());

  const unpaidCycles = await cycleModel.getUnpaidCyclesWithCalculations();

  const overdue = [];
  const dueToday = [];
  const upcoming = [];

  for (const cycle of unpaidCycles) {
    const dueDateStr = toIsoDateString(cycle.paymentDueDate);
    const daysRemaining = getDaysDiff(dueDateStr, todayStr);

    const item = {
      farmerId: cycle.farmerId,
      farmerName: cycle.farmerName,
      cycleId: cycle.cycleId,
      startDate: toIsoDateString(cycle.startDate),
      endDate: toIsoDateString(cycle.endDate),
      paymentDueDate: dueDateStr,
      daysRemaining,
      totalLiters: cycle.totalLiters,
      ratePerLiter: cycle.ratePerLiter,
      grossAmount: cycle.grossAmount,
      feedDeduction: cycle.feedDeduction,
      finalAmount: cycle.finalAmount,
      status: cycle.status,
    };

    if (daysRemaining < 0) {
      overdue.push(item);
    } else if (daysRemaining === 0) {
      dueToday.push(item);
    } else {
      if (daysLimit === null || daysRemaining <= daysLimit) {
        upcoming.push(item);
      }
    }
  }

  res.json({
    success: true,
    overdue,
    due_today: dueToday,
    upcoming,
    total_unpaid_cycles: unpaidCycles.length,
  });
});

// ── GET /payments/summary ──
const getPaymentSummary = asyncHandler(async (req, res) => {
  const todayStr = toIsoDateString(new Date());
  const unpaidCycles = await cycleModel.getUnpaidCyclesWithCalculations();

  let farmersDueToday = 0;
  let amountDueToday = 0;
  let overdueFarmers = 0;
  let overdueAmount = 0;
  let upcomingPayments = 0;
  let upcomingAmount = 0;
  let totalPendingPaymentAmount = 0;

  for (const cycle of unpaidCycles) {
    const dueDateStr = toIsoDateString(cycle.paymentDueDate);
    const daysRemaining = getDaysDiff(dueDateStr, todayStr);

    totalPendingPaymentAmount += cycle.finalAmount;

    if (daysRemaining < 0) {
      overdueFarmers += 1;
      overdueAmount += cycle.finalAmount;
    } else if (daysRemaining === 0) {
      farmersDueToday += 1;
      amountDueToday += cycle.finalAmount;
    } else {
      upcomingPayments += 1;
      upcomingAmount += cycle.finalAmount;
    }
  }

  res.json({
    success: true,
    farmers_due_today: farmersDueToday,
    amount_due_today: Number(amountDueToday.toFixed(2)),
    overdue_farmers: overdueFarmers,
    overdue_amount: Number(overdueAmount.toFixed(2)),
    upcoming_payments: upcomingPayments,
    upcoming_amount: Number(upcomingAmount.toFixed(2)),
    total_pending_payment_amount: Number(totalPendingPaymentAmount.toFixed(2)),
  });
});

// ── POST /payments/pay-selected (Atomic batch settlement) ──
const paySelectedCycles = asyncHandler(async (req, res) => {
  const { cycleIds, paidDate } = req.body;

  if (!Array.isArray(cycleIds) || cycleIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'cycleIds must be a non-empty array of cycle IDs.',
    });
  }

  const parsedPaidDate = paidDate ? parseValidDate(paidDate) : new Date();
  if (!parsedPaidDate) {
    return res.status(400).json({ success: false, message: 'paidDate must be a valid date (YYYY-MM-DD).' });
  }
  const isoPaidDate = toIsoDateString(parsedPaidDate);

  // Deduplicate and validate cycle IDs
  const validIds = Array.from(new Set(cycleIds.map(parsePositiveInteger).filter(Boolean)));
  if (validIds.length !== cycleIds.length) {
    return res.status(400).json({ success: false, message: 'Invalid or duplicate cycle IDs provided.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Lock all requested cycles FOR UPDATE (ordered by ID to avoid deadlocks)
    const cycles = await cycleModel.findCyclesByIdsForUpdate(validIds, client);

    if (cycles.length !== validIds.length) {
      const foundIds = new Set(cycles.map((c) => Number(c.id)));
      const missing = validIds.filter((id) => !foundIds.has(id));
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: `Cycles not found: ${missing.join(', ')}`,
      });
    }

    // 2. Validate none are already paid
    for (const cycle of cycles) {
      if (cycle.status === 'paid') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Cycle #${cycle.id} for farmer ${cycle.farmer_name} is already paid.`,
        });
      }

      const existingPayment = await paymentModel.findPaymentByCycleId(cycle.id, client);
      if (existingPayment) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Payment already exists for cycle #${cycle.id}.`,
        });
      }
    }

    // 3. Process all calculations & records atomically (recalculated independently from DB)
    const paymentsCreated = [];
    let totalPaidSum = 0;

    for (const cycle of cycles) {
      const { totalLiters, grossAmount, feedDeduction, finalAmount } = await getCyclePaymentSummary(cycle, client);

      const payment = await paymentModel.createPayment(
        {
          cycleId: cycle.id,
          totalLiters,
          totalAmount: grossAmount,
          feedDeduction,
          finalAmount,
          paidDate: isoPaidDate,
        },
        client
      );

      await cycleModel.markCycleAsPaid(cycle.id, client);

      totalPaidSum += finalAmount;
      paymentsCreated.push({
        paymentId: payment.id,
        cycleId: cycle.id,
        farmerId: cycle.farmer_id,
        farmerName: cycle.farmer_name,
        totalLiters,
        grossAmount,
        feedDeduction,
        finalAmount,
        paidDate: isoPaidDate,
      });
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      farmerCount: new Set(paymentsCreated.map((p) => p.farmerId)).size,
      cycleCount: paymentsCreated.length,
      totalAmount: Number(totalPaidSum.toFixed(2)),
      payments: paymentsCreated,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// ── POST /payments/pay (Single cycle pay) ──
const payCycle = asyncHandler(async (req, res) => {
  const { cycleId, paidDate } = req.body;

  if (!cycleId) {
    return res.status(400).json({ success: false, message: 'cycleId is required.' });
  }
  const parsedCycleId = parsePositiveInteger(cycleId);
  if (!parsedCycleId) {
    return res.status(400).json({ success: false, message: 'cycleId must be a positive integer.' });
  }

  const parsedPaidDate = paidDate ? parseValidDate(paidDate) : new Date();
  if (!parsedPaidDate) {
    return res.status(400).json({ success: false, message: 'paidDate must be a valid date (YYYY-MM-DD).' });
  }
  const isoPaidDate = toIsoDateString(parsedPaidDate);

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
      return res.status(409).json({ success: false, message: 'Cycle already paid.' });
    }

    const existingPayment = await paymentModel.findPaymentByCycleId(parsedCycleId, client);
    if (existingPayment) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Cycle already paid.' });
    }

    const { totalLiters, grossAmount, feedDeduction, finalAmount } = await getCyclePaymentSummary(cycle, client);

    const payment = await paymentModel.createPayment(
      {
        cycleId: parsedCycleId,
        totalLiters,
        totalAmount: grossAmount,
        feedDeduction,
        finalAmount,
        paidDate: isoPaidDate,
      },
      client
    );

    await cycleModel.markCycleAsPaid(parsedCycleId, client);
    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      ...payment,
      farmer_id: cycle.farmer_id,
      farmer_name: cycle.farmer_name,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// ── GET /payments/:farmerId (Farmer payment history) ──
const getPaymentsByFarmer = asyncHandler(async (req, res) => {
  const parsedFarmerId = parsePositiveInteger(req.params.farmerId);
  if (!parsedFarmerId) {
    return res.status(400).json({ success: false, message: 'farmerId must be a positive integer.' });
  }

  const farmer = await farmerModel.findFarmerById(parsedFarmerId);
  if (!farmer) {
    return res.status(404).json({ success: false, message: 'Farmer not found.' });
  }

  const payments = await paymentModel.getPaymentsByFarmerId(parsedFarmerId);
  res.json(payments);
});

module.exports = {
  getPendingPayments,
  getFinancialSummary,
  getSelectedPaymentsPreview,
  getPaymentPreview,
  getUpcomingPayments,
  getPaymentSummary,
  paySelectedCycles,
  payCycle,
  getPaymentsByFarmer,
};
