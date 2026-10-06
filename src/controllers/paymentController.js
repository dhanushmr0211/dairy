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
      start_date: cycle.start_date,
      end_date: cycle.end_date,
      duration_days: cycle.duration_days,
      payment_due_date: cycle.payment_due_date,
      rate_per_liter: cycle.rate_per_liter,
      status: cycle.status,
    },
    start_date: cycle.start_date,
    end_date: cycle.end_date,
    payment_due_date: cycle.payment_due_date,
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

  const unpaidCycles = await cycleModel.getAllUnpaidCycles();

  const overdue = [];
  const dueToday = [];
  const upcoming = [];

  for (const cycle of unpaidCycles) {
    const { totalLiters, grossAmount, feedDeduction, finalAmount } = await getCyclePaymentSummary(cycle, db);
    const dueDateStr = toIsoDateString(cycle.payment_due_date);
    const daysRemaining = getDaysDiff(dueDateStr, todayStr);

    const item = {
      farmerId: cycle.farmer_id,
      farmerName: cycle.farmer_name,
      cycleId: cycle.id,
      startDate: cycle.start_date,
      endDate: cycle.end_date,
      paymentDueDate: cycle.payment_due_date,
      daysRemaining,
      totalLiters,
      ratePerLiter: Number(cycle.rate_per_liter),
      grossAmount,
      feedDeduction,
      finalAmount,
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
  const unpaidCycles = await cycleModel.getAllUnpaidCycles();

  let farmersDueToday = 0;
  let amountDueToday = 0;
  let overdueFarmers = 0;
  let overdueAmount = 0;
  let upcomingPayments = 0;
  let upcomingAmount = 0;
  let totalPendingPaymentAmount = 0;

  for (const cycle of unpaidCycles) {
    const { finalAmount } = await getCyclePaymentSummary(cycle, db);
    const dueDateStr = toIsoDateString(cycle.payment_due_date);
    const daysRemaining = getDaysDiff(dueDateStr, todayStr);

    totalPendingPaymentAmount += finalAmount;

    if (daysRemaining < 0) {
      overdueFarmers += 1;
      overdueAmount += finalAmount;
    } else if (daysRemaining === 0) {
      farmersDueToday += 1;
      amountDueToday += finalAmount;
    } else {
      upcomingPayments += 1;
      upcomingAmount += finalAmount;
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

// ── POST /payments/selected (Multi-farmer preview) ──
const getSelectedPaymentsPreview = asyncHandler(async (req, res) => {
  const { cycleIds } = req.body;

  if (!Array.isArray(cycleIds) || cycleIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'cycleIds must be a non-empty array of cycle IDs.',
    });
  }

  const selectedFarmers = [];
  let totalAmount = 0;

  for (const rawId of cycleIds) {
    const cycleId = parsePositiveInteger(rawId);
    if (!cycleId) {
      return res.status(400).json({
        success: false,
        message: `Invalid cycle ID: ${rawId}`,
      });
    }

    const cycle = await cycleModel.findCycleById(cycleId);
    if (!cycle) {
      return res.status(404).json({
        success: false,
        message: `Cycle ID ${cycleId} not found.`,
      });
    }

    if (cycle.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: `Cycle ID ${cycleId} (Farmer: ${cycle.farmer_name}) is already paid.`,
      });
    }

    const { totalLiters, grossAmount, feedDeduction, finalAmount } = await getCyclePaymentSummary(cycle, db);
    totalAmount += finalAmount;

    selectedFarmers.push({
      farmerId: cycle.farmer_id,
      farmerName: cycle.farmer_name,
      cycleId: cycle.id,
      amount: finalAmount,
      totalLiters,
      ratePerLiter: Number(cycle.rate_per_liter),
      grossAmount,
      feedDeduction,
      finalAmount,
    });
  }

  res.json({
    selectedFarmers,
    farmerCount: selectedFarmers.length,
    totalAmount: Number(totalAmount.toFixed(2)),
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

    // 3. Process all calculations & records atomically
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
      farmerCount: paymentsCreated.length,
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
  getPaymentPreview,
  getUpcomingPayments,
  getPaymentSummary,
  getSelectedPaymentsPreview,
  paySelectedCycles,
  payCycle,
  getPaymentsByFarmer,
};
