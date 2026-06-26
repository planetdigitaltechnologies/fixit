-- FixIt Production Schema – PostgreSQL
-- Run: psql $DATABASE_URL -f migrations/001_schema.sql

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────
CREATE TYPE user_role       AS ENUM ('client', 'technician', 'admin');
CREATE TYPE tech_category   AS ENUM ('plumber', 'electrician', 'mechanic');
CREATE TYPE booking_status  AS ENUM ('pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'disputed');
CREATE TYPE payment_status  AS ENUM ('pending', 'processing', 'paid', 'failed', 'refunded');
CREATE TYPE payment_method  AS ENUM ('mpesa', 'card', 'wallet', 'cash');
CREATE TYPE verify_status   AS ENUM ('pending', 'verified', 'rejected', 'suspended');
CREATE TYPE notif_type      AS ENUM ('booking', 'payment', 'message', 'review', 'system', 'promotion');

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(120)  NOT NULL,
  email           VARCHAR(255)  NOT NULL UNIQUE,
  phone           VARCHAR(20)   NOT NULL UNIQUE,
  password_hash   VARCHAR(255)  NOT NULL,
  role            user_role     NOT NULL DEFAULT 'client',
  avatar_url      TEXT,
  avatar_initials VARCHAR(3),
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  is_email_verified BOOLEAN     NOT NULL DEFAULT false,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role  ON users(role);

-- ─────────────────────────────────────────────
-- REFRESH TOKENS (secure session management)
-- ─────────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255)  NOT NULL UNIQUE,
  device_info TEXT,
  ip_address  INET,
  expires_at  TIMESTAMPTZ   NOT NULL,
  revoked     BOOLEAN       NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ─────────────────────────────────────────────
-- TECHNICIANS
-- ─────────────────────────────────────────────
CREATE TABLE technicians (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  category        tech_category NOT NULL,
  experience_yrs  SMALLINT      NOT NULL DEFAULT 0 CHECK (experience_yrs >= 0),
  hourly_rate     NUMERIC(10,2) NOT NULL CHECK (hourly_rate > 0),
  bio             TEXT,
  -- Location (updated in real-time)
  current_lat     DECIMAL(10,8),
  current_lng     DECIMAL(11,8),
  home_area       VARCHAR(120),
  -- Identity & Verification
  id_number       VARCHAR(30)   NOT NULL,
  cert_number     VARCHAR(60)   NOT NULL,
  cert_doc_url    TEXT,
  id_doc_url      TEXT,
  verify_status   verify_status NOT NULL DEFAULT 'pending',
  verified_at     TIMESTAMPTZ,
  verified_by     UUID          REFERENCES users(id),
  iprs_checked_at TIMESTAMPTZ,
  iprs_response   JSONB,
  -- Availability
  is_online       BOOLEAN       NOT NULL DEFAULT false,
  is_available    BOOLEAN       NOT NULL DEFAULT true,
  -- Stats (denormalised for fast reads)
  rating          NUMERIC(3,2)  NOT NULL DEFAULT 0.00 CHECK (rating >= 0 AND rating <= 5),
  total_reviews   INTEGER       NOT NULL DEFAULT 0,
  total_jobs      INTEGER       NOT NULL DEFAULT 0,
  total_earned    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tech_user       ON technicians(user_id);
CREATE INDEX idx_tech_category   ON technicians(category);
CREATE INDEX idx_tech_verify     ON technicians(verify_status);
CREATE INDEX idx_tech_online     ON technicians(is_online);
CREATE INDEX idx_tech_rating     ON technicians(rating DESC);

-- ─────────────────────────────────────────────
-- BOOKINGS
-- ─────────────────────────────────────────────
CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID            NOT NULL REFERENCES users(id),
  technician_id   UUID            NOT NULL REFERENCES technicians(id),
  -- Job details
  issue_title     VARCHAR(200)    NOT NULL,
  issue_desc      TEXT            NOT NULL,
  urgency         VARCHAR(50)     NOT NULL DEFAULT 'normal',
  category        tech_category   NOT NULL,
  -- Location
  address         TEXT            NOT NULL,
  client_lat      DECIMAL(10,8),
  client_lng      DECIMAL(11,8),
  -- Status & timing
  status          booking_status  NOT NULL DEFAULT 'pending',
  accepted_at     TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  -- Pricing
  estimated_rate  NUMERIC(10,2),
  callout_fee     NUMERIC(10,2)   NOT NULL DEFAULT 500,
  final_amount    NUMERIC(10,2),
  platform_fee    NUMERIC(10,2),
  -- Meta
  client_notes    TEXT,
  tech_notes      TEXT,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_client   ON bookings(client_id);
CREATE INDEX idx_bookings_tech     ON bookings(technician_id);
CREATE INDEX idx_bookings_status   ON bookings(status);
CREATE INDEX idx_bookings_created  ON bookings(created_at DESC);

-- ─────────────────────────────────────────────
-- BOOKING MEDIA (photos attached to jobs)
-- ─────────────────────────────────────────────
CREATE TABLE booking_media (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID    NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  uploaded_by UUID    NOT NULL REFERENCES users(id),
  url         TEXT    NOT NULL,
  mime_type   VARCHAR(50),
  size_bytes  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_booking ON booking_media(booking_id);

-- ─────────────────────────────────────────────
-- PAYMENTS
-- ─────────────────────────────────────────────
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id      UUID            NOT NULL REFERENCES bookings(id) UNIQUE,
  client_id       UUID            NOT NULL REFERENCES users(id),
  technician_id   UUID            NOT NULL REFERENCES technicians(id),
  amount          NUMERIC(10,2)   NOT NULL,
  platform_fee    NUMERIC(10,2)   NOT NULL DEFAULT 0,
  tech_payout     NUMERIC(10,2)   NOT NULL,
  method          payment_method  NOT NULL,
  status          payment_status  NOT NULL DEFAULT 'pending',
  -- M-Pesa fields
  mpesa_phone         VARCHAR(20),
  mpesa_checkout_id   VARCHAR(100),
  mpesa_receipt       VARCHAR(50),
  mpesa_transaction_date TIMESTAMPTZ,
  -- Card fields
  card_last4      VARCHAR(4),
  card_brand      VARCHAR(20),
  -- Timestamps
  initiated_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ,
  refunded_at     TIMESTAMPTZ,
  refund_reason   TEXT,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_payments_client  ON payments(client_id);
CREATE INDEX idx_payments_tech    ON payments(technician_id);
CREATE INDEX idx_payments_status  ON payments(status);

-- ─────────────────────────────────────────────
-- REVIEWS
-- ─────────────────────────────────────────────
CREATE TABLE reviews (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id      UUID        NOT NULL REFERENCES bookings(id) UNIQUE,
  technician_id   UUID        NOT NULL REFERENCES technicians(id),
  client_id       UUID        NOT NULL REFERENCES users(id),
  rating          SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  is_flagged      BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_tech    ON reviews(technician_id);
CREATE INDEX idx_reviews_client  ON reviews(client_id);
CREATE INDEX idx_reviews_rating  ON reviews(rating);

-- ─────────────────────────────────────────────
-- MESSAGES (per booking chat)
-- ─────────────────────────────────────────────
CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id   UUID        NOT NULL REFERENCES users(id),
  body        TEXT        NOT NULL,
  media_url   TEXT,
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_booking   ON messages(booking_id);
CREATE INDEX idx_messages_sender    ON messages(sender_id);
CREATE INDEX idx_messages_created   ON messages(created_at ASC);

-- ─────────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────────
CREATE TABLE notifications (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notif_type    NOT NULL DEFAULT 'system',
  title       VARCHAR(200)  NOT NULL,
  body        TEXT          NOT NULL,
  data        JSONB,
  is_read     BOOLEAN       NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifs_user    ON notifications(user_id);
CREATE INDEX idx_notifs_read    ON notifications(user_id, is_read);
CREATE INDEX idx_notifs_created ON notifications(created_at DESC);

-- ─────────────────────────────────────────────
-- PUSH SUBSCRIPTIONS
-- ─────────────────────────────────────────────
CREATE TABLE push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT  NOT NULL UNIQUE,
  p256dh      TEXT  NOT NULL,
  auth        TEXT  NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_user ON push_subscriptions(user_id);

-- ─────────────────────────────────────────────
-- AUDIT LOG (security & compliance)
-- ─────────────────────────────────────────────
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID,
  action      VARCHAR(100) NOT NULL,
  table_name  VARCHAR(60),
  record_id   UUID,
  ip_address  INET,
  user_agent  TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user    ON audit_log(user_id);
CREATE INDEX idx_audit_action  ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- ─────────────────────────────────────────────
-- ADMIN SETTINGS
-- ─────────────────────────────────────────────
CREATE TABLE app_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB        NOT NULL,
  updated_by  UUID         REFERENCES users(id),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- AUTO-UPDATE updated_at TRIGGER
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated       BEFORE UPDATE ON users       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_technicians_updated BEFORE UPDATE ON technicians FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_bookings_updated    BEFORE UPDATE ON bookings    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- AUTO-RECALCULATE technician rating on review
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recalc_technician_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE technicians SET
    rating       = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM reviews WHERE technician_id = NEW.technician_id),
    total_reviews = (SELECT COUNT(*) FROM reviews WHERE technician_id = NEW.technician_id)
  WHERE id = NEW.technician_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_review_rating
  AFTER INSERT OR UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION recalc_technician_rating();

-- ─────────────────────────────────────────────
-- DEFAULT APP SETTINGS
-- ─────────────────────────────────────────────
INSERT INTO app_settings (key, value) VALUES
  ('platform_fee_percent', '5'),
  ('callout_fee_kes',      '500'),
  ('mpesa_env',            '"sandbox"'),
  ('min_tech_rating',      '3.5'),
  ('max_distance_km',      '25');
