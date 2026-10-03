const db = require('../config/db');

async function findActiveCycleByFarmerId(farmerId) {
  const result = await db.query(
    `SELECT id, farmer_id, start_date, end_date, rate_per_liter, status
     FROM farmer_cycles
     WHERE farmer_id = $1 AND status = 'active'
     LIMIT 1`,
    [farmerId]
  );

  return result.rows[0] || null;
}

async function createCycle({ farmerId, startDate, endDate, ratePerLiter }) {
  const result = await db.query(
    `INSERT INTO farmer_cycles (farmer_id, start_date, end_date, rate_per_liter, status)
     VALUES ($1, $2, $3, $4, 'active')
     RETURNING id, farmer_id, start_date, end_date, rate_per_liter, status`,
    [farmerId, startDate, endDate, ratePerLiter]
  );

  return result.rows[0];
}

async function findCycleById(cycleId) {
  const result = await db.query(
    `SELECT id, farmer_id, start_date, end_date, rate_per_liter, status
     FROM farmer_cycles
     WHERE id = $1
     LIMIT 1`,
    [cycleId]
  );

  return result.rows[0] || null;
}

async function markCycleAsPaid(cycleId, client = db) {
  await client.query(
    `UPDATE farmer_cycles
     SET status = 'paid'
     WHERE id = $1`,
    [cycleId]
  );
}

module.exports = {
  findActiveCycleByFarmerId,
  createCycle,
  findCycleById,
  markCycleAsPaid,
};
