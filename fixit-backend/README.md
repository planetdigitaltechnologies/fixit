# FixIt – Full-Stack PWA (PostgreSQL + Node.js + Express)

## Stack
- **Frontend**: Vanilla JS PWA (installs on phone, works offline)
- **Backend**: Node.js + Express API (REST + WebSocket)
- **Database**: PostgreSQL (all user, booking, payment, review data)
- **Auth**: JWT access tokens + refresh tokens (bcrypt hashed passwords)
- **Real-time**: WebSocket (live GPS tracking + in-job chat)

## Security
- Passwords hashed with bcrypt (cost 12)
- JWT tokens — short-lived access (30d) + refresh tokens (90d)
- All refresh tokens stored hashed (SHA-256) in DB — revocable
- Helmet.js security headers on every response
- CORS locked to your frontend domain
- Rate limiting: 200 req/15min global, 10 req/15min on auth routes
- Full audit log table for every sensitive action
- Input validation on all API routes
- SQL parameterized queries — no SQL injection possible
- Non-root Docker user

## Quick Start (local)

```bash
# 1. Clone & install
cd fixit-backend
npm install

# 2. Start PostgreSQL
docker compose up postgres -d

# 3. Configure
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

# 4. Run schema migration
npm run migrate

# 5. Seed demo data
npm run seed

# 6. Start server
npm run dev
# → http://localhost:4000
```

## Deploy to Railway (recommended — free tier)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login & deploy
railway login
railway new
railway add postgresql          # provisions free PostgreSQL
railway vars set JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
railway vars set NODE_ENV=production
railway vars set FRONTEND_URL=https://your-app.up.railway.app
railway up

# Run migrations on Railway
railway run npm run migrate
railway run npm run seed
```

## Deploy to Render

1. Create new **Web Service** → connect GitHub repo
2. Build command: `npm install`
3. Start command: `npm start`
4. Add **PostgreSQL** database from Render dashboard
5. Set environment variables from `.env.example`
6. Shell → `npm run migrate && npm run seed`

## Deploy to VPS (Ubuntu)

```bash
# On your VPS
sudo apt update && sudo apt install -y nodejs npm postgresql nginx certbot

# PostgreSQL setup
sudo -u postgres psql -c "CREATE USER fixit_user WITH PASSWORD 'strongpassword';"
sudo -u postgres psql -c "CREATE DATABASE fixit_db OWNER fixit_user;"

# App setup
git clone https://github.com/yourname/fixit.git
cd fixit/fixit-backend
npm install --production
cp .env.example .env  # fill in your values
npm run migrate
npm run seed

# PM2 process manager
npm install -g pm2
pm2 start src/server.js --name fixit
pm2 save && pm2 startup

# Nginx reverse proxy
sudo nano /etc/nginx/sites-available/fixit
# (see nginx.conf in this repo)
sudo ln -s /etc/nginx/sites-available/fixit /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
sudo nginx -s reload
```

## API Reference

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /api/auth/register | — | Register client or technician |
| POST | /api/auth/login | — | Login, get JWT tokens |
| POST | /api/auth/refresh | — | Refresh access token |
| GET  | /api/auth/me | ✓ | Get current user profile |
| GET  | /api/technicians | ✓ | List/search technicians |
| GET  | /api/technicians/:id | ✓ | Get technician profile + reviews |
| PATCH | /api/technicians/location | Tech | Update GPS location |
| PATCH | /api/technicians/availability | Tech | Toggle online/offline |
| POST | /api/bookings | Client | Create booking |
| GET  | /api/bookings | ✓ | My bookings |
| PATCH | /api/bookings/:id/accept | Tech | Accept a job |
| PATCH | /api/bookings/:id/complete | Tech | Mark job complete |
| PATCH | /api/bookings/:id/cancel | ✓ | Cancel booking |
| POST | /api/payments/initiate | Client | Start M-Pesa STK push |
| POST | /api/payments/mpesa/callback | — | Safaricom webhook |
| POST | /api/reviews | Client | Submit review |
| GET  | /api/messages/:bookingId | ✓ | Get chat messages |
| POST | /api/messages | ✓ | Send message |
| GET  | /api/admin/stats | Admin | Platform stats |
| PATCH | /api/admin/technicians/:id/verify | Admin | Approve/reject technician |

## WebSocket Events

Connect: `ws://yourdomain.com/ws?token=ACCESS_TOKEN`

| Event (send) | Payload | Description |
|---|---|---|
| location_update | { lat, lng, bookingId } | Technician sends location |
| chat_message | { bookingId, body } | Send chat message |
| ping | — | Keep-alive |

| Event (receive) | Description |
|---|---|
| tech_location | Technician moved (for client map) |
| chat_message | New chat message |
| booking_status | Booking status changed |

## Demo Credentials
After running `npm run seed`:
- Admin: `admin@fixit.ke` / `Demo@1234`
- Client: `client@fixit.demo` / `Demo@1234`
- Technician: `james@fixit.demo` / `Demo@1234`
