CREATE TABLE IF NOT EXISTS release_request_metrics (
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  manifest_requests BIGINT NOT NULL DEFAULT 0,
  download_attempts BIGINT NOT NULL DEFAULT 0,
  asset_requests BIGINT NOT NULL DEFAULT 0,
  bytes_transferred BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (release_id, platform)
);

CREATE TABLE IF NOT EXISTS release_download_attempts (
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  installation_id UUID NOT NULL,
  platform VARCHAR(50) NOT NULL,
  first_asset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (release_id, installation_id)
);

CREATE TABLE IF NOT EXISTS release_failed_launches (
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  installation_id UUID NOT NULL,
  platform VARCHAR(50) NOT NULL,
  first_reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (release_id, installation_id)
);
