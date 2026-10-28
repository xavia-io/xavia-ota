CREATE TABLE IF NOT EXISTS releases_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID NOT NULL REFERENCES releases(id),
    download_timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    platform VARCHAR(50) NOT NULL,
    installation_id UUID,
    offered_release BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_release
        FOREIGN KEY(release_id) 
        REFERENCES releases(id)
        ON DELETE CASCADE
);

-- Index for faster queries on release_id and timestamp
CREATE INDEX idx_tracking_release_id ON releases_tracking(release_id);
CREATE INDEX idx_tracking_platform ON releases_tracking(platform);
CREATE UNIQUE INDEX releases_tracking_unique_install_release
    ON releases_tracking (release_id, installation_id)
    WHERE installation_id IS NOT NULL;

CREATE OR REPLACE VIEW monthly_installations AS
SELECT to_char(date_trunc('month', download_timestamp AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
       COUNT(DISTINCT installation_id) AS count
FROM releases_tracking
WHERE installation_id IS NOT NULL AND offered_release = TRUE
GROUP BY date_trunc('month', download_timestamp AT TIME ZONE 'UTC');
