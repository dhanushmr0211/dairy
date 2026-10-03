const db = require('../config/db');

async function createFeedRecord({ farmerId, date, item, quantity, amount }) {
  const result = await db.query(
    `INSERT INTO feed_records (farmer_id, date, item, quantity, amount)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, farmer_id, date, item, quantity, amount`,
    [farmerId, date, item, quantity, amount]
  );

  return result.rows[0];
}

async function getFeedRecordsByFarmerId(farmerId) {
  const result = await db.query(
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
  getFeedRecordsByFarmerId,
  getFeedDeductionForCycle,
};
