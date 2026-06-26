#!/usr/bin/env bash
# FixIt – Mac PostgreSQL setup (no Docker needed)

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[FixIt]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $1"; }
err()  { echo -e "${RED}[error]${NC} $1"; exit 1; }
step() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

step "Finding PostgreSQL on your Mac"

# Find psql binary
PSQL=""
for p in \
  /usr/local/bin/psql \
  /opt/homebrew/bin/psql \
  /Applications/Postgres.app/Contents/Versions/latest/bin/psql \
  $(ls /Applications/Postgres.app/Contents/Versions/*/bin/psql 2>/dev/null | tail -1); do
  if [ -x "$p" ]; then PSQL="$p"; break; fi
done

# Try PATH
if [ -z "$PSQL" ]; then
  PSQL=$(which psql 2>/dev/null || echo "")
fi

if [ -z "$PSQL" ]; then
  echo ""
  echo -e "${RED}PostgreSQL not found on this Mac.${NC}"
  echo ""
  echo "Install it one of these ways:"
  echo ""
  echo "  Option 1 – Homebrew (recommended):"
  echo "    brew install postgresql@16"
  echo "    brew services start postgresql@16"
  echo "    echo 'export PATH=\"/opt/homebrew/opt/postgresql@16/bin:\$PATH\"' >> ~/.zshrc"
  echo "    source ~/.zshrc"
  echo ""
  echo "  Option 2 – Postgres.app (GUI, easiest):"
  echo "    Download from https://postgresapp.com"
  echo "    Open it, click Initialize"
  echo ""
  echo "Then run this script again: bash setup_mac_postgres.sh"
  exit 1
fi

log "Found psql: $PSQL"
PSQL_DIR=$(dirname "$PSQL")

# Check PostgreSQL is running
if ! "$PSQL" -U "$USER" -c '\q' 2>/dev/null; then
  warn "PostgreSQL is installed but not running. Starting it..."

  # Try Homebrew service start
  if command -v brew >/dev/null 2>&1; then
    # Try both common postgresql formula names
    brew services start postgresql@16 2>/dev/null || \
    brew services start postgresql@15 2>/dev/null || \
    brew services start postgresql    2>/dev/null || true
    sleep 3
  fi

  # Try pg_ctl
  for data_dir in \
    /opt/homebrew/var/postgresql@16 \
    /opt/homebrew/var/postgresql@15 \
    /opt/homebrew/var/postgresql \
    /usr/local/var/postgresql@16 \
    /usr/local/var/postgresql; do
    if [ -d "$data_dir" ]; then
      "$PSQL_DIR/pg_ctl" start -D "$data_dir" -l "$data_dir/server.log" 2>/dev/null || true
      sleep 2
      break
    fi
  done
fi

# Verify running
if ! "$PSQL" -U "$USER" -c '\q' 2>/dev/null; then
  err "PostgreSQL is still not running. Start it manually then run this script again."
fi
log "PostgreSQL is running ✓"

step "Creating database user and database"

# Create user (ignore if already exists)
"$PSQL" -U "$USER" postgres -c "CREATE USER fixit_user WITH PASSWORD 'fixit_local_pass';" 2>/dev/null || \
  log "User fixit_user already exists – skipping"

# Create database (ignore if already exists)
"$PSQL" -U "$USER" postgres -c "CREATE DATABASE fixit_db OWNER fixit_user;" 2>/dev/null || \
  log "Database fixit_db already exists – skipping"

# Grant privileges
"$PSQL" -U "$USER" postgres -c "GRANT ALL PRIVILEGES ON DATABASE fixit_db TO fixit_user;" 2>/dev/null || true

log "Database ready ✓"

step "Updating .env with your local PostgreSQL"

# Replace DATABASE_URL in .env
if [ -f ".env" ]; then
  # macOS sed requires backup extension
  sed -i '' 's|DATABASE_URL=.*|DATABASE_URL=postgresql://fixit_user:fixit_local_pass@localhost:5432/fixit_db|' .env
  log ".env updated ✓"
else
  err ".env not found – run 'bash setup.sh' first, then re-run this script"
fi

step "Running database migrations"
node src/migrate.js || err "Migration failed. Check errors above."

step "Seeding demo data"
node src/seed.js

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
