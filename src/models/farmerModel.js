const db = require('../config/db');

async function createFarmer({ name, phone, status = 'active' }) {
  const result = await db.query(
    `INSERT INTO farmers (name, phone, status)
     VALUES ($1, $2, $3)
     RETURNING id, name, phone, status, created_at`,
    [name, phone, status]
  );

  return result.rows[0];
}

async function getAllFarmers({ status } = {}) {
  let query = `SELECT id, name, phone, status, created_at FROM farmers`;
  const params = [];

  if (status) {
    query += ` WHERE status = $1`;
    params.push(status);
  }

  query += ` ORDER BY id ASC`;
  const result = await db.query(query, params);
  return result.rows;
}

async function findFarmerById(farmerId) {
  const result = await db.query(
    `SELECT id, name, phone, status, created_at
     FROM farmers
     WHERE id = $1
     LIMIT 1`,
    [farmerId]
  );

  return result.rows[0] || null;
}

async function updateFarmerStatus(farmerId, status) {
  const result = await db.query(
    `UPDATE farmers
     SET status = $1
     WHERE id = $2
     RETURNING id, name, phone, status, created_at`,
    [status, farmerId]
  );

  return result.rows[0] || null;
}

async function getActiveFarmersCount(client = db) {
  const result = await client.query(
    `SELECT COUNT(*)::INT AS active_farmers FROM farmers WHERE status = 'active'`
  );
  return Number(result.rows[0].active_farmers);
}

async function getTotalFarmersCount(client = db) {
  const result = await client.query(`SELECT COUNT(*)::INT AS total_farmers FROM farmers`);
  return Number(result.rows[0].total_farmers);
}

module.exports = {
  createFarmer,
  getAllFarmers,
  findFarmerById,
  updateFarmerStatus,
  getActiveFarmersCount,
  getTotalFarmersCount,
};
