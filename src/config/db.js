const { Pool, types } = require('pg');

// Parse PostgreSQL DATE (OID 1082) as exact 'YYYY-MM-DD' string to prevent local timezone offsets
types.setTypeParser(1082, (val) => val);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  closePool: () => pool.end(),
};
