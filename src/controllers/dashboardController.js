const asyncHandler = require('../utils/asyncHandler');
const farmerModel = require('../models/farmerModel');
const milkModel = require('../models/milkModel');
const cycleModel = require('../models/cycleModel');
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
    ] = await Promise.all([
      farmerModel.getActiveFarmersCount(client),
      farmerModel.getTotalFarmersCount(client),
      milkModel.getTodayMorningMilk(client),
      milkModel.getTodayEveningMilk(client),
      milkModel.getTodayMilkTotal(client),
      cycleModel.getActiveCycleCount(client),
      cycleModel.getAllUnpaidCycles(client),
    ]);

    let farmersDueToday = 0;
    let amountDueToday = 0;
    let overdueFarmers = 0;
    let overdueAmount = 0;
    let upcomingPaymentCount = 0;
    let upcomingPaymentAmount = 0;
    let totalPendingPaymentAmount = 0;

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
      farmer_cycles_summary: farmerCyclesSummary,
    });
  } finally {
    client.release();
  }
});

module.exports = {
  getDashboard,
};
