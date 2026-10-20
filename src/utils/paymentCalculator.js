const milkModel = require('../models/milkModel');
const feedModel = require('../models/feedModel');

/**
 * Calculates payment details for a given cycle.
 * Final amount can be negative when feed deduction exceeds gross amount.
 * 
 * @param {Object} cycle - cycle record (id, farmer_id, start_date, end_date, rate_per_liter)
 * @param {Object} [client] - optional pg client for transaction support
 */
async function getCyclePaymentSummary(cycle, client) {
  const totalLiters = await milkModel.getTotalLitersByCycleId(cycle.id, client);
  const grossAmount = Number((totalLiters * Number(cycle.rate_per_liter)).toFixed(2));
  
  const feedDeduction = await feedModel.getFeedDeductionForCycle(
    {
      farmerId: cycle.farmer_id,
      startDate: cycle.start_date,
      endDate: cycle.end_date,
    },
    client
  );

  // Allow negative final amounts when feed deduction exceeds gross amount
  const finalAmount = Number((grossAmount - feedDeduction).toFixed(2));

  return {
    totalLiters,
    totalAmount: grossAmount,
    grossAmount,
    feedDeduction,
    finalAmount,
  };
}

module.exports = { getCyclePaymentSummary };
