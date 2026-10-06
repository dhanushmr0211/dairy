const db = require('../config/db');

/**
 * Find any cycle for the farmer that overlaps with [startDate, endDate].
 * Overlap condition: existing.start_date <= new.end_date AND existing.end_date >= new.start_date
 */
async function findOverlappingCycle({ farmerId, startDate, endDate }, client = db) {
  const result = await client.query(
    `SELECT id, farmer_id, start_date, end_date, 
            COALESCE(duration_days, (end_date - start_date + 1)) AS duration_days, 
            rate_per_liter, 
            COALESCE(payment_due_date, end_date) AS payment_due_date, 
            status
     FROM farmer_cycles
     WHERE farmer_id = $1
       AND start_date <= $3
       AND end_date >= $2
     LIMIT 1`,
    [farmerId, startDate, endDate]
  );

  return result.rows[0] || null;
}

/**
 * Find the cycle that contains a specific date for a farmer.
 * Used for auto-attaching milk entries: milk_date BETWEEN cycle.start_date AND cycle.end_date
 */
async function findCycleByFarmerAndDate(farmerId, date, client = db) {
  const result = await client.query(
    `SELECT id, farmer_id, start_date, end_date, 
            COALESCE(duration_days, (end_date - start_date + 1)) AS duration_days, 
            rate_per_liter, 
            COALESCE(payment_due_date, end_date) AS payment_due_date, 
            status
     FROM farmer_cycles
     WHERE farmer_id = $1
       AND start_date <= $2
       AND end_date >= $2
     LIMIT 1`,
    [farmerId, date]
  );

  return result.rows[0] || null;
}

/**
 * Find the most relevant active/unpaid cycle for a farmer.
 */
async function findActiveCycleByFarmerId(farmerId, client = db) {
  const result = await client.query(
    `SELECT id, farmer_id, start_date, end_date, 
            COALESCE(duration_days, (end_date - start_date + 1)) AS duration_days, 
            rate_per_liter, 
            COALESCE(payment_due_date, end_date) AS payment_due_date, 
            status, created_at
     FROM farmer_cycles
     WHERE farmer_id = $1 AND (status IS NULL OR status != 'paid')
     ORDER BY start_date DESC, id DESC
     LIMIT 1`,
    [farmerId]
  );

  return result.rows[0] || null;
}

/**
 * Get ALL cycles for a farmer sorted by start_date DESC.
 */
async function getCyclesByFarmerId(farmerId, client = db) {
  const result = await client.query(
    `SELECT c.id, c.farmer_id, c.start_date, c.end_date, 
            COALESCE(c.duration_days, (c.end_date - c.start_date + 1)) AS duration_days, 
            c.rate_per_liter, 
            COALESCE(c.payment_due_date, c.end_date) AS payment_due_date, 
            c.status, c.created_at,
            f.name AS farmer_name, f.phone AS farmer_phone, 
            COALESCE(f.status, 'active') AS farmer_status
     FROM farmer_cycles c
     INNER JOIN farmers f ON f.id = c.farmer_id
     WHERE c.farmer_id = $1
     ORDER BY c.start_date DESC, c.id DESC`,
    [farmerId]
  );

  return result.rows;
}

async function createCycle({
  farmerId,
  startDate,
  endDate,
  durationDays = 15,
  ratePerLiter,
  paymentDueDate,
  status = 'active',
}) {
  const dueDate = paymentDueDate || endDate;
  const result = await db.query(
    `INSERT INTO farmer_cycles (farmer_id, start_date, end_date, duration_days, rate_per_liter, payment_due_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, farmer_id, start_date, end_date, duration_days, rate_per_liter, payment_due_date, status, created_at`,
    [farmerId, startDate, endDate, durationDays, ratePerLiter, dueDate, status]
  );

  return result.rows[0];
}

async function findCycleById(cycleId, client = db) {
  const result = await client.query(
    `SELECT c.id, c.farmer_id, c.start_date, c.end_date, 
            COALESCE(c.duration_days, (c.end_date - c.start_date + 1)) AS duration_days, 
            c.rate_per_liter, 
            COALESCE(c.payment_due_date, c.end_date) AS payment_due_date, 
            c.status, c.created_at,
            f.name AS farmer_name, f.phone AS farmer_phone, 
            COALESCE(f.status, 'active') AS farmer_status
     FROM farmer_cycles c
     INNER JOIN farmers f ON f.id = c.farmer_id
     WHERE c.id = $1
     LIMIT 1`,
    [cycleId]
  );

  return result.rows[0] || null;
}

async function findCycleByIdForUpdate(cycleId, client = db) {
  const result = await client.query(
    `SELECT c.id, c.farmer_id, c.start_date, c.end_date, 
            COALESCE(c.duration_days, (c.end_date - c.start_date + 1)) AS duration_days, 
            c.rate_per_liter, 
            COALESCE(c.payment_due_date, c.end_date) AS payment_due_date, 
            c.status,
            f.name AS farmer_name, f.phone AS farmer_phone
     FROM farmer_cycles c
     INNER JOIN farmers f ON f.id = c.farmer_id
     WHERE c.id = $1
     FOR UPDATE`,
    [cycleId]
  );

  return result.rows[0] || null;
}

async function findCyclesByIdsForUpdate(cycleIds, client = db) {
  if (!cycleIds || cycleIds.length === 0) return [];
  const result = await client.query(
    `SELECT c.id, c.farmer_id, c.start_date, c.end_date, 
            COALESCE(c.duration_days, (c.end_date - c.start_date + 1)) AS duration_days, 
            c.rate_per_liter, 
            COALESCE(c.payment_due_date, c.end_date) AS payment_due_date, 
            c.status,
            f.name AS farmer_name, f.phone AS farmer_phone
     FROM farmer_cycles c
     INNER JOIN farmers f ON f.id = c.farmer_id
     WHERE c.id = ANY($1::BIGINT[])
     ORDER BY c.id ASC
     FOR UPDATE`,
    [cycleIds]
  );

  return result.rows;
}

async function markCycleAsPaid(cycleId, client = db) {
  await client.query(
    `UPDATE farmer_cycles
     SET status = 'paid'
     WHERE id = $1`,
    [cycleId]
  );
}

async function updateCycleStatus(cycleId, status, client = db) {
  const result = await client.query(
    `UPDATE farmer_cycles
     SET status = $1
     WHERE id = $2
     RETURNING id, farmer_id, start_date, end_date, duration_days, rate_per_liter, payment_due_date, status`,
    [status, cycleId]
  );

  return result.rows[0] || null;
}

async function getAllUnpaidCycles(client = db) {
  const result = await client.query(
    `SELECT c.id, c.farmer_id, c.start_date, c.end_date, 
            COALESCE(c.duration_days, (c.end_date - c.start_date + 1)) AS duration_days, 
            c.rate_per_liter, 
            COALESCE(c.payment_due_date, c.end_date) AS payment_due_date, 
            c.status,
            f.name AS farmer_name, f.phone AS farmer_phone, 
            COALESCE(f.status, 'active') AS farmer_status
     FROM farmer_cycles c
     INNER JOIN farmers f ON f.id = c.farmer_id
     WHERE c.status IS NULL OR c.status != 'paid'
     ORDER BY COALESCE(c.payment_due_date, c.end_date) ASC, c.id ASC`
  );

  return result.rows;
}

/**
 * High-performance single-query batch aggregation for all unpaid cycles with calculations.
 * Avoids N+1 query loops.
 */
async function getUnpaidCyclesWithCalculations(client = db) {
  const result = await client.query(
    `WITH milk_agg AS (
       SELECT cycle_id, COALESCE(SUM(liters), 0)::NUMERIC(12,2) AS total_liters
       FROM milk_entries
       GROUP BY cycle_id
     ),
     feed_agg AS (
       SELECT c.id AS cycle_id,
              COALESCE(SUM(fr.amount), 0)::NUMERIC(12,2) AS feed_deduction
       FROM farmer_cycles c
       LEFT JOIN feed_records fr
         ON fr.farmer_id = c.farmer_id
        AND fr.date BETWEEN c.start_date AND c.end_date
       WHERE c.status IS NULL OR c.status != 'paid'
       GROUP BY c.id
     )
     SELECT c.id AS cycle_id,
            c.farmer_id,
            f.name AS farmer_name,
            f.phone AS farmer_phone,
            COALESCE(f.status, 'active') AS farmer_status,
            c.start_date,
            c.end_date,
            COALESCE(c.duration_days, (c.end_date - c.start_date + 1)) AS duration_days,
            c.rate_per_liter::NUMERIC(10,2) AS rate_per_liter,
            COALESCE(c.payment_due_date, c.end_date) AS payment_due_date,
            COALESCE(c.status, 'active') AS status,
            COALESCE(m.total_liters, 0)::NUMERIC(12,2) AS total_liters,
            ROUND(COALESCE(m.total_liters, 0) * c.rate_per_liter, 2)::NUMERIC(12,2) AS gross_amount,
            COALESCE(fd.feed_deduction, 0)::NUMERIC(12,2) AS feed_deduction,
            GREATEST(0, ROUND((COALESCE(m.total_liters, 0) * c.rate_per_liter) - COALESCE(fd.feed_deduction, 0), 2))::NUMERIC(12,2) AS final_amount
     FROM farmer_cycles c
     INNER JOIN farmers f ON f.id = c.farmer_id
     LEFT JOIN milk_agg m ON m.cycle_id = c.id
     LEFT JOIN feed_agg fd ON fd.cycle_id = c.id
     WHERE c.status IS NULL OR c.status != 'paid'
     ORDER BY COALESCE(c.payment_due_date, c.end_date) ASC, c.id ASC`
  );

  return result.rows.map((row) => ({
    cycleId: Number(row.cycle_id),
    farmerId: Number(row.farmer_id),
    farmerName: row.farmer_name,
    farmerPhone: row.farmer_phone,
    farmerStatus: row.farmer_status,
    startDate: row.start_date,
    endDate: row.end_date,
    durationDays: Number(row.duration_days),
    ratePerLiter: Number(row.rate_per_liter),
    paymentDueDate: row.payment_due_date,
    status: row.status,
    totalLiters: Number(row.total_liters),
    grossAmount: Number(row.gross_amount),
    feedDeduction: Number(row.feed_deduction),
    finalAmount: Number(row.final_amount),
  }));
}

async function getActiveCycleCount(client = db) {
  const result = await client.query(
    `SELECT COUNT(*)::INT AS active_cycles
     FROM farmer_cycles
     WHERE status IS NULL OR status != 'paid'`
  );

  return Number(result.rows[0].active_cycles);
}

module.exports = {
  findOverlappingCycle,
  findCycleByFarmerAndDate,
  findActiveCycleByFarmerId,
  getCyclesByFarmerId,
  createCycle,
  findCycleById,
  findCycleByIdForUpdate,
  findCyclesByIdsForUpdate,
  markCycleAsPaid,
  updateCycleStatus,
  getAllUnpaidCycles,
  getUnpaidCyclesWithCalculations,
  getActiveCycleCount,
};
