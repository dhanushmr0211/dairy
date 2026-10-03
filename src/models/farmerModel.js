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

module.exports = { createFarmer, getAllFarmers };
