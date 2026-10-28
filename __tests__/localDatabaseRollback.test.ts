import { Pool } from 'pg';

import { PostgresDatabase } from '../apiUtils/database/LocalDatabase';

jest.mock('pg');

function databaseWithActive(activeId: string) {
  const query = jest.fn().mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT runtime_version')) return { rows: [{ runtime_version: '1.2.0' }] };
    if (sql.includes('SELECT id, update_id, status')) {
      return { rows: [{ id: 'target-id', update_id: 'target-update', status: 'inactive' }] };
    }
    if (sql.includes('SELECT id, update_id FROM')) {
      return { rows: [{ id: activeId, update_id: 'current-update' }] };
    }
    if (sql.includes('INSERT INTO release_publications')) {
      return { rows: [{ update_id: 'rollback-update' }] };
    }
    return { rows: [] };
  });
  const release = jest.fn();
  (Pool as unknown as jest.Mock).mockImplementation(() => ({
    connect: async () => ({ query, release }),
  }));
  return { database: new PostgresDatabase(), query, release };
}

describe('Postgres rollback activation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('switches only the selected runtime in one transaction', async () => {
    const { database, query, release } = databaseWithActive('current-id');

    expect(await database.rollbackToRelease('target-id', 'current-id')).toEqual({
      outcome: 'activated',
      updateId: 'rollback-update',
    });
    const calls = query.mock.calls.map(([sql]) => String(sql).trim());
    expect(calls[0]).toBe('BEGIN');
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("SET status = 'inactive'"),
        expect.stringContaining("SET status = 'active'"),
      ])
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'inactive'"), [
      '1.2.0',
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'active'"), [
      'target-id',
      '1.2.0',
    ]);
    expect(calls[calls.length - 1]).toBe('COMMIT');
    expect(release).toHaveBeenCalled();
  });

  it('adds a rollback publication with a fresh update ID instead of a new release row', async () => {
    const { database, query } = databaseWithActive('current-id');

    await database.rollbackToRelease('target-id', 'current-id');
    const calls = query.mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => /INSERT INTO releases\s*\(/.test(sql))).toBe(false);
    const publication = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO release_publications')
    )!;
    expect(publication[0]).toContain("gen_random_uuid()::text, now(), 'rollback'");
    // Linked to the release the operator chose and to the release that was Live before.
    expect(publication[1]).toEqual(['target-id', '1.2.0', 'current-id']);
    const statuses = calls.findIndex((sql) => sql.includes("SET status = 'active'"));
    expect(calls.indexOf(publication[0])).toBeGreaterThan(statuses);
    expect(calls[calls.length - 1].trim()).toBe('COMMIT');
  });

  it('refuses a stale confirmation without changing release status', async () => {
    const { database, query } = databaseWithActive('newer-id');

    expect(await database.rollbackToRelease('target-id', 'previous-id')).toEqual({
      outcome: 'active_changed',
    });
    const calls = query.mock.calls.map(([sql]) => String(sql));
    expect(calls).toContain('ROLLBACK');
    expect(calls.some((sql) => sql.includes('SET status'))).toBe(false);
    expect(calls.some((sql) => sql.includes('INSERT INTO release_publications'))).toBe(false);
  });

  it('leaves an already active target unchanged', async () => {
    const { database, query } = databaseWithActive('target-id');

    expect(await database.rollbackToRelease('target-id', 'target-id')).toEqual({
      outcome: 'already_active',
    });
    const calls = query.mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.includes('INSERT INTO release_publications'))).toBe(false);
  });
});

describe('Postgres publication lookups', () => {
  beforeEach(() => jest.clearAllMocks());

  function databaseWithQuery(rows: object[]) {
    const query = jest.fn().mockResolvedValue({ rows });
    (Pool as unknown as jest.Mock).mockImplementation(() => ({ query }));
    return { database: new PostgresDatabase(), query };
  }

  it('serves the latest publication of the active release', async () => {
    const { database, query } = databaseWithQuery([
      {
        id: 'target-id',
        updateId: 'content-update',
        servedUpdateId: 'rollback-update',
        servedAt: new Date('2026-09-27T10:00:00Z'),
      },
    ]);

    const release = await database.getLatestReleaseRecordForRuntimeVersion('1.2.0');
    expect(release?.servedUpdateId).toBe('rollback-update');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('FROM release_publications p');
    expect(sql).toContain('ORDER BY p.published_at DESC');
    expect(params).toEqual(['1.2.0']);
  });

  it('resolves any publication update ID to the parent release', async () => {
    const { database, query } = databaseWithQuery([
      { id: 'target-id', path: 'updates/1.2.0/a.zip' },
    ]);

    expect(await database.getReleaseByUpdateId('1.2.0', 'rollback-update')).toEqual({
      id: 'target-id',
      path: 'updates/1.2.0/a.zip',
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('r.update_id = $2 OR EXISTS');
    expect(sql).toContain('p.release_id = r.id');
    expect(params).toEqual(['1.2.0', 'rollback-update']);
  });

  it('lists one row per release with its publications attached', async () => {
    const { database, query } = databaseWithQuery([]);

    await database.listReleases();
    const [sql] = query.mock.calls[0];
    expect(sql).toContain('json_agg');
    expect(sql).toMatch(/FROM releases r\s+ORDER BY/);
  });
});

describe('Postgres upload activation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps the active release of another runtime when 1.1.2 is published', async () => {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT runtime_version')) {
        return { rows: [{ runtime_version: '1.1.2' }] };
      }
      if (sql.includes("SET status = 'active'")) return { rowCount: 1 };
      return { rows: [] };
    });
    const release = jest.fn();
    (Pool as unknown as jest.Mock).mockImplementation(() => ({
      connect: async () => ({ query, release }),
    }));

    await new PostgresDatabase().activateRelease('new-1.1.2-ota');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "SET status = 'inactive' WHERE runtime_version = $1 AND status = 'active'"
      ),
      ['1.1.2']
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'active' WHERE id = $1"),
      ['new-1.1.2-ota']
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining("now(), 'publish'"), [
      'new-1.1.2-ota',
    ]);
    const statements = query.mock.calls.map(([sql]) => String(sql).trim());
    expect(statements[statements.length - 1]).toBe('COMMIT');
    expect(release).toHaveBeenCalled();
  });
});
