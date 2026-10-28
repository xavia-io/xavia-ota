-- Apply to existing PostgreSQL and Supabase databases before deploying the server.
ALTER TABLE releases ADD COLUMN IF NOT EXISTS repository_url VARCHAR(255);
