require('dotenv').config();
const express   = require('express');
const http      = require('http');
const helmet    = require('helmet');
const cors      = require('cors');
const morgan    = require('morgan');
const path      = require('path');

const routes              = require('./routes/index');
const { setupWebSocket }  = require('./websocket');
const { globalLimiter, errorHandler, notFound } = require('./middleware/index');
const { pool }            = require('./config/db');

const app    = express();
const server = http.createServer(app);

/* ── Security headers ── */
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com', 'fonts.googleapis.com'],
      styleSrc:   ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc:    ["'self'", 'fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
    },
  },
}));

/* ── CORS ── */
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed – ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/* ── Body parsing ── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ── Logging ── */
if (process.env.NODE_ENV !== 'test') app.use(morgan('combined'));

/* ── Rate limiting ── */
app.use('/api/', globalLimiter);

/* ── Static file serving (uploaded images) ── */
app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR || './uploads')));

/* ── Serve PWA frontend ── */
const frontendPath = path.resolve(__dirname, '../../fixit');
app.use(express.static(frontendPath));

/* ── API Routes ── */
app.use('/api', routes);

/* ── SPA fallback (must come after /api) ── */
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API route not found' });
  res.sendFile(path.join(frontendPath, 'index.html'));
});

/* ── Error handling ── */
app.use(notFound);
app.use(errorHandler);

/* ── WebSocket (real-time location + chat) ── */
setupWebSocket(server);

/* ── Start ── */
const PORT = process.env.PORT || 4000;
server.listen(PORT, async () => {
  console.log(`\n🔧 FixIt server running`);
  console.log(`   API:       http://localhost:${PORT}/api`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   Frontend:  http://localhost:${PORT}`);
  console.log(`   Env:       ${process.env.NODE_ENV || 'development'}\n`);

  // Test DB connection
  try {
    const { rows } = await pool.query('SELECT version()');
    console.log(`   PostgreSQL: ${rows[0].version.split(' ').slice(0,2).join(' ')} ✓\n`);
  } catch (err) {
    console.error('   [DB] Connection failed:', err.message);
    console.error('   Check DATABASE_URL in .env\n');
  }
});

/* ── Graceful shutdown ── */
const shutdown = async (sig) => {
  console.log(`\n[${sig}] Shutting down gracefully…`);
  server.close(async () => {
    await pool.end();
    console.log('[Server] Closed. Bye.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException',  err => console.error('[Uncaught]', err));
process.on('unhandledRejection', err => console.error('[Unhandled]', err));

module.exports = { app, server };
