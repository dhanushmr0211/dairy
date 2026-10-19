const asyncHandler = require('../utils/asyncHandler');
const farmerModel = require('../models/farmerModel');
const milkModel = require('../models/milkModel');
const cycleModel = require('../models/cycleModel');
const walletModel = require('../models/walletModel');
const distributionModel = require('../models/distributionModel');
const { getCyclePaymentSummary } = require('../utils/paymentCalculator');
const { toIsoDateString } = require('../utils/validation');
const db = require('../config/db');

function getDaysDiff(targetDateStr, baseDateStr) {
  const target = new Date(targetDateStr).setHours(0, 0, 0, 0);
  const base = new Date(baseDateStr).setHours(0, 0, 0, 0);
  const diffTime = target - base;
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

const getDashboard = asyncHandler(async (req, res) => {
  const client = await db.getClient();

  try {
    const todayStr = toIsoDateString(new Date());

    const [
      activeFarmerCount,
      totalFarmerCount,
      morningMilk,
      eveningMilk,
      totalMilkToday,
      activeCyclesCount,
      unpaidCycles,
      walletBalance,
      latestReceipt,
      reservedAmount,
    ] = await Promise.all([
      farmerModel.getActiveFarmersCount(client),
      farmerModel.getTotalFarmersCount(client),
      milkModel.getTodayMorningMilk(client),
      milkModel.getTodayEveningMilk(client),
      milkModel.getTodayMilkTotal(client),
      cycleModel.getActiveCycleCount(client),
      cycleModel.getAllUnpaidCycles(client),
      walletModel.getWalletBalance(client),
      walletModel.getLatestReceipt(client),
      walletModel.getReservedAmount(client),
    ]);

    let farmersDueToday = 0;
    let amountDueToday = 0;
    let overdueFarmers = 0;
    let overdueAmount = 0;
    let upcomingPaymentCount = 0;
    let upcomingPaymentAmount = 0;
    let totalPendingPaymentAmount = 0;
    let oldestUnpaidCycleDate = null;

    const farmerCyclesSummary = [];

    for (const cycle of unpaidCycles) {
      const { totalLiters, grossAmount, feedDeduction, finalAmount } = await getCyclePaymentSummary(cycle, client);
      const dueDateStr = toIsoDateString(cycle.payment_due_date || cycle.end_date);
      const daysRemaining = getDaysDiff(dueDateStr, todayStr);

      totalPendingPaymentAmount += finalAmount;

      const isOverdue = daysRemaining < 0;
      const isDueToday = daysRemaining === 0;

      if (isOverdue) {
        overdueFarmers += 1;
        overdueAmount += finalAmount;
      } else if (isDueToday) {
        farmersDueToday += 1;
        amountDueToday += finalAmount;
      } else {
        upcomingPaymentCount += 1;
        upcomingPaymentAmount += finalAmount;
      }

      // Track oldest unpaid cycle
      const cycleStart = toIsoDateString(cycle.start_date);
      if (!oldestUnpaidCycleDate || cycleStart < oldestUnpaidCycleDate) {
        oldestUnpaidCycleDate = cycleStart;
      }

      farmerCyclesSummary.push({
        farmerId: cycle.farmer_id,
        farmerName: cycle.farmer_name,
        farmerPhone: cycle.farmer_phone,
        farmerStatus: cycle.farmer_status || 'active',
        cycleId: cycle.id,
        startDate: cycle.start_date,
        endDate: cycle.end_date,
        durationDays: cycle.duration_days,
        paymentDueDate: cycle.payment_due_date || cycle.end_date,
        ratePerLiter: Number(cycle.rate_per_liter),
        totalLiters: totalLiters,
        grossAmount: grossAmount,
        feedDeduction: feedDeduction,
        finalAmount: finalAmount,
        status: cycle.status || 'active',
        daysRemaining: daysRemaining,
        isOverdue: isOverdue,
        overdueDays: isOverdue ? Math.abs(daysRemaining) : 0,
        isDueToday: isDueToday,
      });
    }

    // Look for the latest pending (non-expired) distribution preview
    let proposedDistribution = null;
    await distributionModel.expireOldPreviews(client);

    const previewsResult = await client.query(
      `SELECT id, proposed_total, selected_cycle_count, selected_farmer_count, remaining_balance, shortfall, mode, margin
       FROM distribution_previews
       WHERE status = 'pending' AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`
    );

    if (previewsResult.rows.length > 0) {
      const p = previewsResult.rows[0];
      proposedDistribution = {
        previewId: Number(p.id),
        proposedTotal: Number(p.proposed_total),
        selectedCycleCount: p.selected_cycle_count,
        selectedFarmerCount: p.selected_farmer_count,
        remainingBalanceAfter: Number(p.remaining_balance),
        shortfall: Number(p.shortfall),
        mode: p.mode,
        margin: Number(p.margin),
      };
    }

    // After-distribution simulations
    const afterOverdueAmount = proposedDistribution
      ? Number(Math.max(0, overdueAmount - proposedDistribution.proposedTotal).toFixed(2))
      : Number(overdueAmount.toFixed(2));
    const afterTotalOutstanding = proposedDistribution
      ? Number(Math.max(0, totalPendingPaymentAmount - proposedDistribution.proposedTotal).toFixed(2))
      : Number(totalPendingPaymentAmount.toFixed(2));

    res.json({
      success: true,
      total_farmers: totalFarmerCount || activeFarmerCount,
      active_farmer_count: activeFarmerCount,
      today_morning_milk: morningMilk,
      today_evening_milk: eveningMilk,
      today_total_milk: totalMilkToday,
      active_cycles_count: activeCyclesCount,
      total_pending_payment_amount: Number(totalPendingPaymentAmount.toFixed(2)),
      total_expected_payout: Number(totalPendingPaymentAmount.toFixed(2)), // backwards compatibility
      overdue_farmers: overdueFarmers,
      overdue_amount: Number(overdueAmount.toFixed(2)),
      farmers_due_today: farmersDueToday,
      amount_due_today: Number(amountDueToday.toFixed(2)),
      upcoming_payment_count: upcomingPaymentCount,
      upcoming_payment_amount: Number(upcomingPaymentAmount.toFixed(2)),

      // ── Wallet Information ──
      wallet: {
        currentBalance: walletBalance,
        latestReceipt: latestReceipt
          ? {
              amount: Number(latestReceipt.amount),
              date: toIsoDateString(latestReceipt.transaction_date),
              reference: latestReceipt.reference,
            }
          : null,
        reservedForDistribution: reservedAmount,
        proposedDistribution,
        oldestUnpaidCycleDate,
        beforeDistribution: {
          overdueAmount: Number(overdueAmount.toFixed(2)),
          totalOutstanding: Number(totalPendingPaymentAmount.toFixed(2)),
        },
        afterDistribution: {
          overdueAmount: afterOverdueAmount,
          totalOutstanding: afterTotalOutstanding,
          remainingBalance: proposedDistribution
            ? proposedDistribution.remainingBalanceAfter
            : walletBalance,
        },
      },

      farmer_cycles_summary: farmerCyclesSummary,
    });
  } finally {
    client.release();
  }
});

module.exports = {
  getDashboard,
};
