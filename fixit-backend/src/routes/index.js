const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');

const { authenticate, requireAdmin, requireTechnician } = require('../middleware/auth');
const { authLimiter, uploadLimiter, auditLog } = require('../middleware/index');

const Auth  = require('../controllers/auth');
const Tech  = require('../controllers/technicians');
const Book  = require('../controllers/bookings');
const Other = require('../controllers/other');

/* ── File Upload ── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || './uploads'),
  filename:    (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random()*1e9) + path.extname(file.originalname)),
});
const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype));
  },
});

/* ── Health ── */
router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

/* ── Auth ── */
router.post('/auth/register', authLimiter, auditLog('register'), Auth.register);
router.post('/auth/login',    authLimiter, auditLog('login'),    Auth.login);
router.post('/auth/refresh',  Auth.refresh);
router.post('/auth/logout',   Auth.logout);
router.get ('/auth/me',       authenticate, Auth.me);

/* ── Technicians ── */
router.get  ('/technicians',                    authenticate, Tech.list);
router.get  ('/technicians/me/jobs',            authenticate, requireTechnician, Tech.myJobs);
router.get  ('/technicians/:id',                authenticate, Tech.getOne);
router.patch('/technicians/location',           authenticate, requireTechnician, Tech.updateLocation);
router.patch('/technicians/availability',       authenticate, requireTechnician, Tech.updateAvailability);
router.patch('/technicians/profile',            authenticate, requireTechnician, Tech.updateProfile);

/* ── Bookings ── */
router.post ('/bookings',           authenticate, auditLog('create_booking'), Book.create);
router.get  ('/bookings',           authenticate, Book.listMine);
router.get  ('/bookings/:id',       authenticate, Book.getOne);
router.patch('/bookings/:id/accept',   authenticate, requireTechnician, auditLog('accept_booking'),   Book.accept);
router.patch('/bookings/:id/start',    authenticate, requireTechnician, auditLog('start_booking'),    Book.start);
router.patch('/bookings/:id/complete', authenticate, requireTechnician, auditLog('complete_booking'), Book.complete);
router.patch('/bookings/:id/cancel',   authenticate, auditLog('cancel_booking'), Book.cancel);

/* ── Media upload ── */
router.post('/bookings/:id/media', authenticate, uploadLimiter, upload.array('files', 5), async (req, res, next) => {
  try {
    const { query } = require('../config/db');
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded.' });
    const saved = await Promise.all(req.files.map(f =>
      query(
        `INSERT INTO booking_media (booking_id, uploaded_by, url, mime_type, size_bytes)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.params.id, req.user.id, '/uploads/' + f.filename, f.mimetype, f.size]
      ).then(r => r.rows[0])
    ));
    res.status(201).json(saved);
  } catch (err) { next(err); }
});

/* ── Payments ── */
router.post('/payments/initiate',        authenticate, auditLog('initiate_payment'), Other.initiatePayment);
router.post('/payments/mpesa/callback',  Other.mpesaCallback);   // Safaricom calls this directly
router.get ('/payments/:bookingId',      authenticate, Other.getPayment);

/* ── Reviews ── */
router.post('/reviews',                  authenticate, auditLog('create_review'), Other.createReview);
router.get ('/reviews/technician/:id',   Other.getTechReviews);

/* ── Messages ── */
router.get ('/messages/:bookingId',  authenticate, Other.getMessages);
router.post('/messages',             authenticate, Other.sendMessage);

/* ── Notifications ── */
router.get ('/notifications',       authenticate, Other.getNotifications);
router.patch('/notifications/read', authenticate, Other.markRead);

/* ── Admin ── */
router.get  ('/admin/stats',            authenticate, requireAdmin, Other.adminStats);
router.get  ('/admin/technicians',      authenticate, requireAdmin, Other.adminListTechs);
router.patch('/admin/technicians/:id/verify', authenticate, requireAdmin, auditLog('admin_verify_tech'), Other.adminVerifyTech);
router.get  ('/admin/bookings',         authenticate, requireAdmin, Other.adminListBookings);

module.exports = router;
