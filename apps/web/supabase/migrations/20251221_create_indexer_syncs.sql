-- Create table to track sync operations for accurate "last synced" timestamps
-- This fixes the bug where refreshing the page showed old sync times

CREATE TABLE IF NOT EXISTS indexer_syncs (
  id BIGSERIAL PRIMARY KEY,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indexed_count INT NOT NULL DEFAULT 0,
  from_block BIGINT NOT NULL,
  to_block BIGINT NOT NULL
);

-- Create index for fast lookups of most recent sync
CREATE INDEX IF NOT EXISTS idx_indexer_syncs_synced_at ON indexer_syncs(synced_at DESC);

-- Add comment for documentation
COMMENT ON TABLE indexer_syncs IS 'Tracks indexer sync operations for accurate last-synced timestamps';
