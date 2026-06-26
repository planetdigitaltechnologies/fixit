const { query, withTransaction } = require('../config/db');

/* ══════════════════════════════════════════════
   PAYMENTS
══════════════════════════════════════════════ */

/* POST /api/payments/initiate */
const initiatePayment = async (req, res, next) => {
  try {
    const { bookingId, method = 'mpesa', mpesaPhone } = req.body;
    if (!bookingId) return res.status(400).json({ error: 'bookingId required.' });

    const { rows: bk } = await query(
      `SELECT b.*, t.id as tech_id
       FROM bookings b JOIN technicians t ON t.id = b.technician_id
       WHERE b.id = $1 AND b.client_id = $2 AND b.status = 'completed'`,
      [bookingId, req.user.id]
    );
    if (!bk.length) return res.status(404).json({ error: 'Booking not found or not completed.' });
    const booking = bk[0];

    const amount      = parseFloat(booking.final_amount || booking.estimated_rate || 0) + 500;
    const platformFee = Math.round(amount * 0.05 * 100) / 100;
    const techPayout  = amount - platformFee;

    const { rows: existing } = await query('SELECT id FROM payments WHERE booking_id=$1', [bookingId]);
    if (existing.length) return res.status(409).json({ error: 'Payment already initiated.' });

    const { rows } = await query(
      `INSERT INTO payments
         (booking_id, client_id, technician_id, amount, platform_fee, tech_payout, method, mpesa_phone, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING *`,
      [bookingId, req.user.id, booking.tech_id, amount, platformFee, techPayout,
       method, mpesaPhone || null]
    );

    // TODO: call Safaricom Daraja API here for M-Pesa STK push
    // const daraja = await mpesaSTKPush(mpesaPhone, amount, bookingId);
    // await query('UPDATE payments SET mpesa_checkout_id=$1 WHERE id=$2', [daraja.CheckoutRequestID, rows[0].id]);

    res.status(201).json({ payment: rows[0], message: method === 'mpesa' ? 'STK push sent to ' + mpesaPhone : 'Payment initiated.' });
  } catch (err) { next(err); }
};

/* POST /api/payments/mpesa/callback  (Safaricom callback) */
const mpesaCallback = async (req, res, next) => {
  try {
    const { Body: { stkCallback } } = req.body;
    const { CheckoutRequestID, ResultCode, CallbackMetadata } = stkCallback;

    if (ResultCode !== 0) {
      await query(
        'UPDATE payments SET status=\'failed\' WHERE mpesa_checkout_id=$1',
        [CheckoutRequestID]
      );
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const meta = {};
    (CallbackMetadata?.Item || []).forEach(i => { meta[i.Name] = i.Value; });

    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE payments
         SET status='paid', confirmed_at=NOW(),
             mpesa_receipt=$1, mpesa_transaction_date=$2
         WHERE mpesa_checkout_id=$3 RETURNING *`,
        [meta.MpesaReceiptNumber, new Date(meta.TransactionDate?.toString()), CheckoutRequestID]
      );
      if (rows.length) {
        await client.query(
          `UPDATE bookings SET status='completed', updated_at=NOW() WHERE id=$1`,
          [rows[0].booking_id]
        );
        await client.query(
          `UPDATE technicians SET total_earned = total_earned + $1 WHERE id=$2`,
          [rows[0].tech_payout, rows[0].technician_id]
        );
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           VALUES ($1,'payment','Payment confirmed','Thank you! KES '||$2||' received.',$3::jsonb)`,
          [rows[0].client_id, rows[0].amount, JSON.stringify({ bookingId: rows[0].booking_id })]
        );
      }
    });
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) { next(err); }
};

/* GET /api/payments/:bookingId */
const getPayment = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.* FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       WHERE p.booking_id=$1 AND (b.client_id=$2 OR p.technician_id IN (SELECT id FROM technicians WHERE user_id=$2))`,
      [req.params.bookingId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Payment not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

/* ══════════════════════════════════════════════
   REVIEWS
══════════════════════════════════════════════ */

/* POST /api/reviews */
const createReview = async (req, res, next) => {
  try {
    const { bookingId, rating, comment } = req.body;
    if (!bookingId || !rating) return res.status(400).json({ error: 'bookingId and rating required.' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'rating must be 1–5.' });

    const { rows: bk } = await query(
      `SELECT b.technician_id FROM bookings b
       WHERE b.id=$1 AND b.client_id=$2 AND b.status='completed'`,
      [bookingId, req.user.id]
    );
    if (!bk.length) return res.status(404).json({ error: 'Completed booking not found.' });

    const { rows } = await query(
      `INSERT INTO reviews (booking_id, technician_id, client_id, rating, comment)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (booking_id) DO NOTHING RETURNING *`,
      [bookingId, bk[0].technician_id, req.user.id, parseInt(rating), comment?.trim() || null]
    );
    if (!rows.length) return res.status(409).json({ error: 'Review already submitted.' });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
};

/* GET /api/reviews/technician/:id */
const getTechReviews = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.*, u.name as client_name, u.avatar_initials
       FROM reviews r JOIN users u ON u.id = r.client_id
       WHERE r.technician_id=$1 AND r.is_flagged=false
       ORDER BY r.created_at DESC LIMIT 20`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

/* ══════════════════════════════════════════════
   MESSAGES
══════════════════════════════════════════════ */

/* GET /api/messages/:bookingId */
const getMessages = async (req, res, next) => {
  try {
    const { rows: access } = await query(
      `SELECT b.id FROM bookings b
       JOIN technicians t ON t.id = b.technician_id
       WHERE b.id=$1 AND (b.client_id=$2 OR t.user_id=$2)`,
      [req.params.bookingId, req.user.id]
    );
    if (!access.length) return res.status(403).json({ error: 'Access denied.' });

    const { rows } = await query(
      `SELECT m.*, u.name as sender_name, u.avatar_initials as sender_avatar
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.booking_id=$1 ORDER BY m.created_at ASC`,
      [req.params.bookingId]
    );
    // Mark messages as read
    await query(
      'UPDATE messages SET is_read=true WHERE booking_id=$1 AND sender_id != $2 AND is_read=false',
      [req.params.bookingId, req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

/* POST /api/messages */
const sendMessage = async (req, res, next) => {
  try {
    const { bookingId, body } = req.body;
    if (!bookingId || !body?.trim()) return res.status(400).json({ error: 'bookingId and body required.' });

    const { rows: access } = await query(
      `SELECT b.id, b.client_id, t.user_id as tech_user_id
       FROM bookings b JOIN technicians t ON t.id = b.technician_id
       WHERE b.id=$1 AND (b.client_id=$2 OR t.user_id=$2) AND b.status NOT IN ('cancelled')`,
      [bookingId, req.user.id]
    );
    if (!access.length) return res.status(403).json({ error: 'Access denied or booking closed.' });

    const { rows } = await query(
      `INSERT INTO messages (booking_id, sender_id, body) VALUES ($1,$2,$3) RETURNING *`,
      [bookingId, req.user.id, body.trim()]
    );

    // Notify the other party
    const recipientId = access[0].client_id === req.user.id
      ? access[0].tech_user_id : access[0].client_id;
    await query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1,'message','New message',$2,$3::jsonb)`,
      [recipientId, body.trim().slice(0, 80), JSON.stringify({ bookingId })]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
};

/* ══════════════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════════════ */

const getNotifications = async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

const markRead = async (req, res, next) => {
  try {
    await query('UPDATE notifications SET is_read=true WHERE user_id=$1', [req.user.id]);
    res.json({ message: 'All marked as read.' });
  } catch (err) { next(err); }
};

/* ══════════════════════════════════════════════
   ADMIN
══════════════════════════════════════════════ */

const adminStats = async (req, res, next) => {
  try {
    const [users, techs, bookings, payments, pending] = await Promise.all([
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM technicians'),
      query('SELECT COUNT(*) FROM bookings'),
      query("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='paid'"),
      query("SELECT COUNT(*) FROM technicians WHERE verify_status='pending'"),
    ]);
    res.json({
      totalUsers:     parseInt(users.rows[0].count),
      totalTechs:     parseInt(techs.rows[0].count),
      totalBookings:  parseInt(bookings.rows[0].count),
      totalRevenue:   parseFloat(payments.rows[0].total),
      pendingVerify:  parseInt(pending.rows[0].count),
    });
  } catch (err) { next(err); }
};

const adminListTechs = async (req, res, next) => {
  try {
    const { verify_status } = req.query;
    const params = verify_status ? [verify_status] : [];
    const where  = verify_status ? 'WHERE t.verify_status = $1' : '';
    const { rows } = await query(
      `SELECT t.*, u.name, u.email, u.phone FROM technicians t
       JOIN users u ON u.id = t.user_id ${where} ORDER BY t.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
};

const adminVerifyTech = async (req, res, next) => {
  try {
    const { status, reason } = req.body;
    if (!['verified','rejected','suspended'].includes(status))
      return res.status(400).json({ error: 'status must be verified, rejected, or suspended.' });

    const { rows } = await query(
      `UPDATE technicians SET verify_status=$1, verified_at=$2, verified_by=$3, updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [status, status === 'verified' ? new Date() : null, req.user.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Technician not found.' });

    // Notify technician
    const statusMsg = { verified: 'approved ✓', rejected: 'rejected', suspended: 'suspended' }[status];
    await query(
      `INSERT INTO notifications (user_id, type, title, body)
       SELECT u.id, 'system', 'Account update', 'Your technician account has been ' || $1
       FROM technicians t JOIN users u ON u.id = t.user_id WHERE t.id = $2`,
      [statusMsg, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
};

const adminListBookings = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.*, cu.name as client_name, tu.name as tech_name
       FROM bookings b
       JOIN users cu ON cu.id = b.client_id
       JOIN technicians t ON t.id = b.technician_id
       JOIN users tu ON tu.id = t.user_id
       ORDER BY b.created_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) { next(err); }
};

module.exports = {
  initiatePayment, mpesaCallback, getPayment,
  createReview, getTechReviews,
  getMessages, sendMessage,
  getNotifications, markRead,
  adminStats, adminListTechs, adminVerifyTech, adminListBookings,
};
