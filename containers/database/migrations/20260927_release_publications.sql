-- A release can be served under several update IDs: its original publish and any rollbacks to it.
-- Phones only accept an update with a new ID, so each rollback adds a publication here instead of
-- inserting a second releases row.
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

-- Keep serving the ID phones already have, so the current Live release is not offered again.
-- The manifest used to send the request time as createdAt, so a phone may hold an update newer than
-- the Live release's timestamp. Stamp the Live publication now so phones without it still accept it.
INSERT INTO release_publications (release_id, runtime_version, update_id, published_at, kind)
SELECT id, runtime_version, update_id,
       CASE WHEN status = 'active' THEN now() ELSE timestamp END, 'publish'
FROM releases
WHERE update_id IS NOT NULL
ON CONFLICT (runtime_version, update_id) DO NOTHING;
