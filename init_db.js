const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function init() {
  try {
    const schema = fs.readFileSync('schema.sql', 'utf8');
    await pool.query(schema);
    console.log('Database initialized successfully!');
  } catch (err) {
    console.error('Database initialization failed:', err);
  } finally {
    await pool.end();
  }
}
init();
