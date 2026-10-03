const asyncHandler = require('../utils/asyncHandler');
const farmerModel = require('../models/farmerModel');
const milkModel = require('../models/milkModel');
const cycleModel = require('../models/cycleModel');
const db = require('../config/db');

const getDashboard = asyncHandler(async (req, res) => {
  const client = await db.getClient();

  try {
    const [totalFarmers, totalMilkToday, activeCyclesCount, unpaidSummary] = await Promise.all([
      farmerModel.getTotalFarmersCount(client),
      milkModel.getTodayMilkTotal(client),
      cycleModel.getActiveCycleCount(client),
      cycleModel.getUnpaidCyclesWithPayoutSummary(client),
    ]);

    res.json({
      total_farmers: totalFarmers,
      total_milk_today: totalMilkToday,
      active_cycles_count: activeCyclesCount,
      unpaid_cycles: Number(unpaidSummary.unpaid_cycles || 0),
      total_expected_payout: Number(unpaidSummary.total_expected_payout || 0),
    });
  } finally {
    client.release();
  }
});

module.exports = {
  getDashboard,
};
