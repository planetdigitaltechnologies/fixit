const rateLimit = require('express-rate-limit');
const { query }  = require('../config/db');

/* ── Rate limiters ── */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 1000,
  message: { error: 'Too many login attempts. Wait 15 minutes.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many uploads. Slow down.' },
});

/* ── Audit logger ── */
const auditLog = (action) => async (req, res, next) => {
  try {
    await query(
      `INSERT INTO audit_log (user_id, action, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user?.id || null,
        action,
        req.ip,
        req.headers['user-agent'],
        JSON.stringify({ path: req.path, method: req.method, body: req.body }),
      ]
    );
  } catch (_) { /* never block on audit failure */ }
  next();
};

/* ── Global error handler ── */
const errorHandler = (err, req, res, next) => {
  console.error('[ERROR]', err.message);
  if (err.code === '23505') return res.status(409).json({ error: 'Already exists (duplicate entry).' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced record not found.' });
  if (err.code === '22P02') return res.status(400).json({ error: 'Invalid UUID format.' });
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
};

/* ── 404 handler ── */
const notFound = (req, res) => res.status(404).json({ error: `Route ${req.path} not found` });

module.exports = { globalLimiter, authLimiter, uploadLimiter, auditLog, errorHandler, notFound };
