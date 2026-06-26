const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { query } = require('./config/db');

/* Map of userId → WebSocket connection */
const clients = new Map();

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    // Authenticate via ?token= query param
    const url    = new URL(req.url, 'http://localhost');
    const token  = url.searchParams.get('token');
    if (!token) { ws.close(4001, 'Unauthorized'); return; }

    let user;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const { rows } = await query('SELECT id, name, role FROM users WHERE id=$1 AND is_active=true', [decoded.userId]);
      if (!rows.length) { ws.close(4001, 'Unauthorized'); return; }
      user = rows[0];
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    ws.userId = user.id;
    ws.role   = user.role;
    clients.set(user.id, ws);
    console.log(`[WS] Connected: ${user.name} (${user.role})`);

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        await handleMessage(ws, user, msg);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      clients.delete(user.id);
      console.log(`[WS] Disconnected: ${user.name}`);
      // Mark technician offline
      if (user.role === 'technician') {
        query('UPDATE technicians SET is_online=false WHERE user_id=$1', [user.id]).catch(() => {});
      }
    });

    ws.on('error', (err) => console.error('[WS] Error:', err.message));
    ws.send(JSON.stringify({ type: 'connected', userId: user.id }));
  });

  return wss;
}

async function handleMessage(ws, user, msg) {
  switch (msg.type) {

    /* Technician broadcasts location → client tracking the booking gets it */
    case 'location_update': {
      const { lat, lng, bookingId } = msg;
      if (!lat || !lng) break;
      // Update DB
      await query('UPDATE technicians SET current_lat=$1, current_lng=$2 WHERE user_id=$3', [lat, lng, user.id]);
      // Forward to client in this booking
      if (bookingId) {
        const { rows } = await query('SELECT client_id FROM bookings WHERE id=$1', [bookingId]);
        if (rows.length) {
          send(rows[0].client_id, { type: 'tech_location', lat, lng, bookingId });
        }
      }
      break;
    }

    /* Chat message via WebSocket (fast path, also saved to DB) */
    case 'chat_message': {
      const { bookingId, body } = msg;
      if (!bookingId || !body?.trim()) break;
      // Verify access
      const { rows: access } = await query(
        `SELECT b.client_id, t.user_id as tech_user_id
         FROM bookings b JOIN technicians t ON t.id=b.technician_id
         WHERE b.id=$1 AND (b.client_id=$2 OR t.user_id=$2)`,
        [bookingId, user.id]
      );
      if (!access.length) break;
      const saved = await query(
        'INSERT INTO messages (booking_id, sender_id, body) VALUES ($1,$2,$3) RETURNING *',
        [bookingId, user.id, body.trim()]
      );
      const payload = { type: 'chat_message', ...saved.rows[0], sender_name: user.name };
      // Send to both parties
      send(access[0].client_id, payload);
      send(access[0].tech_user_id, payload);
      break;
    }

    /* Booking status change broadcast */
    case 'booking_status': {
      const { bookingId, status } = msg;
      if (!bookingId || !status) break;
      const { rows } = await query(
        `SELECT b.client_id, t.user_id as tech_user_id
         FROM bookings b JOIN technicians t ON t.id=b.technician_id
         WHERE b.id=$1`,
        [bookingId]
      );
      if (rows.length) {
        const payload = { type: 'booking_status', bookingId, status };
        send(rows[0].client_id, payload);
        send(rows[0].tech_user_id, payload);
      }
      break;
    }

    /* Ping/pong keep-alive */
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      break;
  }
}

function send(userId, payload) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/* Broadcast to all connected clients (admin use) */
function broadcast(payload) {
  clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  });
}

module.exports = { setupWebSocket, send, broadcast };
