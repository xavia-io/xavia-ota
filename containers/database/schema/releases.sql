CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runtime_version VARCHAR(255) NOT NULL,
  path VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  commit_hash VARCHAR(255) NOT NULL,
  commit_message VARCHAR(255) NOT NULL
);