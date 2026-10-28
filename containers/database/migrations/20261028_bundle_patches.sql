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
