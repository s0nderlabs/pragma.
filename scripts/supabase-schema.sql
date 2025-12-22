-- Pragma Admin Dashboard Schema
-- Run this in Supabase SQL Editor to create all tables

-- ============================================================================
-- Core Tables
-- ============================================================================

-- Raw transaction log from ValidatedPayment events
CREATE TABLE IF NOT EXISTS validated_payments (
  id BIGSERIAL PRIMARY KEY,
  tx_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  log_index INT NOT NULL,
  delegator TEXT NOT NULL,  -- User's smart account address
  token TEXT NOT NULL,
  amount_wei TEXT NOT NULL,
  is_native BOOLEAN NOT NULL DEFAULT FALSE,
  timestamp TIMESTAMPTZ NOT NULL,
  token_price_usd DECIMAL(20, 8),
  fee_usd DECIMAL(20, 8),
  volume_usd DECIMAL(20, 8),
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Fee source: pragma (FeeEnforcer), 0x (affiliate), monorail, apriori, opensea
  source TEXT DEFAULT 'pragma',
  -- Action type: swap, stake, unstake_request, unstake_claim, transfer, wrap, unwrap, nft_buy
  action_type TEXT DEFAULT 'swap',
  UNIQUE(tx_hash, log_index)
);

CREATE INDEX idx_payments_delegator ON validated_payments(delegator);
CREATE INDEX idx_payments_timestamp ON validated_payments(timestamp);
CREATE INDEX idx_payments_token ON validated_payments(token);
CREATE INDEX idx_payments_source ON validated_payments(source);
CREATE INDEX idx_payments_action_type ON validated_payments(action_type);

-- Per-user summary (aggregated from validated_payments)
CREATE TABLE IF NOT EXISTS users (
  address TEXT PRIMARY KEY,  -- Smart account address
  eoa_address TEXT,  -- Owner's EOA address
  created_at TIMESTAMPTZ,  -- Account deployment time
  first_tx_at TIMESTAMPTZ,
  last_tx_at TIMESTAMPTZ,
  tx_count INT NOT NULL DEFAULT 0,
  total_volume_usd DECIMAL(20, 8) NOT NULL DEFAULT 0,
  total_fees_usd DECIMAL(20, 8) NOT NULL DEFAULT 0,
  active_days INT NOT NULL DEFAULT 0,
  is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason TEXT,
  flag_status TEXT CHECK (flag_status IN ('pending', 'legitimate', 'excluded')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_eoa ON users(eoa_address);
CREATE INDEX idx_users_flagged ON users(is_flagged) WHERE is_flagged = TRUE;
CREATE INDEX idx_users_volume ON users(total_volume_usd DESC);

-- Daily aggregated stats (for charts)
CREATE TABLE IF NOT EXISTS daily_stats (
  date DATE PRIMARY KEY,
  new_accounts INT NOT NULL DEFAULT 0,
  new_transactors INT NOT NULL DEFAULT 0,
  active_users INT NOT NULL DEFAULT 0,
  tx_count INT NOT NULL DEFAULT 0,
  volume_usd DECIMAL(20, 8) NOT NULL DEFAULT 0,
  fees_usd DECIMAL(20, 8) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track new account deployments (app-side tracking)
CREATE TABLE IF NOT EXISTS account_deployments (
  id BIGSERIAL PRIMARY KEY,
  tx_hash TEXT NOT NULL UNIQUE,
  block_number BIGINT,
  eoa_address TEXT NOT NULL,
  smart_account TEXT NOT NULL,
  factory_address TEXT,
  paymaster_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deployments_eoa ON account_deployments(eoa_address);
CREATE INDEX idx_deployments_smart_account ON account_deployments(smart_account);
CREATE INDEX idx_deployments_created ON account_deployments(created_at);

-- Track indexer sync operations (for accurate "last synced" timestamps)
CREATE TABLE IF NOT EXISTS indexer_syncs (
  id BIGSERIAL PRIMARY KEY,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indexed_count INT NOT NULL DEFAULT 0,
  from_block BIGINT NOT NULL,
  to_block BIGINT NOT NULL
);

CREATE INDEX idx_indexer_syncs_synced_at ON indexer_syncs(synced_at DESC);

-- ============================================================================
-- Revenue Tables
-- ============================================================================

-- Revenue by aggregator source
CREATE TABLE IF NOT EXISTS aggregator_stats (
  date DATE NOT NULL,
  aggregator TEXT NOT NULL CHECK (aggregator IN ('pragma', 'monorail', '0x')),
  tx_count INT NOT NULL DEFAULT 0,
  volume_usd DECIMAL(20, 8) NOT NULL DEFAULT 0,
  fees_usd DECIMAL(20, 8) NOT NULL DEFAULT 0,
  PRIMARY KEY (date, aggregator)
);

-- Revenue by token
CREATE TABLE IF NOT EXISTS token_stats (
  date DATE NOT NULL,
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  tx_count INT NOT NULL DEFAULT 0,
  volume_usd DECIMAL(20, 8) NOT NULL DEFAULT 0,
  fees_usd DECIMAL(20, 8) NOT NULL DEFAULT 0,
  PRIMARY KEY (date, token_address)
);

-- ============================================================================
-- Campaign Tables
-- ============================================================================

-- Configurable campaign settings
CREATE TABLE IF NOT EXISTS campaigns (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  target_users INT NOT NULL DEFAULT 500,
  target_volume_usd DECIMAL(20, 8) NOT NULL DEFAULT 275000,
  target_transactions INT NOT NULL DEFAULT 5000,
  target_retention_pct INT NOT NULL DEFAULT 60,
  pool_total_usd DECIMAL(20, 8) NOT NULL DEFAULT 9000,
  pool_cashback_pct INT NOT NULL DEFAULT 75,
  pool_prizes_pct INT NOT NULL DEFAULT 25,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- AI Tables
-- ============================================================================

-- Cached AI summaries (hourly)
CREATE TABLE IF NOT EXISTS ai_summaries (
  id BIGSERIAL PRIMARY KEY,
  summary_text TEXT NOT NULL,
  metrics_snapshot JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_summaries_generated ON ai_summaries(generated_at DESC);

-- AI chat logs
CREATE TABLE IF NOT EXISTS ai_chat_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_address TEXT,
  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  sql_generated TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Auth Tables
-- ============================================================================

-- Admin sessions (for nonce tracking)
CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT,
  auth_type TEXT CHECK (auth_type IN ('wallet', 'password')),
  nonce TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_sessions_address ON admin_sessions(address);
CREATE INDEX idx_sessions_expires ON admin_sessions(expires_at);

-- ============================================================================
-- Views (for convenience)
-- ============================================================================

-- Leaderboard view
CREATE OR REPLACE VIEW leaderboard AS
SELECT
  u.address,
  u.eoa_address,
  u.tx_count,
  u.total_volume_usd,
  u.total_fees_usd,
  u.active_days,
  u.is_flagged,
  u.flag_status,
  -- Projected reward: fees × 2.45 for 245% cashback
  (u.total_fees_usd * 2.45) as projected_reward_usd,
  CASE
    WHEN u.flag_status = 'excluded' THEN 'excluded'
    WHEN u.is_flagged AND u.flag_status IS NULL THEN 'review'
    WHEN u.is_flagged AND u.flag_status = 'pending' THEN 'review'
    ELSE 'eligible'
  END as status
FROM users u
WHERE u.tx_count > 0
ORDER BY u.total_volume_usd DESC;

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to update user stats after payment insert
CREATE OR REPLACE FUNCTION update_user_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users (address, first_tx_at, last_tx_at, tx_count, total_volume_usd, total_fees_usd, updated_at)
  VALUES (
    NEW.delegator,
    NEW.timestamp,
    NEW.timestamp,
    1,
    COALESCE(NEW.volume_usd, 0),
    COALESCE(NEW.fee_usd, 0),
    NOW()
  )
  ON CONFLICT (address) DO UPDATE SET
    last_tx_at = NEW.timestamp,
    tx_count = users.tx_count + 1,
    total_volume_usd = users.total_volume_usd + COALESCE(NEW.volume_usd, 0),
    total_fees_usd = users.total_fees_usd + COALESCE(NEW.fee_usd, 0),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update user stats
DROP TRIGGER IF EXISTS trigger_update_user_stats ON validated_payments;
CREATE TRIGGER trigger_update_user_stats
  AFTER INSERT ON validated_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_user_stats();

-- Function to update user from account deployment
CREATE OR REPLACE FUNCTION update_user_from_deployment()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users (address, eoa_address, created_at, updated_at)
  VALUES (
    NEW.smart_account,
    NEW.eoa_address,
    NEW.created_at,
    NOW()
  )
  ON CONFLICT (address) DO UPDATE SET
    eoa_address = COALESCE(users.eoa_address, NEW.eoa_address),
    created_at = COALESCE(users.created_at, NEW.created_at),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update user from deployment
DROP TRIGGER IF EXISTS trigger_update_user_from_deployment ON account_deployments;
CREATE TRIGGER trigger_update_user_from_deployment
  AFTER INSERT ON account_deployments
  FOR EACH ROW
  EXECUTE FUNCTION update_user_from_deployment();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE validated_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE aggregator_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE indexer_syncs ENABLE ROW LEVEL SECURITY;

-- Policies: Allow read for authenticated (for AI chatbot read-only queries)
-- Write operations use service role key (bypasses RLS)
CREATE POLICY "Allow read for authenticated" ON validated_payments FOR SELECT USING (true);
CREATE POLICY "Allow read for authenticated" ON users FOR SELECT USING (true);
CREATE POLICY "Allow read for authenticated" ON daily_stats FOR SELECT USING (true);
CREATE POLICY "Allow read for authenticated" ON account_deployments FOR SELECT USING (true);
CREATE POLICY "Allow read for authenticated" ON aggregator_stats FOR SELECT USING (true);
CREATE POLICY "Allow read for authenticated" ON token_stats FOR SELECT USING (true);
CREATE POLICY "Allow read for authenticated" ON campaigns FOR SELECT USING (true);
CREATE POLICY "Allow read for authenticated" ON ai_summaries FOR SELECT USING (true);
CREATE POLICY "Allow read for authenticated" ON ai_chat_logs FOR SELECT USING (true);
CREATE POLICY "Allow read for authenticated" ON admin_sessions FOR SELECT USING (true);
CREATE POLICY "Allow read for authenticated" ON indexer_syncs FOR SELECT USING (true);
