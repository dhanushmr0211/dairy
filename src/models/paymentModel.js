const db = require('../config/db');

async function createPayment(
  { cycleId, totalLiters, totalAmount, feedDeduction, finalAmount, paidDate },
  client = db
) {
  const result = await client.query(
    `INSERT INTO payments (cycle_id, total_liters, total_amount, feed_deduction, final_amount, paid_date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, cycle_id, total_liters, total_amount, feed_deduction, final_amount, paid_date`,
    [cycleId, totalLiters, totalAmount, feedDeduction, finalAmount, paidDate]
  );

  return result.rows[0];
}

async function findPaymentByCycleId(cycleId, client = db) {
  const result = await client.query(
    `SELECT id, cycle_id, total_liters, total_amount, feed_deduction, final_amount, paid_date
     FROM payments
     WHERE cycle_id = $1
     LIMIT 1`,
    [cycleId]
  );

  return result.rows[0] || null;
}

async function getPaymentsByFarmerId(farmerId) {
  const result = await db.query(
    `SELECT p.id,
            p.cycle_id,
            c.farmer_id,
            p.total_liters,
            p.total_amount,
            p.feed_deduction,
            p.final_amount,
            p.paid_date
     FROM payments p
     INNER JOIN farmer_cycles c ON c.id = p.cycle_id
     WHERE c.farmer_id = $1
     ORDER BY p.paid_date DESC, p.id DESC`,
    [farmerId]
  );

  return result.rows;
}

module.exports = {
  createPayment,
  findPaymentByCycleId,
  getPaymentsByFarmerId,
};
