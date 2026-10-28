const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runMigrations } = require('../scripts/migrate-postgres');

describe('Xavia database migrations', () => {
  let directory;
  let queries;
  let applied;
  let client;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xavia-migrations-'));
    queries = [];
    applied = new Map();
    client = {
      query: jest.fn(async (sql, params) => {
        queries.push(sql);
        if (sql.startsWith('SELECT checksum')) {
          return { rows: applied.has(params[0]) ? [{ checksum: applied.get(params[0]) }] : [] };
        }
        if (sql.startsWith('INSERT INTO')) {
          applied.set(params[0], params[1]);
        }
        return { rows: [] };
      }),
    };
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('applies each file once and records its checksum', async () => {
    fs.writeFileSync(path.join(directory, '20260925_example.sql'), 'SELECT 1;');
    await runMigrations(client, directory);
    await runMigrations(client, directory);
    expect(queries.filter((sql) => sql === 'SELECT 1;')).toHaveLength(1);
    expect(applied.has('20260925_example.sql')).toBe(true);
  });

  it('rejects changes to an applied migration', async () => {
    const filename = '20260925_example.sql';
    fs.writeFileSync(path.join(directory, filename), 'SELECT 1;');
    await runMigrations(client, directory);
    fs.writeFileSync(path.join(directory, filename), 'SELECT 2;');
    await expect(runMigrations(client, directory)).rejects.toThrow('Previously applied migration changed');
    expect(queries).not.toContain('SELECT 2;');
  });

  it('rolls back a failed migration', async () => {
    fs.writeFileSync(path.join(directory, '20260925_bad.sql'), 'BAD SQL;');
    client.query.mockImplementation(async (sql) => {
      queries.push(sql);
      if (sql === 'BAD SQL;') throw new Error('invalid SQL');
      if (sql.startsWith('SELECT checksum')) return { rows: [] };
      return { rows: [] };
    });
    await expect(runMigrations(client, directory)).rejects.toThrow('invalid SQL');
    expect(queries).toContain('ROLLBACK');
    expect(queries.some((sql) => sql.startsWith('INSERT INTO'))).toBe(false);
  });
});
