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

async function findCycleByIdForUpdate(cycleId, client = db) {
  const result = await client.query(
    `SELECT id, farmer_id, start_date, end_date, rate_per_liter, status
     FROM farmer_cycles
     WHERE id = $1
     FOR UPDATE`,
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

async function getActiveCycleCount(client = db) {
  const result = await client.query(
    `SELECT COUNT(*)::INT AS active_cycles
     FROM farmer_cycles
     WHERE status = 'active'`
  );

  return Number(result.rows[0].active_cycles);
}

async function getUnpaidCyclesWithPayoutSummary(client = db) {
  const result = await client.query(
    `WITH milk_totals AS (
       SELECT cycle_id, COALESCE(SUM(liters), 0)::NUMERIC(12,2) AS total_liters
       FROM milk_entries
       GROUP BY cycle_id
     ),
     feed_totals AS (
       SELECT c.id AS cycle_id,
              COALESCE(SUM(fr.amount), 0)::NUMERIC(12,2) AS feed_deduction
       FROM farmer_cycles c
       LEFT JOIN feed_records fr
         ON fr.farmer_id = c.farmer_id
        AND fr.date BETWEEN c.start_date AND c.end_date
       WHERE c.status = 'active'
       GROUP BY c.id
     )
     SELECT COUNT(c.id)::INT AS unpaid_cycles,
            COALESCE(
              SUM(
                (COALESCE(mt.total_liters, 0) * c.rate_per_liter) - COALESCE(ft.feed_deduction, 0)
              ),
              0
            )::NUMERIC(14,2) AS total_expected_payout
     FROM farmer_cycles c
     LEFT JOIN milk_totals mt ON mt.cycle_id = c.id
     LEFT JOIN feed_totals ft ON ft.cycle_id = c.id
     WHERE c.status = 'active'`
  );

  return result.rows[0];
}

module.exports = {
  findActiveCycleByFarmerId,
  createCycle,
  findCycleById,
  findCycleByIdForUpdate,
  markCycleAsPaid,
  getActiveCycleCount,
  getUnpaidCyclesWithPayoutSummary,
};
