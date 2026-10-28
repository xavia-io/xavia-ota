CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runtime_version VARCHAR(255) NOT NULL,
  path VARCHAR(255) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  commit_hash VARCHAR(255) NOT NULL,
  commit_message TEXT NOT NULL,
  update_id VARCHAR(255),
  repository_url VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'inactive'
);
CREATE INDEX IF NOT EXISTS releases_runtime_status_idx ON releases (runtime_version, status);
CREATE UNIQUE INDEX IF NOT EXISTS releases_runtime_update_id_unique
  ON releases (runtime_version, update_id) WHERE update_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS releases_one_active_per_runtime_unique
  ON releases (runtime_version) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS release_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  runtime_version VARCHAR(255) NOT NULL,
  update_id VARCHAR(255) NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('publish', 'rollback')),
  rolled_back_from_release_id UUID REFERENCES releases(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS release_publications_runtime_update_id_unique
  ON release_publications (runtime_version, update_id);
CREATE INDEX IF NOT EXISTS release_publications_release_idx
  ON release_publications (release_id, published_at DESC);
CREATE INDEX IF NOT EXISTS release_publications_rolled_back_from_idx
  ON release_publications (rolled_back_from_release_id);

CREATE TABLE IF NOT EXISTS release_bundle_patches (
  target_release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  base_release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  platform VARCHAR(16) NOT NULL CHECK (platform IN ('ios', 'android')),
  target_hash VARCHAR(64) NOT NULL,
  base_hash VARCHAR(64) NOT NULL,
  patch_hash VARCHAR(64) NOT NULL,
  storage_path TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0),
  PRIMARY KEY (target_release_id, base_release_id, platform)
);
