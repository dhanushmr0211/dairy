const db = require('../config/db');

async function createFarmer({ name, phone }) {
  const result = await db.query(
    `INSERT INTO farmers (name, phone)
     VALUES ($1, $2)
     RETURNING id, name, phone`,
    [name, phone]
  );

  return result.rows[0];
}

async function getAllFarmers() {
  const result = await db.query(
    `SELECT id, name, phone
     FROM farmers
     ORDER BY id ASC`
  );

  return result.rows;
}

async function findFarmerById(farmerId) {
  const result = await db.query(
    `SELECT id, name, phone
     FROM farmers
     WHERE id = $1
     LIMIT 1`,
    [farmerId]
  );

  return result.rows[0] || null;
}

async function getTotalFarmersCount(client = db) {
  const result = await client.query(`SELECT COUNT(*)::INT AS total_farmers FROM farmers`);
  return Number(result.rows[0].total_farmers);
}

module.exports = {
  createFarmer,
  getAllFarmers,
  findFarmerById,
  getTotalFarmersCount,
};
