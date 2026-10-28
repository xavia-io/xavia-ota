import { createMocks } from 'node-mocks-http';
import { Pool } from 'pg';

import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { PostgresDatabase } from '../apiUtils/database/LocalDatabase';
import runtimesHandler from '../pages/api/runtimes';

jest.mock('pg');
jest.mock('../apiUtils/database/DatabaseFactory');

describe('runtime summary list', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pages and searches published runtimes in PostgreSQL', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ version: '1.1.2', releaseCount: 1 }] })
      .mockResolvedValueOnce({ rows: [{ total: 21 }] });
    (Pool as unknown as jest.Mock).mockImplementation(() => ({ query }));

    expect(await new PostgresDatabase().listRuntimeSummaries('1.1', 20, 20)).toEqual({
      runtimes: [{ version: '1.1.2', releaseCount: 1 }],
      total: 21,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('active', 'inactive')"),
      ['1.1', 20, 20]
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('COUNT(DISTINCT runtime_version)'),
      ['1.1']
    );
  });

  it('orders runtimes by version, highest first, not by last push', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ total: 0 }] });
    (Pool as unknown as jest.Mock).mockImplementation(() => ({ query }));

    await new PostgresDatabase().listRuntimeSummaries('', 20, 0);

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("string_to_array(published.version, '.')::numeric[] END DESC");
    expect(sql).not.toContain('"latestPublishedAt" DESC');
  });

  it('returns a page of runtime summaries', async () => {
    const listRuntimeSummaries = jest.fn().mockResolvedValue({
      runtimes: [{ version: '1.1.2', releaseCount: 1 }],
      total: 21,
    });
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({ listRuntimeSummaries });
    const { req, res } = createMocks({ method: 'GET', query: { search: '1.1', page: '2' } });

    await runtimesHandler(req, res);

    expect(listRuntimeSummaries).toHaveBeenCalledWith('1.1', 20, 20);
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      runtimes: [{ version: '1.1.2', releaseCount: 1 }],
      total: 21,
      page: 2,
      pageSize: 20,
    });
  });
});
