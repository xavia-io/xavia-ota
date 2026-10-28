CREATE TABLE IF NOT EXISTS release_download_attempts (
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  installation_id UUID NOT NULL,
  platform VARCHAR(50) NOT NULL,
  first_asset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (release_id, installation_id)
);
