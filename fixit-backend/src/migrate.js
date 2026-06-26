require('dotenv').config();
const { pool } = require('./config/db');
const fs = require('fs');
const path = require('path');

async function migrate() {
  console.log('[Migrate] Running migrations...');
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/001_schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('[Migrate] ✓ Schema created successfully');
  } catch (err) {
    console.error('[Migrate] ✗ Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
