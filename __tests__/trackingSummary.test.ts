import { createMocks } from 'node-mocks-http';
import { Pool } from 'pg';

import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { PostgresDatabase } from '../apiUtils/database/LocalDatabase';
import trackingSummaryHandler from '../pages/api/tracking/summary';

jest.mock('pg');
jest.mock('../apiUtils/database/DatabaseFactory');

describe('tracking summary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('groups server events by release and platform with distinct confirmed installations', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          releaseId: 'release-id',
          runtimeVersion: '1.1.2',
          updateId: 'update-id',
          platform: 'ios',
          uniqueInstallations: '2',
          manifestRequests: '5',
          downloadAttempts: '3',
          assetRequests: '4',
          bytesTransferred: '1200',
          failedLaunches: '1',
        },
      ],
    });
    (Pool as unknown as jest.Mock).mockImplementation(() => ({ query }));

    const rows = await new PostgresDatabase().getReleaseMetricsHierarchy();

    expect(rows[0]).toEqual(
      expect.objectContaining({
        uniqueInstallations: 2,
        manifestRequests: 5,
        downloadAttempts: 3,
        assetRequests: 4,
        bytesTransferred: 1200,
        failedLaunches: 1,
      })
    );
    expect(query.mock.calls[0][0]).toContain('release_failed_launches');
    expect(query.mock.calls[0][0]).toContain('COUNT(DISTINCT installation_id)');
    expect(query.mock.calls[0][0]).toContain('offered_release = TRUE');
    expect(query.mock.calls[0][0]).toContain('r.runtime_version AS "runtimeVersion"');
  });

  it('returns distinct installation totals by platform', async () => {
    const database = {
      getGlobalInstallationSummary: jest.fn().mockResolvedValue({
        uniqueInstallations: 3,
        iosInstallations: 2,
        androidInstallations: 1,
      }),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(database);
    const { req, res } = createMocks({ method: 'GET' });

    await trackingSummaryHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      uniqueInstallations: 3,
      iosInstallations: 2,
      androidInstallations: 1,
    });
  });

  it('counts each offered installation once per platform across releases', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ uniqueInstallations: '3', iosInstallations: '2', androidInstallations: '1' }],
    });
    (Pool as unknown as jest.Mock).mockImplementation(() => ({ query }));

    expect(await new PostgresDatabase().getGlobalInstallationSummary()).toEqual({
      uniqueInstallations: 3,
      iosInstallations: 2,
      androidInstallations: 1,
    });
    expect(query.mock.calls[0][0]).toContain('COUNT(DISTINCT installation_id)');
    expect(query.mock.calls[0][0]).toContain("platform = 'ios'");
    expect(query.mock.calls[0][0]).toContain("platform = 'android'");
    expect(query.mock.calls[0][0]).toContain('offered_release = TRUE');
  });

  it('separates manifest offers from asset transfer counters', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    (Pool as unknown as jest.Mock).mockImplementation(() => ({ query }));
    const database = new PostgresDatabase();

    await database.recordManifestRequest('release-id', 'android');
    await database.recordAssetRequest(
      'release-id',
      'android',
      2048,
      '576634c0-6482-4c50-8c60-169f7ac9b7b8'
    );

    expect(query.mock.calls[0][1]).toEqual(['release-id', 'android']);
    expect(query.mock.calls[1][1]).toEqual([
      'release-id',
      'android',
      2048,
      '576634c0-6482-4c50-8c60-169f7ac9b7b8',
    ]);
    expect(query.mock.calls[1][0]).toContain('release_download_attempts');
    expect(query.mock.calls[1][0]).toContain('bytes_transferred');
  });

  it('records failed launches against the release or publication with that update ID', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    (Pool as unknown as jest.Mock).mockImplementation(() => ({ query }));

    await new PostgresDatabase().recordFailedLaunches(
      '1.2.1',
      'ios',
      '576634c0-6482-4c50-8c60-169f7ac9b7b8',
      ['1946c03e-45ab-ed25-6d68-ab125acdc059']
    );

    expect(query.mock.calls[0][0]).toContain('INSERT INTO release_failed_launches');
    expect(query.mock.calls[0][0]).toContain('release_publications');
    expect(query.mock.calls[0][0]).toContain(
      'ON CONFLICT (release_id, installation_id) DO NOTHING'
    );
    expect(query.mock.calls[0][1]).toEqual([
      '1.2.1',
      'ios',
      '576634c0-6482-4c50-8c60-169f7ac9b7b8',
      ['1946c03e-45ab-ed25-6d68-ab125acdc059'],
    ]);
  });
});
