const db = require('../config/db');

async function findActiveCycleByFarmerId(farmerId, client = db) {
  const result = await client.query(
    `SELECT id, farmer_id, start_date, end_date, duration_days, rate_per_liter, payment_due_date, status, created_at
     FROM farmer_cycles
     WHERE farmer_id = $1 AND status IN ('active', 'pending_payment')
     LIMIT 1`,
    [farmerId]
  );

  return result.rows[0] || null;
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
    `SELECT c.id, c.farmer_id, c.start_date, c.end_date, c.duration_days, c.rate_per_liter, c.payment_due_date, c.status, c.created_at,
            f.name AS farmer_name, f.phone AS farmer_phone, f.status AS farmer_status
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
    `SELECT c.id, c.farmer_id, c.start_date, c.end_date, c.duration_days, c.rate_per_liter, c.payment_due_date, c.status,
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
    `SELECT c.id, c.farmer_id, c.start_date, c.end_date, c.duration_days, c.rate_per_liter, c.payment_due_date, c.status,
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
    `SELECT c.id, c.farmer_id, c.start_date, c.end_date, c.duration_days, c.rate_per_liter, c.payment_due_date, c.status,
            f.name AS farmer_name, f.phone AS farmer_phone, f.status AS farmer_status
     FROM farmer_cycles c
     INNER JOIN farmers f ON f.id = c.farmer_id
     WHERE c.status IN ('active', 'pending_payment')
     ORDER BY c.payment_due_date ASC, c.id ASC`
  );

  return result.rows;
}

async function getActiveCycleCount(client = db) {
  const result = await client.query(
    `SELECT COUNT(*)::INT AS active_cycles
     FROM farmer_cycles
     WHERE status IN ('active', 'pending_payment')`
  );

  return Number(result.rows[0].active_cycles);
}

module.exports = {
  findActiveCycleByFarmerId,
  createCycle,
  findCycleById,
  findCycleByIdForUpdate,
  findCyclesByIdsForUpdate,
  markCycleAsPaid,
  updateCycleStatus,
  getAllUnpaidCycles,
  getActiveCycleCount,
};
