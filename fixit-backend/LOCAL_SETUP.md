# FixIt – Local Development Setup Guide

Everything you need to run FixIt on your own machine before deploying live.

---

## What You Need (Prerequisites)

| Tool | Version | Download |
|------|---------|----------|
| Node.js | v18 or higher | https://nodejs.org |
| Docker Desktop | Any recent | https://docker.com/products/docker-desktop |
| Git | Any | https://git-scm.com |

> **Why Docker?** It runs PostgreSQL for you in one command — no manual database installation needed. If you already have PostgreSQL installed locally, Docker is optional.

---

## Option A – Automatic Setup (Recommended)

This single script does everything: installs packages, starts PostgreSQL, runs migrations, seeds demo data.

### Step 1 — Open a terminal and go to the backend folder

```bash
cd fixit-backend
```

### Step 2 — Make the script executable and run it

**Mac / Linux:**
```bash
chmod +x setup.sh
bash setup.sh
```

**Windows (PowerShell):**
```powershell
# Run the Windows setup script instead:
.\setup.ps1
```

### Step 3 — Start the server

```bash
npm run dev
```

### Step 4 — Open the app

```
http://localhost:4000
```

That's it. The app is running with the frontend served at the same address.

---

## Option B – Manual Setup (Step by Step)

If the script doesn't work, follow these steps manually.

### Step 1 — Install Node.js packages

```bash
cd fixit-backend
npm install
```

### Step 2 — Create your .env file

```bash
cp .env.example .env
```

Open `.env` and set your values. For local development the defaults work fine — just generate a JWT secret:

```bash
# Generate a secure JWT secret and copy the output into .env
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Your `.env` should look like this for local testing:

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://fixit_user:fixit_local_pass@localhost:5432/fixit_db
JWT_SECRET=paste_the_generated_key_here
JWT_EXPIRES_IN=30d
FRONTEND_URL=http://localhost:4000
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=5
```

### Step 3 — Start PostgreSQL with Docker

```bash
docker run -d \
  --name fixit-postgres \
  --restart unless-stopped \
  -e POSTGRES_DB=fixit_db \
  -e POSTGRES_USER=fixit_user \
  -e POSTGRES_PASSWORD=fixit_local_pass \
  -p 5432:5432 \
  postgres:16-alpine
```

Wait about 5 seconds for it to start, then verify:

```bash
docker exec fixit-postgres pg_isready -U fixit_user -d fixit_db
# Should print: localhost:5432 - accepting connections
```

> **Already have PostgreSQL installed?** Skip Docker and just update `DATABASE_URL` in `.env` to point to your existing database. Create the database first:
> ```sql
> CREATE USER fixit_user WITH PASSWORD 'fixit_local_pass';
> CREATE DATABASE fixit_db OWNER fixit_user;
> ```

### Step 4 — Create all database tables

```bash
node src/migrate.js
```

You should see:
```
[Migrate] Running migrations...
[Migrate] ✓ Schema created successfully
```

### Step 5 — Load demo data

```bash
node src/seed.js
```

You should see 10 technicians, an admin and a client account being created.

### Step 6 — Start the development server

```bash
npm run dev
```

You should see:
```
🔧 FixIt server running
   API:       http://localhost:4000/api
   WebSocket: ws://localhost:4000/ws
   Frontend:  http://localhost:4000
   Env:       development

   PostgreSQL: PostgreSQL 16.x ✓
```

### Step 7 — Open the app

Go to **http://localhost:4000** in your browser.

---

## Demo Accounts

All demo accounts use the password: **`Demo@1234`**

| Role | Email | What you can do |
|------|-------|-----------------|
| Client | `client@fixit.demo` | Search technicians, book, track, pay |
| Technician | `james@fixit.demo` | Receive jobs, accept, go online/offline |
| Technician | `grace@fixit.demo` | Electrician account |
| Technician | `peter@fixit.demo` | Mechanic account |
| Admin | `admin@fixit.ke` | Approve technicians, view all bookings |

---

## Testing the Full Flow

Here is a complete end-to-end test you can do locally:

**1. Test as a Client**
- Go to http://localhost:4000
- Click **Client demo** or sign in as `client@fixit.demo` / `Demo@1234`
- Click **🔧 Plumber** to search
- Click on **James Kariuki** → **Book now**
- Describe a problem, enter any address, click **Confirm**
- Watch the live GPS tracking map
- Click **Mark complete** → proceed to payment screen

**2. Test as a Technician (second browser/tab)**
- Open an incognito window
- Go to http://localhost:4000
- Sign in as `james@fixit.demo` / `Demo@1234`
- See the incoming request appear on the dashboard
- Click **Accept** — the client's tracking map will update

**3. Test as Admin**
- Sign in as `admin@fixit.ke` / `Demo@1234`
- Go to Account → Admin Panel
- See stats, approve/reject pending technicians

---

## Useful Commands

```bash
# Start dev server (auto-restarts on file changes)
npm run dev

# Start production server
npm start

# Re-run migrations (if you change the schema)
node src/migrate.js

# Re-seed demo data
node src/seed.js

# Stop the PostgreSQL Docker container
docker stop fixit-postgres

# Start it again later
docker start fixit-postgres

# Remove it completely (deletes all data)
docker rm -f fixit-postgres

# View server logs
npm run dev   # logs appear in terminal

# Check PostgreSQL is running
docker ps | grep fixit-postgres

# Connect to database directly (useful for debugging)
docker exec -it fixit-postgres psql -U fixit_user -d fixit_db

# Example queries in psql:
# SELECT name, email, role FROM users;
# SELECT name, category, rating, verify_status FROM technicians;
# SELECT id, status, issue_title FROM bookings;
# \q   ← to exit psql
```

---

## Test the API Directly

Once the server is running, test the API with curl or Postman:

```bash
# Health check
curl http://localhost:4000/api/health

# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"client@fixit.demo","password":"Demo@1234"}'

# Save the accessToken from the response, then:

# Search technicians
curl http://localhost:4000/api/technicians \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Search by category
curl "http://localhost:4000/api/technicians?category=plumber&sort=rating" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Or import this into **Postman / Insomnia**:
- Base URL: `http://localhost:4000`
- All API routes are at `/api/...`
- Add header `Authorization: Bearer YOUR_TOKEN` after logging in

---

## Project File Structure

```
fixit/                          ← PWA Frontend
├── index.html                  ← App shell
├── manifest.json               ← PWA install config
├── sw.js                       ← Service worker (offline)
├── css/app.css                 ← All styles
├── js/
│   ├── api.js                  ← HTTP + WebSocket client
│   ├── auth.js                 ← Login/session management
│   ├── app.js                  ← All 13 screens
│   ├── map.js                  ← Live GPS tracking map
│   └── router.js               ← Page routing
└── icons/                      ← PWA icons

fixit-backend/                  ← Node.js Backend
├── setup.sh                    ← Auto setup script (Mac/Linux)
├── setup.ps1                   ← Auto setup script (Windows)
├── .env.example                ← Environment template
├── package.json
├── src/
│   ├── server.js               ← Express app entry point
│   ├── websocket.js            ← Real-time GPS + chat
│   ├── migrate.js              ← Run DB migrations
│   ├── seed.js                 ← Load demo data
│   ├── config/db.js            ← PostgreSQL connection
│   ├── middleware/
│   │   ├── auth.js             ← JWT verification
│   │   └── index.js            ← Rate limiting, errors
│   ├── controllers/
│   │   ├── auth.js             ← Register, login, tokens
│   │   ├── technicians.js      ← Profiles, location, jobs
│   │   ├── bookings.js         ← Book, accept, complete
│   │   └── other.js            ← Payments, reviews, chat, admin
│   └── routes/index.js         ← All API routes
├── migrations/
│   └── 001_schema.sql          ← PostgreSQL schema (all tables)
├── uploads/                    ← Uploaded job photos
├── Dockerfile                  ← Container config
├── docker-compose.yml          ← Full stack with Docker
├── nginx.conf                  ← Production web server config
└── ecosystem.config.js         ← PM2 process manager config
```

---

## Database Tables

| Table | What's stored |
|-------|--------------|
| `users` | All accounts (clients, technicians, admins) |
| `technicians` | Profiles, location, rating, verification status |
| `bookings` | Every job request with status history |
| `booking_media` | Photos attached to jobs |
| `payments` | M-Pesa + card transactions |
| `reviews` | Star ratings and comments |
| `messages` | In-job chat messages |
| `notifications` | Push notifications log |
| `refresh_tokens` | Secure session tokens (hashed) |
| `audit_log` | Every sensitive action logged |
| `app_settings` | Platform config (fees, limits) |

---

## Troubleshooting

**"Cannot connect to PostgreSQL"**
```bash
# Check Docker container is running
docker ps | grep fixit-postgres

# If not running, start it
docker start fixit-postgres

# If it doesn't exist, run setup.sh again
bash setup.sh
```

**"Port 4000 already in use"**
```bash
# Find what's using port 4000
lsof -i :4000        # Mac/Linux
netstat -ano | findstr :4000   # Windows

# Kill it or change PORT in .env to 4001
```

**"JWT_SECRET is not set"**
```bash
# Make sure .env exists
ls -la .env

# If missing, copy the example
cp .env.example .env

# Generate a JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Paste the output as JWT_SECRET= in your .env
```

**"Relation does not exist" (missing tables)**
```bash
# Re-run migrations
node src/migrate.js
```

**"Email already registered" when seeding**
```bash
# Data already seeded - this is fine, just start the server
npm run dev
```

**Frontend shows blank page**
- Open browser DevTools (F12) → Console tab
- If you see `401 Unauthorized` — your token expired, log in again
- If you see `Failed to fetch` — make sure the server is running on port 4000

---

## When You're Ready to Deploy

See `README.md` for Railway, Render, and VPS deployment instructions.

The only changes needed to go live:
1. Set `NODE_ENV=production` in your host's environment variables
2. Set `DATABASE_URL` to your production PostgreSQL URL
3. Set `FRONTEND_URL` to your real domain
4. Set `JWT_SECRET` to a secure random value
5. Connect real M-Pesa Daraja API credentials
