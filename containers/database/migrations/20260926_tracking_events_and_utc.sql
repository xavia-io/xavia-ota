-- Release publication and tracking times were stored as UTC values without a time zone.
DROP VIEW IF EXISTS monthly_installations;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'releases' AND column_name = 'timestamp'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE releases
      ALTER COLUMN timestamp TYPE TIMESTAMPTZ
      USING timestamp AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'releases_tracking' AND column_name = 'download_timestamp'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE releases_tracking
      ALTER COLUMN download_timestamp TYPE TIMESTAMPTZ
      USING download_timestamp AT TIME ZONE 'UTC';
  END IF;
END $$;

ALTER TABLE releases_tracking ADD COLUMN IF NOT EXISTS installation_id UUID;
-- Existing rows may include no-update checks; qualify them only after a new offered manifest.
ALTER TABLE releases_tracking ADD COLUMN IF NOT EXISTS offered_release BOOLEAN NOT NULL DEFAULT FALSE;
DROP INDEX IF EXISTS releases_tracking_unique_install_release;
CREATE UNIQUE INDEX IF NOT EXISTS releases_tracking_unique_install_release
  ON releases_tracking (release_id, installation_id)
  WHERE installation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS release_request_metrics (
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  manifest_requests BIGINT NOT NULL DEFAULT 0,
  download_attempts BIGINT NOT NULL DEFAULT 0,
  asset_requests BIGINT NOT NULL DEFAULT 0,
  bytes_transferred BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (release_id, platform)
);

CREATE OR REPLACE VIEW monthly_installations AS
SELECT to_char(date_trunc('month', download_timestamp AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
       COUNT(DISTINCT installation_id) AS count
FROM releases_tracking
WHERE installation_id IS NOT NULL AND offered_release = TRUE
GROUP BY date_trunc('month', download_timestamp AT TIME ZONE 'UTC');
