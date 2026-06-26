# FixIt – Windows Local Setup Script
# Run in PowerShell: .\setup.ps1

$ErrorActionPreference = "Stop"

function log  { Write-Host "[FixIt] $args" -ForegroundColor Green }
function warn { Write-Host "[warn]  $args" -ForegroundColor Yellow }
function err  { Write-Host "[error] $args" -ForegroundColor Red; exit 1 }
function step { Write-Host "`n━━━ $args ━━━" -ForegroundColor Cyan }

Write-Host @"

  ███████╗██╗██╗  ██╗██╗████████╗
  ██╔════╝██║╚██╗██╔╝██║╚══██╔══╝
  █████╗  ██║ ╚███╔╝ ██║   ██║
  ██╔══╝  ██║ ██╔██╗ ██║   ██║
  ██║     ██║██╔╝ ██╗██║   ██║
  ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝   ╚═╝

  Home Services Platform – Windows Setup
"@ -ForegroundColor Green

# ── 1. Check prerequisites ──────────────────────────────────────────────────
step "Checking prerequisites"

try { $nodeVer = node --version } catch { err "Node.js not found. Download from https://nodejs.org (v18+)" }
try { $npmVer  = npm --version  } catch { err "npm not found. Reinstall Node.js from https://nodejs.org" }

$nodeMajor = [int]($nodeVer -replace 'v(\d+)\..*','$1')
if ($nodeMajor -lt 18) { err "Node.js v18+ required. Current: $nodeVer. Update at https://nodejs.org" }

log "Node.js $nodeVer ✓"
log "npm $npmVer ✓"

$hasDocker = $false
try { docker --version | Out-Null; $hasDocker = $true; log "Docker ✓" }
catch { warn "Docker not found – you'll need PostgreSQL installed manually" }

# ── 2. Install dependencies ─────────────────────────────────────────────────
step "Installing backend dependencies"
Set-Location $PSScriptRoot
npm install
log "Dependencies installed ✓"

# ── 3. Create .env ──────────────────────────────────────────────────────────
step "Setting up environment"

if (Test-Path ".env") {
    warn ".env already exists – skipping"
} else {
    $jwtSecret = node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
    $envContent = @"
# ── Server ──────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=4000

# ── PostgreSQL ──────────────────────────────────────────────────────────
DATABASE_URL=postgresql://fixit_user:fixit_local_pass@localhost:5432/fixit_db

# ── JWT ─────────────────────────────────────────────────────────────────
JWT_SECRET=$jwtSecret
JWT_EXPIRES_IN=30d

# ── CORS ────────────────────────────────────────────────────────────────
FRONTEND_URL=http://localhost:4000

# ── Uploads ─────────────────────────────────────────────────────────────
MAX_FILE_SIZE_MB=5
UPLOAD_DIR=./uploads

# ── M-Pesa (sandbox for local testing) ──────────────────────────────────
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=sandbox_key
MPESA_CONSUMER_SECRET=sandbox_secret
MPESA_SHORTCODE=174379
MPESA_PASSKEY=sandbox_passkey
MPESA_CALLBACK_URL=http://localhost:4000/api/payments/mpesa/callback
"@
    $envContent | Out-File -FilePath ".env" -Encoding utf8
    log ".env created with secure JWT secret ✓"
}

# ── 4. Start PostgreSQL ─────────────────────────────────────────────────────
step "Starting PostgreSQL"

if ($hasDocker) {
    $running = docker ps --format "{{.Names}}" | Select-String "fixit-postgres"
    if ($running) {
        log "PostgreSQL container already running ✓"
    } else {
        log "Starting PostgreSQL via Docker..."
        docker run -d `
            --name fixit-postgres `
            --restart unless-stopped `
            -e POSTGRES_DB=fixit_db `
            -e POSTGRES_USER=fixit_user `
            -e POSTGRES_PASSWORD=fixit_local_pass `
            -p 5432:5432 `
            postgres:16-alpine | Out-Null

        log "Waiting for PostgreSQL to be ready..."
        $ready = $false
        for ($i = 0; $i -lt 30; $i++) {
            try {
                docker exec fixit-postgres pg_isready -U fixit_user -d fixit_db 2>&1 | Out-Null
                $ready = $true; break
            } catch {}
            Start-Sleep -Seconds 1
            Write-Host "." -NoNewline
        }
        Write-Host ""
        if ($ready) { log "PostgreSQL ready ✓" }
        else { err "PostgreSQL did not start in time. Check Docker." }
    }
} else {
    warn "Make sure PostgreSQL is running with:"
    warn "  DB: fixit_db  User: fixit_user  Pass: fixit_local_pass  Port: 5432"
    Read-Host "Press Enter when PostgreSQL is ready"
}

# ── 5. Run migrations ───────────────────────────────────────────────────────
step "Running database migrations"
node src/migrate.js
log "Schema created ✓"

# ── 6. Seed demo data ───────────────────────────────────────────────────────
step "Seeding demo data"
node src/seed.js

# ── 7. Done ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  ✓ FixIt is ready!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  Start the server:   npm run dev"
Write-Host "  Then open:          http://localhost:4000"
Write-Host ""
Write-Host "  Demo accounts (password: Demo@1234)" -ForegroundColor Cyan
Write-Host "  ┌──────────────────────────────────────────┐"
Write-Host "  │  Client:      client@fixit.demo          │"
Write-Host "  │  Technician:  james@fixit.demo           │"
Write-Host "  │  Admin:       admin@fixit.ke             │"
Write-Host "  └──────────────────────────────────────────┘"
Write-Host ""
