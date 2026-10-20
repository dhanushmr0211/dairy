const db = require('../config/db');

async function createFeedRecord({ farmerId, date, item, quantity, amount }, client = db) {
  const result = await client.query(
    `INSERT INTO feed_records (farmer_id, date, item, quantity, amount)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, farmer_id, date, item, quantity, amount`,
    [farmerId, date, item, quantity, amount]
  );

  return result.rows[0];
}

async function findFeedRecordById(id, client = db) {
  const result = await client.query(
    `SELECT id, farmer_id, date, item, quantity, amount
     FROM feed_records
     WHERE id = $1
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

async function findFeedRecordByIdForUpdate(id, client = db) {
  const result = await client.query(
    `SELECT id, farmer_id, date, item, quantity, amount
     FROM feed_records
     WHERE id = $1
     FOR UPDATE`,
    [id]
  );

  return result.rows[0] || null;
}

async function findPaidCycleForDate(farmerId, date, client = db) {
  const result = await client.query(
    `SELECT id, farmer_id, start_date, end_date, status
     FROM farmer_cycles
     WHERE farmer_id = $1
       AND status = 'paid'
       AND $2 BETWEEN start_date AND end_date
     LIMIT 1`,
    [farmerId, date]
  );

  return result.rows[0] || null;
}

async function updateFeedRecord(id, { date, item, quantity, amount }, client = db) {
  const result = await client.query(
    `UPDATE feed_records
     SET date = COALESCE($1, date),
         item = COALESCE($2, item),
         quantity = COALESCE($3, quantity),
         amount = COALESCE($4, amount)
     WHERE id = $5
     RETURNING id, farmer_id, date, item, quantity, amount`,
    [date, item, quantity, amount, id]
  );

  return result.rows[0] || null;
}

async function deleteFeedRecord(id, client = db) {
  const result = await client.query(
    `DELETE FROM feed_records
     WHERE id = $1
     RETURNING id, farmer_id, date, item, quantity, amount`,
    [id]
  );

  return result.rows[0] || null;
}

async function getFeedRecordsByFarmerId(farmerId, client = db) {
  const result = await client.query(
    `SELECT id, farmer_id, date, item, quantity, amount
     FROM feed_records
     WHERE farmer_id = $1
     ORDER BY date DESC, id DESC`,
    [farmerId]
  );

  return result.rows;
}

async function getFeedDeductionForCycle({ farmerId, startDate, endDate }, client = db) {
  const result = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::NUMERIC(12,2) AS feed_deduction
     FROM feed_records
     WHERE farmer_id = $1
       AND date BETWEEN $2 AND $3`,
    [farmerId, startDate, endDate]
  );

  return Number(result.rows[0].feed_deduction);
}

module.exports = {
  createFeedRecord,
  findFeedRecordById,
  findFeedRecordByIdForUpdate,
  findPaidCycleForDate,
  updateFeedRecord,
  deleteFeedRecord,
  getFeedRecordsByFarmerId,
  getFeedDeductionForCycle,
};
