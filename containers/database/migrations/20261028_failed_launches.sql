-- When an update throws before its first screen appears, expo-updates rolls the phone back and lists
-- that update in Expo-Recent-Failed-Update-IDs on every later manifest request. Keep one row per
-- installation and release, from the first report.
CREATE TABLE IF NOT EXISTS release_failed_launches (
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  installation_id UUID NOT NULL,
  platform VARCHAR(50) NOT NULL,
  first_reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (release_id, installation_id)
);
