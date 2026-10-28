import { Pool } from 'pg';
import { createMocks } from 'node-mocks-http';

import { PostgresDatabase } from '../apiUtils/database/LocalDatabase';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import runtimeMetricsHandler from '../pages/api/runtimes/[runtimeVersion]';

jest.mock('pg');
jest.mock('../apiUtils/database/DatabaseFactory');

describe('runtime installation metrics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('counts distinct installations across the selected runtime and platform', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ iosInstalls: '2', androidInstalls: '3', uniqueInstallsThisMonth: '4' }],
    });
    (Pool as unknown as jest.Mock).mockImplementation(() => ({ query }));
    const database = new PostgresDatabase();

    expect(await database.getRuntimeInstallationMetrics('1.2.0')).toEqual({
      iosInstalls: 2,
      androidInstalls: 3,
      uniqueInstallsThisMonth: 4,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('COUNT(DISTINCT t.installation_id)'),
      ['1.2.0']
    );
    const sql = query.mock.calls[0][0];
    expect(sql).toContain('JOIN releases r ON r.id = t.release_id');
    expect(sql).toContain('r.runtime_version = $1');
    expect(sql).toContain("date_trunc('month', t.download_timestamp AT TIME ZONE 'Africa/Lagos')");
    expect(sql).toContain('t.offered_release = TRUE');
  });

  it('passes the selected runtime to the API metrics query', async () => {
    const getRuntimeInstallationMetrics = jest.fn().mockResolvedValue({
      iosInstalls: 2,
      androidInstalls: 3,
      uniqueInstallsThisMonth: 4,
    });
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({ getRuntimeInstallationMetrics });
    const { req, res } = createMocks({ method: 'GET', query: { runtimeVersion: '1.2.0' } });

    await runtimeMetricsHandler(req, res);

    expect(getRuntimeInstallationMetrics).toHaveBeenCalledWith('1.2.0');
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      iosInstalls: 2,
      androidInstalls: 3,
      uniqueInstallsThisMonth: 4,
    });
  });

  it('qualifies a legacy installation only after an offered manifest', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    (Pool as unknown as jest.Mock).mockImplementation(() => ({ query }));
    const database = new PostgresDatabase();

    await database.createTracking({
      releaseId: 'release-id',
      platform: 'ios',
      installationId: '576634c0-6482-4c50-8c60-169f7ac9b7b8',
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('SET offered_release = TRUE');
    expect(query.mock.calls[1][0]).toContain(
      'ON CONFLICT (release_id, installation_id) WHERE installation_id IS NOT NULL DO NOTHING'
    );
  });
});
