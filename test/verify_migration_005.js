require('dotenv').config();
const db = require('../src/config/db');
db.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'feed_records' ORDER BY ordinal_position`)
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
