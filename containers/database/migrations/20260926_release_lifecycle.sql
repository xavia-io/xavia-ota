ALTER TABLE releases ADD COLUMN IF NOT EXISTS update_id VARCHAR(255);
ALTER TABLE releases ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'inactive';
ALTER TABLE releases ALTER COLUMN commit_message TYPE TEXT;

-- Existing installations had no explicit active row. Preserve the most recent release per runtime.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY runtime_version ORDER BY timestamp DESC, id DESC) AS position
  FROM releases
)
UPDATE releases SET status = 'active'
FROM ranked WHERE releases.id = ranked.id AND ranked.position = 1;

CREATE INDEX IF NOT EXISTS releases_runtime_status_idx ON releases (runtime_version, status);
CREATE UNIQUE INDEX IF NOT EXISTS releases_runtime_update_id_unique
  ON releases (runtime_version, update_id) WHERE update_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS releases_one_active_per_runtime_unique
  ON releases (runtime_version) WHERE status = 'active';
