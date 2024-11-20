CREATE TABLE IF NOT EXISTS releases_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID NOT NULL REFERENCES releases(id),
    download_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    platform VARCHAR(50) NOT NULL,
    CONSTRAINT fk_release
        FOREIGN KEY(release_id) 
        REFERENCES releases(id)
        ON DELETE CASCADE
);

-- Index for faster queries on release_id and timestamp
CREATE INDEX idx_tracking_release_id ON releases_tracking(release_id);
CREATE INDEX idx_tracking_platform ON releases_tracking(platform);
