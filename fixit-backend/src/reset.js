require('dotenv').config();
const { pool } = require('./config/db');
const fs = require('fs');
const path = require('path');

async function reset() {
  console.log('[Reset] Dropping all FixIt tables...');
  try {
    // Drop everything in reverse dependency order
    await pool.query(`
      DROP TABLE IF EXISTS
        audit_log, push_subscriptions, notifications, messages,
        reviews, payments, booking_media, bookings,
        technicians, refresh_tokens, users, app_settings
      CASCADE;
      DROP TYPE IF EXISTS
        user_role, tech_category, booking_status,
        payment_status, payment_method, verify_status, notif_type
      CASCADE;
    `);
    console.log('[Reset] ✓ All tables dropped');

    // Re-run schema
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/001_schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('[Reset] ✓ Schema recreated');

    // Re-seed
    require('./seed');
  } catch (err) {
    console.error('[Reset] Failed:', err.message);
    process.exit(1);
  }
}

reset();
