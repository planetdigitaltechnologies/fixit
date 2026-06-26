const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { v4: uuid } = require('uuid');
const { query, withTransaction } = require('../config/db');
const { verifyID, verifyCertificate } = require('../utils/iprs');

const signAccess = (userId, role) =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });

const signRefresh = () => crypto.randomBytes(48).toString('hex');

/* POST /api/auth/register */
const register = async (req, res, next) => {
  try {
    const { name, email, phone, password, role = 'client', ...techData } = req.body;

    if (!name || !email || !phone || !password)
      return res.status(400).json({ error: 'name, email, phone, password are required.' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (!['client', 'technician'].includes(role))
      return res.status(400).json({ error: 'role must be client or technician.' });

    const passwordHash   = await bcrypt.hash(password, 12);
    const avatarInitials = name.trim().split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    // ── Real-time IPRS identity verification (technicians only) ──
    // Runs BEFORE account creation so invalid IDs/certs are rejected immediately,
    // exactly like the live check shown during registration in the app.
    let iprsResult = null;
    if (role === 'technician') {
      const { category, idNumber, certNumber, hourlyRate } = techData;
      if (!category || !idNumber || !certNumber || !hourlyRate) {
        return res.status(400).json({ error: 'category, idNumber, certNumber, hourlyRate required for technicians.' });
      }

      iprsResult = await verifyID(idNumber, name);
      if (!iprsResult.verified) {
        return res.status(400).json({ error: 'IPRS verification failed: ' + iprsResult.reason });
      }

      const certResult = await verifyCertificate(certNumber, category);
      if (!certResult.valid) {
        return res.status(400).json({ error: 'Certificate verification failed: ' + certResult.reason });
      }
    }

    const user = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, phone, password_hash, role, avatar_initials)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, phone, role, avatar_initials`,
        [name.trim(), email.toLowerCase().trim(), phone.trim(), passwordHash, role, avatarInitials]
      );
      const u = rows[0];

      if (role === 'technician') {
        const { category, experienceYrs, hourlyRate, bio, idNumber, certNumber, currentLat, currentLng, homeArea } = techData;

        await client.query(
          `INSERT INTO technicians
             (user_id, category, experience_yrs, hourly_rate, bio, id_number, cert_number,
              current_lat, current_lng, home_area, verify_status, iprs_checked_at, iprs_response)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',NOW(),$11)`,
          [u.id, category, experienceYrs || 0, hourlyRate, bio || null,
           idNumber, certNumber, currentLat || null, currentLng || null, homeArea || null,
           JSON.stringify(iprsResult)]
        );
      }
      return u;
    });

    const accessToken  = signAccess(user.id, user.role);
    const refreshToken = signRefresh();
    const tokenHash    = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, ip_address, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '90 days')`,
      [user.id, tokenHash, req.ip]
    );

    res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) { next(err); }
};

/* POST /api/auth/login */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required.' });

    const { rows } = await query(
      `SELECT u.*, t.id as tech_id, t.verify_status, t.is_online, t.category
       FROM users u LEFT JOIN technicians t ON t.user_id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!user.is_active) return res.status(403).json({ error: 'Account suspended. Contact support.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const accessToken  = signAccess(user.id, user.role);
    const refreshToken = signRefresh();
    const tokenHash    = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, ip_address, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '90 days')`,
      [user.id, tokenHash, req.ip]
    );

    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, accessToken, refreshToken });
  } catch (err) { next(err); }
};

/* POST /api/auth/refresh */
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required.' });

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const { rows } = await query(
      `SELECT rt.*, u.role, u.is_active
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.revoked = false AND rt.expires_at > NOW()`,
      [tokenHash]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    if (!rows[0].is_active) return res.status(403).json({ error: 'Account suspended.' });

    const newAccessToken = signAccess(rows[0].user_id, rows[0].role);
    res.json({ accessToken: newAccessToken });
  } catch (err) { next(err); }
};

/* POST /api/auth/logout */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [tokenHash]);
    }
    res.json({ message: 'Logged out successfully.' });
  } catch (err) { next(err); }
};

/* GET /api/auth/me */
const me = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.avatar_initials, u.avatar_url,
              u.is_email_verified, u.last_login_at, u.created_at,
              t.id as tech_id, t.category, t.verify_status, t.is_online, t.is_available,
              t.rating, t.total_jobs, t.total_reviews, t.hourly_rate, t.experience_yrs
       FROM users u LEFT JOIN technicians t ON t.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
};

module.exports = { register, login, refresh, logout, me };
