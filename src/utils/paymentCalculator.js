const milkModel = require('../models/milkModel');
const feedModel = require('../models/feedModel');

async function getCyclePaymentSummary(cycle, client) {
  const totalLiters = await milkModel.getTotalLitersByCycleId(cycle.id, client);
  const totalAmount = Number((totalLiters * Number(cycle.rate_per_liter)).toFixed(2));
  const feedDeduction = await feedModel.getFeedDeductionForCycle(
    {
      farmerId: cycle.farmer_id,
      startDate: cycle.start_date,
      endDate: cycle.end_date,
    },
    client
  );
  const finalAmount = Number((totalAmount - feedDeduction).toFixed(2));

  return {
    totalLiters,
    totalAmount,
    feedDeduction,
    finalAmount,
  };
}

module.exports = { getCyclePaymentSummary };
