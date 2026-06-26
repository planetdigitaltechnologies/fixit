#!/usr/bin/env bash
# FixIt – Local Setup Script
# Run: bash setup.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[FixIt]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $1"; }
err()  { echo -e "${RED}[error]${NC} $1"; exit 1; }
step() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

echo ""
echo -e "${GREEN}"
echo "  ███████╗██╗██╗  ██╗██╗████████╗"
echo "  ██╔════╝██║╚██╗██╔╝██║╚══██╔══╝"
echo "  █████╗  ██║ ╚███╔╝ ██║   ██║   "
echo "  ██╔══╝  ██║ ██╔██╗ ██║   ██║   "
echo "  ██║     ██║██╔╝ ██╗██║   ██║   "
echo "  ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝   ╚═╝   "
echo -e "${NC}"
echo "  Home Services Platform – Local Setup"
echo ""

# ── 1. Check prerequisites ──────────────────────────────────────────────────
step "Checking prerequisites"

command -v node >/dev/null 2>&1 || err "Node.js not found. Install from https://nodejs.org (v18+)"
command -v npm  >/dev/null 2>&1 || err "npm not found. Install Node.js from https://nodejs.org"

NODE_VER=$(node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>/dev/null && echo "ok" || echo "old")
if [ "$NODE_VER" = "old" ]; then
  err "Node.js v18+ required. Current: $(node --version). Update at https://nodejs.org"
fi

log "Node.js $(node --version) ✓"
log "npm $(npm --version) ✓"

# Check for Docker (optional)
if command -v docker >/dev/null 2>&1; then
  log "Docker $(docker --version | awk '{print $3}' | tr -d ',') ✓"
  HAS_DOCKER=true
else
  warn "Docker not found – you'll need PostgreSQL installed manually"
  HAS_DOCKER=false
fi

# ── 2. Install backend dependencies ─────────────────────────────────────────
step "Installing backend dependencies"
cd "$(dirname "$0")"
npm install
log "Dependencies installed ✓"

# ── 3. Create .env file ──────────────────────────────────────────────────────
step "Setting up environment"

if [ -f ".env" ]; then
  warn ".env already exists – skipping creation"
else
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

  cat > .env << ENVEOF
# ── Server ──────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=4000

# ── PostgreSQL ──────────────────────────────────────────────────────────
# Docker (auto-started below):
DATABASE_URL=postgresql://fixit_user:fixit_local_pass@localhost:5432/fixit_db

# OR if using existing PostgreSQL, replace the line above with your URL:
# DATABASE_URL=postgresql://YOUR_USER:YOUR_PASS@localhost:5432/fixit_db

# ── JWT (auto-generated secure key) ────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=30d

# ── CORS ────────────────────────────────────────────────────────────────
FRONTEND_URL=http://localhost:4000

# ── Uploads ─────────────────────────────────────────────────────────────
MAX_FILE_SIZE_MB=5
UPLOAD_DIR=./uploads

# ── M-Pesa (leave as-is for local testing) ──────────────────────────────
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=sandbox_key
MPESA_CONSUMER_SECRET=sandbox_secret
MPESA_SHORTCODE=174379
MPESA_PASSKEY=sandbox_passkey
MPESA_CALLBACK_URL=http://localhost:4000/api/payments/mpesa/callback
ENVEOF

  log ".env created with auto-generated JWT secret ✓"
fi

# ── 4. Start PostgreSQL ───────────────────────────────────────────────────────
step "Starting PostgreSQL"

if [ "$HAS_DOCKER" = true ]; then
  # Check if container already running
  if docker ps --format '{{.Names}}' | grep -q "fixit-postgres"; then
    log "PostgreSQL container already running ✓"
  else
    log "Starting PostgreSQL via Docker..."
    docker run -d \
      --name fixit-postgres \
      --restart unless-stopped \
      -e POSTGRES_DB=fixit_db \
      -e POSTGRES_USER=fixit_user \
      -e POSTGRES_PASSWORD=fixit_local_pass \
      -p 5432:5432 \
      postgres:16-alpine \
      >/dev/null 2>&1 || true

    log "Waiting for PostgreSQL to be ready..."
    for i in $(seq 1 30); do
      if docker exec fixit-postgres pg_isready -U fixit_user -d fixit_db >/dev/null 2>&1; then
        break
      fi
      printf "."
      sleep 1
    done
    echo ""
    log "PostgreSQL ready ✓"
  fi
else
  warn "No Docker. Make sure PostgreSQL is running with:"
  warn "  DB: fixit_db  User: fixit_user  Pass: fixit_local_pass  Port: 5432"
  warn "Or update DATABASE_URL in .env to match your PostgreSQL setup"
  echo ""
  read -p "Press Enter when PostgreSQL is ready, or Ctrl+C to exit..."
fi

# ── 5. Run migrations ─────────────────────────────────────────────────────────
step "Running database migrations"
node src/migrate.js
log "Schema created ✓"

# ── 6. Seed demo data ─────────────────────────────────────────────────────────
step "Seeding demo data"
node src/seed.js

# ── 7. Done! ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✓ FixIt is ready!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Start the server:   npm run dev"
echo "  Then open:          http://localhost:4000"
echo ""
echo "  Demo accounts (password: Demo@1234)"
echo "  ┌──────────────────────────────────────────┐"
echo "  │  Client:      client@fixit.demo          │"
echo "  │  Technician:  james@fixit.demo           │"
echo "  │  Admin:       admin@fixit.ke             │"
echo "  └──────────────────────────────────────────┘"
echo ""
echo "  API health:  http://localhost:4000/api/health"
echo "  WebSocket:   ws://localhost:4000/ws"
echo ""
