const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');

const migrationsDir = path.join(__dirname, '..', 'containers', 'database', 'migrations');
const lockId = '19475420901100';

async function runMigrations(client, directory = migrationsDir) {
  if (!fs.existsSync(directory)) {
    console.log('No database migrations to run.');
    return;
  }

  const files = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    console.log('No database migrations to run.');
    return;
  }

  await client.query("SET lock_timeout = '30s'");
  await client.query("SET statement_timeout = '10min'");
  await client.query(`SELECT pg_advisory_lock(${lockId})`);
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS xavia_schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    for (const filename of files) {
      const sql = fs.readFileSync(path.join(directory, filename), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const previous = await client.query(
        'SELECT checksum FROM xavia_schema_migrations WHERE filename = $1',
        [filename]
      );
      if (previous.rows.length) {
        if (previous.rows[0].checksum.trim() !== checksum) {
          throw new Error(`Previously applied migration changed: ${filename}`);
        }
        console.log(`Already applied: ${filename}`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO xavia_schema_migrations (filename, checksum) VALUES ($1, $2)',
          [filename, checksum]
        );
        await client.query('COMMIT');
        console.log(`Applied: ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query(`SELECT pg_advisory_unlock(${lockId})`);
  }
}

async function main() {
  const secret = process.env.DATABASE_SECRET_ARN
    ? JSON.parse(
        execFileSync(
          'aws',
          [
            'secretsmanager',
            'get-secret-value',
            '--secret-id',
            process.env.DATABASE_SECRET_ARN,
            '--query',
            'SecretString',
            '--output',
            'text',
          ],
          { encoding: 'utf8' }
        )
      )
    : {
        POSTGRES_USER: process.env.POSTGRES_USER,
        POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
      };

  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    database: process.env.POSTGRES_DB,
    user: secret.POSTGRES_USER,
    password: secret.POSTGRES_PASSWORD,
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    await runMigrations(client);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { runMigrations };
