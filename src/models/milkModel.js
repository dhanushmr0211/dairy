const db = require('../config/db');

async function createMilkEntry({ farmerId, cycleId, date, time, liters }) {
  const result = await db.query(
    `INSERT INTO milk_entries (farmer_id, cycle_id, date, time, liters)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, farmer_id, cycle_id, date, time, liters, created_at`,
    [farmerId, cycleId, date, time, liters]
  );

  return result.rows[0];
}

async function getMilkEntriesByFarmerId(farmerId) {
  const result = await db.query(
    `SELECT id, farmer_id, cycle_id, date, time, liters, created_at
     FROM milk_entries
     WHERE farmer_id = $1
     ORDER BY date DESC, time DESC, id DESC`,
    [farmerId]
  );

  return result.rows;
}

async function getTotalLitersByCycleId(cycleId, client = db) {
  const result = await client.query(
    `SELECT COALESCE(SUM(liters), 0)::NUMERIC(12,2) AS total_liters
     FROM milk_entries
     WHERE cycle_id = $1`,
    [cycleId]
  );

  return Number(result.rows[0].total_liters);
}

async function getTodayMorningMilk(client = db) {
  const result = await client.query(
    `SELECT COALESCE(SUM(liters), 0)::NUMERIC(12,2) AS morning_milk
     FROM milk_entries
     WHERE date = CURRENT_DATE AND time = 'morning'`
  );

  return Number(result.rows[0].morning_milk);
}

async function getTodayEveningMilk(client = db) {
  const result = await client.query(
    `SELECT COALESCE(SUM(liters), 0)::NUMERIC(12,2) AS evening_milk
     FROM milk_entries
     WHERE date = CURRENT_DATE AND time = 'evening'`
  );

  return Number(result.rows[0].evening_milk);
}

async function getTodayMilkTotal(client = db) {
  const result = await client.query(
    `SELECT COALESCE(SUM(liters), 0)::NUMERIC(12,2) AS total_milk_today
     FROM milk_entries
     WHERE date = CURRENT_DATE`
  );

  return Number(result.rows[0].total_milk_today);
}

module.exports = {
  createMilkEntry,
  getMilkEntriesByFarmerId,
  getTotalLitersByCycleId,
  getTodayMorningMilk,
  getTodayEveningMilk,
  getTodayMilkTotal,
};
