const { query, withTransaction } = require('../config/db');

/* POST /api/bookings */
const create = async (req, res, next) => {
  try {
    const { technicianId, issueTitle, issueDesc, urgency = 'normal', address, clientLat, clientLng } = req.body;
    if (!technicianId || !issueTitle || !issueDesc || !address)
      return res.status(400).json({ error: 'technicianId, issueTitle, issueDesc, address required.' });

    // Verify technician exists and is available
    const { rows: techs } = await query(
      `SELECT t.id, t.category, t.hourly_rate, t.verify_status, t.is_available, u.name
       FROM technicians t JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [technicianId]
    );
    if (!techs.length) return res.status(404).json({ error: 'Technician not found.' });
    const tech = techs[0];
    if (tech.verify_status !== 'verified') return res.status(400).json({ error: 'Technician is not yet verified.' });
    if (!tech.is_available) return res.status(400).json({ error: 'Technician is currently unavailable.' });

    const { rows: bookingRows } = await query(
      `INSERT INTO bookings
         (client_id, technician_id, issue_title, issue_desc, urgency, category,
          address, client_lat, client_lng, estimated_rate, callout_fee)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,500)
       RETURNING *`,
      [req.user.id, technicianId, issueTitle.trim(), issueDesc.trim(), urgency,
       tech.category, address, clientLat || null, clientLng || null, tech.hourly_rate]
    );
    const booking = bookingRows[0];

    // Notify technician
    await query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       SELECT u.id, 'booking', 'New booking request',
              $2 || ' needs a ' || $3,
              $4::jsonb
       FROM technicians t JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [technicianId,
       (await query('SELECT name FROM users WHERE id=$1',[req.user.id])).rows[0]?.name || 'A client',
       tech.category,
       JSON.stringify({ bookingId: booking.id })]
    );

    res.status(201).json(booking);
  } catch (err) { next(err); }
};

/* GET /api/bookings  (client: their bookings) */
const listMine = async (req, res, next) => {
  try {
    const { status } = req.query;
    const params = [req.user.id];
    let statusFilter = '';
    if (status) { params.push(status); statusFilter = `AND b.status = $${params.length}`; }

    const { rows } = await query(
      `SELECT b.*,
              u.name  as tech_name, u.phone as tech_phone, u.avatar_initials as tech_avatar,
              t.category, t.rating, t.hourly_rate, t.current_lat as tech_lat, t.current_lng as tech_lng
       FROM bookings b
       JOIN technicians t ON t.id = b.technician_id
       JOIN users u ON u.id = t.user_id
       WHERE b.client_id = $1 ${statusFilter}
       ORDER BY b.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
};

/* GET /api/bookings/:id */
const getOne = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.*,
              cu.name as client_name, cu.phone as client_phone, cu.avatar_initials as client_avatar,
              tu.name as tech_name, tu.phone as tech_phone, tu.avatar_initials as tech_avatar,
              t.category, t.rating, t.hourly_rate, t.current_lat as tech_lat, t.current_lng as tech_lng,
              t.cert_number, t.verify_status
       FROM bookings b
       JOIN users cu ON cu.id = b.client_id
       JOIN technicians t ON t.id = b.technician_id
       JOIN users tu ON tu.id = t.user_id
       WHERE b.id = $1 AND (b.client_id = $2 OR t.user_id = $2)`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found.' });

    const { rows: media } = await query(
      'SELECT id, url, mime_type, created_at FROM booking_media WHERE booking_id = $1',
      [req.params.id]
    );
    res.json({ ...rows[0], media });
  } catch (err) { next(err); }
};

/* PATCH /api/bookings/:id/accept  (tech only) */
const accept = async (req, res, next) => {
  try {
    const { rows: tech } = await query('SELECT id FROM technicians WHERE user_id=$1',[req.user.id]);
    if (!tech.length) return res.status(403).json({ error: 'Not a technician.' });

    const { rows } = await query(
      `UPDATE bookings SET status='accepted', accepted_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND technician_id=$2 AND status='pending' RETURNING *`,
      [req.params.id, tech[0].id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found or already accepted.' });

    await query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1,'booking','Booking accepted','Your technician is on the way!',$2::jsonb)`,
      [rows[0].client_id, JSON.stringify({ bookingId: rows[0].id })]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
};

/* PATCH /api/bookings/:id/start  (tech only) */
const start = async (req, res, next) => {
  try {
    const { rows: tech } = await query('SELECT id FROM technicians WHERE user_id=$1',[req.user.id]);
    if (!tech.length) return res.status(403).json({ error: 'Not a technician.' });

    const { rows } = await query(
      `UPDATE bookings SET status='in_progress', started_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND technician_id=$2 AND status='accepted' RETURNING *`,
      [req.params.id, tech[0].id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found or wrong status.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

/* PATCH /api/bookings/:id/complete  (tech only) */
const complete = async (req, res, next) => {
  try {
    const { finalAmount, techNotes } = req.body;
    const { rows: tech } = await query('SELECT id FROM technicians WHERE user_id=$1',[req.user.id]);
    if (!tech.length) return res.status(403).json({ error: 'Not a technician.' });

    const platformFee = finalAmount ? Math.round(finalAmount * 0.05 * 100) / 100 : null;

    const { rows } = await query(
      `UPDATE bookings
       SET status='completed', completed_at=NOW(), updated_at=NOW(),
           final_amount=COALESCE($3,estimated_rate),
           platform_fee=COALESCE($4,0),
           tech_notes=COALESCE($5,tech_notes)
       WHERE id=$1 AND technician_id=$2 AND status='in_progress' RETURNING *`,
      [req.params.id, tech[0].id, finalAmount || null, platformFee, techNotes || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found or wrong status.' });

    // Update tech total_jobs
    await query('UPDATE technicians SET total_jobs = total_jobs+1 WHERE id=$1', [tech[0].id]);

    await query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1,'payment','Job completed – please pay','Confirm and pay for your service.',$2::jsonb)`,
      [rows[0].client_id, JSON.stringify({ bookingId: rows[0].id })]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
};

/* PATCH /api/bookings/:id/cancel */
const cancel = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const { rows } = await query(
      `UPDATE bookings
       SET status='cancelled', cancelled_at=NOW(), cancel_reason=$3, updated_at=NOW()
       WHERE id=$1 AND (client_id=$2 OR technician_id IN (SELECT id FROM technicians WHERE user_id=$2))
         AND status IN ('pending','accepted') RETURNING *`,
      [req.params.id, req.user.id, reason || null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found or cannot be cancelled.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

module.exports = { create, listMine, getOne, accept, start, complete, cancel };
