const db = require('../config/db');

async function createMilkEntry({ farmerId, cycleId, date, time, liters }, client = db) {
  const result = await client.query(
    `INSERT INTO milk_entries (farmer_id, cycle_id, date, time, liters)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, farmer_id, cycle_id, date, time, liters, created_at`,
    [farmerId, cycleId, date, time, liters]
  );

  return result.rows[0];
}

async function findMilkEntryById(id, client = db) {
  const result = await client.query(
    `SELECT m.id, m.farmer_id, m.cycle_id, m.date, m.time, m.liters, m.created_at,
            c.status AS cycle_status, c.start_date, c.end_date, c.rate_per_liter
     FROM milk_entries m
     INNER JOIN farmer_cycles c ON c.id = m.cycle_id
     WHERE m.id = $1
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

async function findMilkEntryByIdForUpdate(id, client = db) {
  const result = await client.query(
    `SELECT m.id, m.farmer_id, m.cycle_id, m.date, m.time, m.liters, m.created_at,
            c.status AS cycle_status, c.start_date, c.end_date, c.rate_per_liter
     FROM milk_entries m
     INNER JOIN farmer_cycles c ON c.id = m.cycle_id
     WHERE m.id = $1
     FOR UPDATE OF m, c`,
    [id]
  );

  return result.rows[0] || null;
}

async function updateMilkEntry(id, { date, time, liters, cycleId }, client = db) {
  const result = await client.query(
    `UPDATE milk_entries
     SET date = COALESCE($1, date),
         time = COALESCE($2, time),
         liters = COALESCE($3, liters),
         cycle_id = COALESCE($4, cycle_id)
     WHERE id = $5
     RETURNING id, farmer_id, cycle_id, date, time, liters, created_at`,
    [date, time, liters, cycleId, id]
  );

  return result.rows[0] || null;
}

async function deleteMilkEntry(id, client = db) {
  const result = await client.query(
    `DELETE FROM milk_entries
     WHERE id = $1
     RETURNING id, farmer_id, cycle_id, date, time, liters`,
    [id]
  );

  return result.rows[0] || null;
}

async function getMilkEntriesByFarmerId(farmerId, client = db) {
  const result = await client.query(
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
  findMilkEntryById,
  findMilkEntryByIdForUpdate,
  updateMilkEntry,
  deleteMilkEntry,
  getMilkEntriesByFarmerId,
  getTotalLitersByCycleId,
  getTodayMorningMilk,
  getTodayEveningMilk,
  getTodayMilkTotal,
};
