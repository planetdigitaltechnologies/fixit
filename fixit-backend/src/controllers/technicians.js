const { query, withTransaction } = require('../config/db');

/* GET /api/technicians */
const list = async (req, res, next) => {
  try {
    const { category, online, lat, lng, radius = 25, sort = 'rating', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const where  = ['t.verify_status = \'verified\'', 'u.is_active = true'];

    if (category) { params.push(category); where.push(`t.category = $${params.length}`); }
    if (online === 'true') where.push('t.is_online = true');

    // Distance filter using Haversine
    let distanceSelect = '';
    if (lat && lng) {
      params.push(parseFloat(lat), parseFloat(lng), parseFloat(radius));
      distanceSelect = `,
        (6371 * acos(cos(radians($${params.length-2})) * cos(radians(t.current_lat))
         * cos(radians(t.current_lng) - radians($${params.length-1}))
         + sin(radians($${params.length-2})) * sin(radians(t.current_lat)))) AS distance_km`;
      where.push(`(6371 * acos(cos(radians($${params.length-2})) * cos(radians(t.current_lat))
         * cos(radians(t.current_lng) - radians($${params.length-1}))
         + sin(radians($${params.length-2})) * sin(radians(t.current_lat)))) < $${params.length}`);
    }

    const sortMap = { rating: 't.rating DESC', distance: 'distance_km ASC', rate: 't.hourly_rate ASC', jobs: 't.total_jobs DESC' };
    const orderBy = sortMap[sort] || 't.rating DESC';

    const sql = `
      SELECT t.id, t.category, t.experience_yrs, t.hourly_rate, t.bio,
             t.current_lat, t.current_lng, t.home_area,
             t.verify_status, t.is_online, t.is_available,
             t.rating, t.total_reviews, t.total_jobs,
             u.id as user_id, u.name, u.avatar_initials, u.avatar_url
             ${distanceSelect}
      FROM   technicians t
      JOIN   users u ON u.id = t.user_id
      WHERE  ${where.join(' AND ')}
        AND  t.current_lat IS NOT NULL
      ORDER  BY ${orderBy}
      LIMIT  $${params.length + 1} OFFSET $${params.length + 2}`;

    params.push(parseInt(limit), offset);
    const { rows } = await query(sql, params);
    res.json({ technicians: rows, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
};

/* GET /api/technicians/:id */
const getOne = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT t.*, u.id as user_id, u.name, u.avatar_initials, u.avatar_url, u.phone
       FROM technicians t JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Technician not found.' });

    const { rows: reviews } = await query(
      `SELECT r.rating, r.comment, r.created_at, u.name as client_name
       FROM reviews r JOIN users u ON u.id = r.client_id
       WHERE r.technician_id = $1 ORDER BY r.created_at DESC LIMIT 10`,
      [req.params.id]
    );
    res.json({ ...rows[0], reviews });
  } catch (err) { next(err); }
};

/* PATCH /api/technicians/location  (tech only) */
const updateLocation = async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required.' });
    const { rows } = await query(
      `UPDATE technicians SET current_lat = $1, current_lng = $2, updated_at = NOW()
       WHERE user_id = $3 RETURNING id, current_lat, current_lng`,
      [parseFloat(lat), parseFloat(lng), req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Technician profile not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

/* PATCH /api/technicians/availability  (tech only) */
const updateAvailability = async (req, res, next) => {
  try {
    const { isOnline, isAvailable } = req.body;
    const { rows } = await query(
      `UPDATE technicians SET is_online = COALESCE($1, is_online), is_available = COALESCE($2, is_available), updated_at = NOW()
       WHERE user_id = $3 RETURNING id, is_online, is_available`,
      [isOnline ?? null, isAvailable ?? null, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Technician profile not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

/* PATCH /api/technicians/profile  (tech only) */
const updateProfile = async (req, res, next) => {
  try {
    const { bio, hourlyRate, homeArea, experienceYrs } = req.body;
    const { rows } = await query(
      `UPDATE technicians
       SET bio = COALESCE($1, bio), hourly_rate = COALESCE($2, hourly_rate),
           home_area = COALESCE($3, home_area), experience_yrs = COALESCE($4, experience_yrs),
           updated_at = NOW()
       WHERE user_id = $5 RETURNING *`,
      [bio || null, hourlyRate || null, homeArea || null, experienceYrs || null, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Technician profile not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

/* GET /api/technicians/me/jobs  (tech only - their bookings) */
const myJobs = async (req, res, next) => {
  try {
    const { status } = req.query;
    const { rows: tech } = await query('SELECT id FROM technicians WHERE user_id = $1', [req.user.id]);
    if (!tech.length) return res.status(404).json({ error: 'Technician not found.' });

    const params = [tech[0].id];
    let statusFilter = '';
    if (status) { params.push(status); statusFilter = `AND b.status = $${params.length}`; }

    const { rows } = await query(
      `SELECT b.*, u.name as client_name, u.phone as client_phone, u.avatar_initials as client_avatar
       FROM bookings b JOIN users u ON u.id = b.client_id
       WHERE b.technician_id = $1 ${statusFilter}
       ORDER BY b.created_at DESC LIMIT 50`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
};

module.exports = { list, getOne, updateLocation, updateAvailability, updateProfile, myJobs };
