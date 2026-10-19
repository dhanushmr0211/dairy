const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const walletModel = require('../models/walletModel');
const distributionModel = require('../models/distributionModel');
const cycleModel = require('../models/cycleModel');
const paymentModel = require('../models/paymentModel');
const { getCyclePaymentSummary } = require('../utils/paymentCalculator');
const { parsePositiveNumber, parseValidDate, toIsoDateString } = require('../utils/validation');

// ── Configuration ──
const DEFAULT_MARGIN = 500;
const MAX_MARGIN = Number(process.env.WALLET_MAX_MARGIN) || 500;

// ────────────────────────────────────────────────
// POST /wallet/receipts  – Record a received payment
// ────────────────────────────────────────────────
const recordReceipt = asyncHandler(async (req, res) => {
  const { amount, receiptDate, reference, notes } = req.body;

  // Validate amount
  const parsedAmount = parsePositiveNumber(amount);
  if (!parsedAmount) {
    return res.status(400).json({ success: false, message: 'amount must be a positive number.' });
  }

  // Validate receipt date
  const parsedDate = receiptDate ? parseValidDate(receiptDate) : new Date();
  if (!parsedDate) {
    return res.status(400).json({ success: false, message: 'receiptDate must be a valid date (YYYY-MM-DD).' });
  }
  const isoDate = toIsoDateString(parsedDate);

  // Check for duplicate reference
  if (reference && reference.trim() !== '') {
    const existing = await walletModel.findReceiptByReference(reference.trim());
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A receipt with reference "${reference.trim()}" already exists.`,
        existingReceipt: {
          id: existing.id,
          amount: Number(existing.amount),
          transactionDate: toIsoDateString(existing.transaction_date),
        },
      });
    }
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const entry = await walletModel.createLedgerEntry(
      {
        transactionType: 'receipt',
        amount: parsedAmount,
        transactionDate: isoDate,
        reference: reference ? reference.trim() : null,
        description: notes || `Payment received from Hatsun on ${isoDate}`,
      },
      client
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      receipt: {
        id: entry.id,
        amount: Number(entry.amount),
        runningBalance: Number(entry.running_balance),
        transactionDate: toIsoDateString(entry.transaction_date),
        reference: entry.reference,
        description: entry.description,
        createdAt: entry.created_at,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// ────────────────────────────────────────────────
// GET /wallet  – Current wallet balance
// ────────────────────────────────────────────────
const getWalletBalance = asyncHandler(async (req, res) => {
  const balance = await walletModel.getWalletBalance();
  const reserved = await walletModel.getReservedAmount();

  res.json({
    success: true,
    balance,
    reservedForDistribution: reserved,
    availableBalance: Number(Math.max(0, balance - reserved).toFixed(2)),
  });
});

// ────────────────────────────────────────────────
// GET /wallet/transactions  – List all transactions
// ────────────────────────────────────────────────
const getTransactions = asyncHandler(async (req, res) => {
  const transactions = await walletModel.getAllTransactions();

  res.json({
    success: true,
    count: transactions.length,
    transactions: transactions.map((t) => ({
      id: t.id,
      transactionType: t.transaction_type,
      amount: Number(t.amount),
      runningBalance: Number(t.running_balance),
      transactionDate: toIsoDateString(t.transaction_date),
      reference: t.reference,
      description: t.description,
      relatedDistributionId: t.related_distribution_id ? Number(t.related_distribution_id) : null,
      relatedPaymentId: t.related_payment_id ? Number(t.related_payment_id) : null,
      createdAt: t.created_at,
    })),
  });
});

// ────────────────────────────────────────────────
// GET /wallet/summary  – Wallet financial summary
// ────────────────────────────────────────────────
const getWalletSummary = asyncHandler(async (req, res) => {
  const summary = await walletModel.getWalletSummary();
  const reserved = await walletModel.getReservedAmount();

  res.json({
    success: true,
    currentBalance: summary.currentBalance,
    totalReceived: summary.totalReceived,
    totalPaidToFarmers: summary.totalPaidToFarmers,
    totalAdjustments: summary.totalAdjustments,
    reservedForDistribution: reserved,
    availableBalance: Number(Math.max(0, summary.currentBalance - reserved).toFixed(2)),
  });
});

// ────────────────────────────────────────────────
// POST /wallet/distribute/preview  – Automatic distribution preview
// ────────────────────────────────────────────────
const distributePreview = asyncHandler(async (req, res) => {
  const { mode: requestedMode, margin: requestedMargin } = req.body || {};

  // Determine mode
  const mode = requestedMode === 'WITHIN_MARGIN' ? 'WITHIN_MARGIN' : 'BELOW_BALANCE';

  // Determine margin
  let margin = DEFAULT_MARGIN;
  if (requestedMargin !== undefined && requestedMargin !== null) {
    const parsedMargin = Number(requestedMargin);
    if (!Number.isFinite(parsedMargin) || parsedMargin < 0) {
      return res.status(400).json({ success: false, message: 'margin must be a non-negative number.' });
    }
    if (parsedMargin > MAX_MARGIN) {
      return res.status(400).json({ success: false, message: `margin cannot exceed ₹${MAX_MARGIN}.` });
    }
    margin = parsedMargin;
  }

  // Expire stale previews
  await distributionModel.expireOldPreviews();

  // 1. Get wallet balance
  const walletBalance = await walletModel.getWalletBalance();

  // 2. Get all unpaid cycles with calculations
  const unpaidCycles = await cycleModel.getUnpaidCyclesWithCalculations();

  // 3. Determine budget based on mode
  const budget = mode === 'WITHIN_MARGIN'
    ? Number((walletBalance + margin).toFixed(2))
    : walletBalance;

  // 4. Select cycles oldest-first within budget
  const selectedCycles = [];
  const unselectedCycles = [];
  const selectedFarmerIds = new Set();
  let proposedTotal = 0;
  let nextUnselectedReason = null;
  let firstSkippedCycle = null;

  for (const cycle of unpaidCycles) {
    const cycleAmount = cycle.finalAmount;
    const newTotal = Number((proposedTotal + cycleAmount).toFixed(2));

    if (newTotal <= budget) {
      selectedCycles.push({
        cycleId: cycle.cycleId,
        farmerId: cycle.farmerId,
        farmerName: cycle.farmerName,
        farmerPhone: cycle.farmerPhone,
        startDate: toIsoDateString(cycle.startDate),
        endDate: toIsoDateString(cycle.endDate),
        durationDays: cycle.durationDays,
        paymentDueDate: toIsoDateString(cycle.paymentDueDate),
        ratePerLiter: cycle.ratePerLiter,
        totalLiters: cycle.totalLiters,
        grossAmount: cycle.grossAmount,
        feedDeduction: cycle.feedDeduction,
        calculatedAmount: cycleAmount,
        status: cycle.status,
      });
      selectedFarmerIds.add(cycle.farmerId);
      proposedTotal = newTotal;
    } else {
      unselectedCycles.push({
        cycleId: cycle.cycleId,
        farmerId: cycle.farmerId,
        farmerName: cycle.farmerName,
        farmerPhone: cycle.farmerPhone,
        startDate: toIsoDateString(cycle.startDate),
        endDate: toIsoDateString(cycle.endDate),
        durationDays: cycle.durationDays,
        paymentDueDate: toIsoDateString(cycle.paymentDueDate),
        ratePerLiter: cycle.ratePerLiter,
        totalLiters: cycle.totalLiters,
        grossAmount: cycle.grossAmount,
        feedDeduction: cycle.feedDeduction,
        calculatedAmount: cycleAmount,
        status: cycle.status,
      });
      if (!firstSkippedCycle) {
        firstSkippedCycle = cycle;
        const deficit = Number((newTotal - budget).toFixed(2));
        nextUnselectedReason = `Cycle #${cycle.cycleId} (${cycle.farmerName}) requires ₹${cycleAmount} but adding it would exceed ${mode === 'WITHIN_MARGIN' ? 'balance + margin' : 'available balance'} by ₹${deficit}.`;
      }
    }
  }

  // 5. Calculate results
  const remainingBalance = Number((walletBalance - proposedTotal).toFixed(2));
  const shortfall = remainingBalance < 0 ? Number(Math.abs(remainingBalance).toFixed(2)) : 0;

  // 6. Generate preview hash
  const previewHash = distributionModel.generatePreviewHash(walletBalance, selectedCycles, mode, margin);

  // 7. Store preview in database
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const preview = await distributionModel.createPreview(
      {
        mode,
        margin,
        walletBalance,
        proposedTotal,
        selectedCycleCount: selectedCycles.length,
        selectedFarmerCount: selectedFarmerIds.size,
        remainingBalance,
        shortfall,
        nextUnselectedReason,
        previewHash,
      },
      client
    );

    if (selectedCycles.length > 0) {
      await distributionModel.addDistributionCycles(preview.id, selectedCycles, client);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      previewId: Number(preview.id),
      walletBalance,
      margin,
      mode,
      selectedCycleCount: selectedCycles.length,
      selectedFarmerCount: selectedFarmerIds.size,
      proposedTotal,
      remainingBalance,
      shortfall,
      nextUnselectedReason,
      previewHash,
      expiresAt: preview.expires_at,
      selectedCycles,
      unselectedCycles,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// ────────────────────────────────────────────────
// POST /wallet/distribute/confirm  – Confirm a distribution
// ────────────────────────────────────────────────
const distributeConfirm = asyncHandler(async (req, res) => {
  const { previewId, previewHash, idempotencyKey } = req.body;

  if (!previewId) {
    return res.status(400).json({ success: false, message: 'previewId is required.' });
  }
  if (!previewHash) {
    return res.status(400).json({ success: false, message: 'previewHash is required.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Check idempotency
    if (idempotencyKey) {
      const existingPreview = await distributionModel.findPreviewByIdempotencyKey(idempotencyKey, client);
      if (existingPreview && existingPreview.status === 'confirmed') {
        await client.query('ROLLBACK');
        return res.status(200).json({
          success: true,
          message: 'Distribution already confirmed (idempotent response).',
          distributionId: Number(existingPreview.id),
        });
      }
    }

    // 2. Lock and fetch the preview
    const preview = await distributionModel.findPreviewByIdForUpdate(previewId, client);
    if (!preview) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Distribution preview not found.' });
    }

    if (preview.status === 'confirmed') {
      await client.query('ROLLBACK');
      return res.status(200).json({
        success: true,
        message: 'Distribution already confirmed.',
        distributionId: Number(preview.id),
      });
    }

    if (preview.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: `Preview has status "${preview.status}" and cannot be confirmed.` });
    }

    if (new Date(preview.expires_at) < new Date()) {
      await client.query(
        `UPDATE distribution_previews SET status = 'expired' WHERE id = $1`,
        [previewId]
      );
      await client.query('COMMIT');
      return res.status(410).json({ success: false, message: 'Preview has expired. Please generate a new preview.' });
    }

    // 3. Verify hash
    if (preview.preview_hash !== previewHash) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Preview hash mismatch. The distribution state has changed. Please generate a new preview.' });
    }

    // 4. Lock wallet balance
    const currentBalance = await walletModel.getWalletBalanceForUpdate(client);

    // 5. Get the distribution cycles
    const distCycles = await distributionModel.getDistributionCycles(previewId, client);
    if (distCycles.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'No cycles in this preview.' });
    }

    // 6. Recalculate amounts and verify cycles are still unpaid
    const cycleIds = distCycles.map((dc) => Number(dc.cycle_id));
    const lockedCycles = await cycleModel.findCyclesByIdsForUpdate(cycleIds, client);

    if (lockedCycles.length !== cycleIds.length) {
      const foundIds = new Set(lockedCycles.map((c) => Number(c.id)));
      const missing = cycleIds.filter((id) => !foundIds.has(id));
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `Cycles no longer available: ${missing.join(', ')}. Please generate a new preview.`,
      });
    }

    // Verify all cycles are unpaid and recalculate amounts
    let recalculatedTotal = 0;
    const recalculatedAmounts = new Map();

    for (const cycle of lockedCycles) {
      if (cycle.status === 'paid') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Cycle #${cycle.id} has already been paid. Please generate a new preview.`,
        });
      }

      const existing = await paymentModel.findPaymentByCycleId(cycle.id, client);
      if (existing) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Payment already exists for cycle #${cycle.id}. Please generate a new preview.`,
        });
      }

      const { totalLiters, grossAmount, feedDeduction, finalAmount } = await getCyclePaymentSummary(cycle, client);
      recalculatedAmounts.set(Number(cycle.id), { totalLiters, grossAmount, feedDeduction, finalAmount });
      recalculatedTotal = Number((recalculatedTotal + finalAmount).toFixed(2));
    }

    // 7. Verify the recalculated total matches the preview
    const previewTotal = Number(preview.proposed_total);
    if (recalculatedTotal !== previewTotal) {
      // Reject – amounts changed
      await client.query(
        `UPDATE distribution_previews SET status = 'rejected' WHERE id = $1`,
        [previewId]
      );
      await client.query('COMMIT');
      return res.status(409).json({
        success: false,
        message: `Amounts changed since preview. Expected ₹${previewTotal}, recalculated ₹${recalculatedTotal}. Please generate a new preview.`,
      });
    }

    // 8. Verify wallet has enough balance (actual balance, not margin-adjusted)
    if (currentBalance < recalculatedTotal) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `Insufficient wallet balance. Available: ₹${currentBalance}, Required: ₹${recalculatedTotal}. Please generate a new preview.`,
      });
    }

    // 9. Regenerate hash and verify consistency
    const selectedForHash = distCycles.map((dc) => ({
      cycleId: Number(dc.cycle_id),
      calculatedAmount: recalculatedAmounts.get(Number(dc.cycle_id)).finalAmount,
    }));
    const recomputedHash = distributionModel.generatePreviewHash(
      Number(preview.wallet_balance_at_preview),
      selectedForHash,
      preview.mode,
      Number(preview.margin)
    );
    if (recomputedHash !== previewHash) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Distribution state changed. Please generate a new preview.',
      });
    }

    // 10. Process payments – use existing payment processing
    const paidDate = toIsoDateString(new Date());
    const paymentsCreated = [];

    for (const cycle of lockedCycles) {
      const calc = recalculatedAmounts.get(Number(cycle.id));

      // Create the farmer payment record via existing model
      const payment = await paymentModel.createPayment(
        {
          cycleId: cycle.id,
          totalLiters: calc.totalLiters,
          totalAmount: calc.grossAmount,
          feedDeduction: calc.feedDeduction,
          finalAmount: calc.finalAmount,
          paidDate,
        },
        client
      );

      // Mark cycle as paid
      await cycleModel.markCycleAsPaid(cycle.id, client);

      // Update distribution_cycles with the payment ID
      await distributionModel.updateDistributionCyclePayment(previewId, cycle.id, payment.id, client);

      // Create wallet debit entry
      await walletModel.createLedgerEntry(
        {
          transactionType: 'farmer_payment',
          amount: -calc.finalAmount,
          transactionDate: paidDate,
          description: `Payment for cycle #${cycle.id} (${cycle.farmer_name})`,
          relatedDistributionId: previewId,
          relatedPaymentId: payment.id,
        },
        client
      );

      paymentsCreated.push({
        paymentId: payment.id,
        cycleId: Number(cycle.id),
        farmerId: Number(cycle.farmer_id),
        farmerName: cycle.farmer_name,
        totalLiters: calc.totalLiters,
        grossAmount: calc.grossAmount,
        feedDeduction: calc.feedDeduction,
        finalAmount: calc.finalAmount,
        paidDate,
      });
    }

    // 11. Mark preview as confirmed
    await distributionModel.confirmPreview(previewId, client);

    // Set idempotency key if provided
    if (idempotencyKey) {
      await client.query(
        `UPDATE distribution_previews SET idempotency_key = $1 WHERE id = $2`,
        [idempotencyKey, previewId]
      );
    }

    // 12. Get final wallet balance
    const finalBalance = await walletModel.getWalletBalance(client);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      distributionId: Number(previewId),
      farmerCount: new Set(paymentsCreated.map((p) => p.farmerId)).size,
      cycleCount: paymentsCreated.length,
      totalAmount: recalculatedTotal,
      walletBalanceBefore: currentBalance,
      walletBalanceAfter: finalBalance,
      payments: paymentsCreated,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// ────────────────────────────────────────────────
// GET /wallet/receipts  – List all receipts
// ────────────────────────────────────────────────
const getReceipts = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT id, amount, running_balance, transaction_date, reference, description, created_at
     FROM wallet_ledger
     WHERE transaction_type = 'receipt'
     ORDER BY id DESC`
  );

  res.json({
    success: true,
    count: result.rows.length,
    receipts: result.rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      runningBalance: Number(r.running_balance),
      transactionDate: toIsoDateString(r.transaction_date),
      reference: r.reference,
      description: r.description,
      createdAt: r.created_at,
    })),
  });
});

// ────────────────────────────────────────────────
// GET /wallet/distributions  – Distribution history
// ────────────────────────────────────────────────
const getDistributions = asyncHandler(async (req, res) => {
  const previews = await distributionModel.listPreviews();

  res.json({
    success: true,
    count: previews.length,
    distributions: previews.map((p) => ({
      id: Number(p.id),
      status: p.status,
      mode: p.mode,
      margin: Number(p.margin),
      walletBalanceAtPreview: Number(p.wallet_balance_at_preview),
      proposedTotal: Number(p.proposed_total),
      selectedCycleCount: p.selected_cycle_count,
      selectedFarmerCount: p.selected_farmer_count,
      remainingBalance: Number(p.remaining_balance),
      shortfall: Number(p.shortfall),
      nextUnselectedReason: p.next_unselected_reason,
      confirmedAt: p.confirmed_at,
      createdAt: p.created_at,
      expiresAt: p.expires_at,
    })),
  });
});

// ────────────────────────────────────────────────
// GET /wallet/distributions/:id  – Distribution detail
// ────────────────────────────────────────────────
const getDistributionDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const preview = await distributionModel.findPreviewById(id);
  if (!preview) {
    return res.status(404).json({ success: false, message: 'Distribution not found.' });
  }

  const cycles = await distributionModel.getDistributionCycles(id);

  res.json({
    success: true,
    distribution: {
      id: Number(preview.id),
      status: preview.status,
      mode: preview.mode,
      margin: Number(preview.margin),
      walletBalanceAtPreview: Number(preview.wallet_balance_at_preview),
      proposedTotal: Number(preview.proposed_total),
      selectedCycleCount: preview.selected_cycle_count,
      selectedFarmerCount: preview.selected_farmer_count,
      remainingBalance: Number(preview.remaining_balance),
      shortfall: Number(preview.shortfall),
      nextUnselectedReason: preview.next_unselected_reason,
      confirmedAt: preview.confirmed_at,
      createdAt: preview.created_at,
      expiresAt: preview.expires_at,
    },
    cycles: cycles.map((c) => ({
      id: Number(c.id),
      cycleId: Number(c.cycle_id),
      farmerId: Number(c.farmer_id),
      farmerName: c.farmer_name,
      farmerPhone: c.farmer_phone,
      calculatedAmount: Number(c.calculated_amount),
      paymentId: c.payment_id ? Number(c.payment_id) : null,
      startDate: toIsoDateString(c.start_date),
      endDate: toIsoDateString(c.end_date),
      durationDays: Number(c.duration_days),
      paymentDueDate: toIsoDateString(c.payment_due_date),
      cycleStatus: c.cycle_status,
    })),
  });
});

module.exports = {
  recordReceipt,
  getWalletBalance,
  getTransactions,
  getWalletSummary,
  distributePreview,
  distributeConfirm,
  getReceipts,
  getDistributions,
  getDistributionDetail,
};
