-- Apply to existing PostgreSQL and Supabase databases before deploying the server.
ALTER TABLE releases_tracking ADD COLUMN IF NOT EXISTS installation_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS releases_tracking_unique_install_release
    ON releases_tracking (release_id, installation_id);
CREATE OR REPLACE VIEW monthly_installations AS
SELECT to_char(date_trunc('month', download_timestamp), 'YYYY-MM') AS month,
       COUNT(DISTINCT installation_id) AS count
FROM releases_tracking
WHERE installation_id IS NOT NULL
GROUP BY date_trunc('month', download_timestamp);
