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
      morningMilk,
      eveningMilk,
      totalMilkToday,
      activeCyclesCount,
      unpaidCycles,
    ] = await Promise.all([
      farmerModel.getActiveFarmersCount(client),
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

    for (const cycle of unpaidCycles) {
      const { finalAmount } = await getCyclePaymentSummary(cycle, client);
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
        upcomingPaymentCount += 1;
        upcomingPaymentAmount += finalAmount;
      }
    }

    res.json({
      success: true,
      active_farmer_count: activeFarmerCount,
      today_morning_milk: morningMilk,
      today_evening_milk: eveningMilk,
      today_total_milk: totalMilkToday,
      farmers_due_today: farmersDueToday,
      amount_due_today: Number(amountDueToday.toFixed(2)),
      overdue_farmers: overdueFarmers,
      overdue_amount: Number(overdueAmount.toFixed(2)),
      upcoming_payment_count: upcomingPaymentCount,
      upcoming_payment_amount: Number(upcomingPaymentAmount.toFixed(2)),
      total_pending_payment_amount: Number(totalPendingPaymentAmount.toFixed(2)),
      active_cycles_count: activeCyclesCount,
    });
  } finally {
    client.release();
  }
});

module.exports = {
  getDashboard,
};
