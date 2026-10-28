import { Pool } from 'pg';

import { PostgresDatabase } from '../apiUtils/database/LocalDatabase';

jest.mock('pg');

describe('Postgres bundle patch references', () => {
  let query: jest.Mock;
  let database: PostgresDatabase;
  beforeEach(() => {
    query = jest.fn().mockResolvedValue({ rows: [] });
    (Pool as unknown as jest.Mock).mockImplementation(() => ({ query }));
    database = new PostgresDatabase();
  });

  it('selects at most three completed same-runtime bases, prioritising active', async () => {
    await database.getRecentPatchBases('1.0.0', 'target');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('active', 'inactive')"),
      ['1.0.0', 'target']
    );
    const sql = query.mock.calls[0][0];
    expect(sql).toContain('runtime_version = $1 AND id <> $2');
    expect(sql).toContain("ORDER BY (status = 'active') DESC, timestamp DESC, id DESC LIMIT 3");
  });

  it('persists references idempotently and resolves the exact base/target/platform tuple', async () => {
    await database.saveBundlePatch({
      targetReleaseId: 'target',
      baseReleaseId: 'base',
      platform: 'ios',
      targetHash: 'target-hash',
      baseHash: 'base-hash',
      patchHash: 'patch-hash',
      storagePath: 'patch-path',
      size: 150,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ON CONFLICT (target_release_id, base_release_id, platform) DO UPDATE'
      ),
      ['target', 'base', 'ios', 'target-hash', 'base-hash', 'patch-hash', 'patch-path', 150]
    );
    expect(await database.getBundlePatch('target', 'base', 'ios')).toBeNull();
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining(
        'WHERE target_release_id = $1 AND base_release_id = $2 AND platform = $3'
      ),
      ['target', 'base', 'ios']
    );
  });
});
