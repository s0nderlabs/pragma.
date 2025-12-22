-- Migration: Add source and action_type columns to validated_payments
-- Date: 2025-12-21
-- Purpose: Track fee sources (pragma, 0x, monorail) and action types (swap, stake, etc.)

-- Add source column to track where the fee came from
ALTER TABLE validated_payments
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'pragma';

-- Add action_type column to track what kind of action generated the fee
ALTER TABLE validated_payments
ADD COLUMN IF NOT EXISTS action_type TEXT DEFAULT 'swap';

-- Add comments for documentation
COMMENT ON COLUMN validated_payments.source IS 'Fee source: pragma (FeeEnforcer), 0x (affiliate), monorail (future)';
COMMENT ON COLUMN validated_payments.action_type IS 'Action type: swap, stake, unstake_request, unstake_claim, transfer, wrap, unwrap';

-- Create index for filtering by source and action_type
CREATE INDEX IF NOT EXISTS idx_validated_payments_source ON validated_payments(source);
CREATE INDEX IF NOT EXISTS idx_validated_payments_action_type ON validated_payments(action_type);
