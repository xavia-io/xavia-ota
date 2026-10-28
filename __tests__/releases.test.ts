import { createMocks } from 'node-mocks-http';

import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';
import releasesHandler from '../pages/api/releases';

jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/storage/StorageFactory');

describe('Releases API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-GET requests', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await releasesHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should return releases successfully', async () => {
    const mockStorage = {
      listDirectories: jest.fn().mockResolvedValue(['1.0.0']),
      listFiles: jest.fn().mockResolvedValue([
        {
          name: 'update.zip',
          created_at: '2024-03-20T00:00:00Z',
          metadata: { size: 1000 },
        },
      ]),
    };

    const mockDatabase = {
      listReleases: jest.fn().mockResolvedValue([
        {
          path: 'updates/1.0.0/update.zip',
          runtimeVersion: '1.0.0',
          timestamp: '2024-03-20T00:00:00Z',
          commitHash: 'abc123',
          status: 'active',
        },
      ]),
    };

    (StorageFactory.getStorage as jest.Mock).mockReturnValue(mockStorage);
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await releasesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).releases).toEqual([
      expect.objectContaining({
        path: 'updates/1.0.0/update.zip',
        runtimeVersion: '1.0.0',
        timestamp: '2024-03-20T00:00:00.000Z',
        size: 1000,
        status: 'active',
      }),
    ]);
  });

  it('lists only database releases, not orphaned archives', async () => {
    const mockStorage = {
      listDirectories: jest.fn().mockResolvedValue(['1.1.2', '1.2.0']),
      listFiles: jest.fn().mockImplementation(async (folder: string) =>
        folder === 'updates/1.1.2'
          ? [
              {
                name: '20260801090000.zip',
                created_at: '1970-01-01T00:00:00.000Z',
                metadata: { size: 1 },
              },
            ]
          : [
              {
                name: '20260925113047.zip',
                created_at: '1970-01-01T00:00:00.000Z',
                metadata: { size: 2 },
              },
            ]
      ),
    };
    const mockDatabase = { listReleases: jest.fn().mockResolvedValue([]) };

    (StorageFactory.getStorage as jest.Mock).mockReturnValue(mockStorage);
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const { req, res } = createMocks({ method: 'GET' });
    await releasesHandler(req, res);

    const { releases } = JSON.parse(res._getData());
    expect(releases).toEqual([]);
  });

  it('shows a newly published runtime even when its archive is absent from local storage', async () => {
    (StorageFactory.getStorage as jest.Mock).mockReturnValue({
      listDirectories: jest.fn().mockResolvedValue([]),
    });
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({
      listReleases: jest.fn().mockResolvedValue([
        {
          id: 'release-112',
          path: 'updates/1.1.2/new.zip',
          runtimeVersion: '1.1.2',
          timestamp: '2026-09-26T09:00:00Z',
          updateId: 'update-112',
          status: 'active',
        },
        {
          id: 'release-120',
          path: 'updates/1.2.0/current.zip',
          runtimeVersion: '1.2.0',
          timestamp: '2026-09-25T09:00:00Z',
          updateId: 'update-120',
          status: 'active',
        },
      ]),
    });

    const { req, res } = createMocks({ method: 'GET' });
    await releasesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).releases).toEqual([
      expect.objectContaining({
        runtimeVersion: '1.1.2',
        status: 'active',
        archiveAvailable: false,
      }),
      expect.objectContaining({
        runtimeVersion: '1.2.0',
        status: 'active',
        archiveAvailable: false,
      }),
    ]);
  });

  it('keeps one row for a rolled-back release with its publications attached', async () => {
    const publications = [
      {
        updateId: 'rollback-publication-id',
        publishedAt: '2026-09-27T10:30:00+00:00',
        kind: 'rollback',
        rolledBackFromReleaseId: 'bad-release-id',
        rolledBackFromCommitHash: 'bad1234',
        rolledBackFromRepositoryUrl: 'https://github.com/item7/app',
      },
      {
        updateId: 'good-content-id',
        publishedAt: '2026-09-20T09:00:00+00:00',
        kind: 'publish',
        rolledBackFromReleaseId: null,
        rolledBackFromCommitHash: null,
        rolledBackFromRepositoryUrl: null,
      },
    ];
    (StorageFactory.getStorage as jest.Mock).mockReturnValue({
      listDirectories: jest.fn().mockResolvedValue(['1.0.0']),
      listFiles: jest.fn().mockResolvedValue([
        { name: 'good.zip', metadata: { size: 10 } },
        { name: 'bad.zip', metadata: { size: 20 } },
      ]),
    });
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({
      listReleases: jest.fn().mockResolvedValue([
        {
          id: 'bad-release-id',
          path: 'updates/1.0.0/bad.zip',
          runtimeVersion: '1.0.0',
          timestamp: '2026-09-25T09:00:00Z',
          updateId: 'bad-content-id',
          status: 'inactive',
          publications: [],
        },
        {
          id: 'good-release-id',
          path: 'updates/1.0.0/good.zip',
          runtimeVersion: '1.0.0',
          timestamp: '2026-09-20T09:00:00Z',
          updateId: 'good-content-id',
          status: 'active',
          publications,
        },
      ]),
    });

    const { req, res } = createMocks({ method: 'GET' });
    await releasesHandler(req, res);

    const { releases } = JSON.parse(res._getData());
    expect(releases).toHaveLength(2);
    expect(releases.filter((release: any) => release.path === 'updates/1.0.0/good.zip')).toEqual([
      expect.objectContaining({
        id: 'good-release-id',
        updateId: 'good-content-id',
        status: 'active',
        publications,
      }),
    ]);
    expect(releases[0]).toEqual(
      expect.objectContaining({ id: 'bad-release-id', status: 'inactive', publications: [] })
    );
  });

  it('should handle errors gracefully', async () => {
    const mockStorage = {
      listDirectories: jest.fn().mockRejectedValue(new Error('Storage error')),
    };

    (StorageFactory.getStorage as jest.Mock).mockReturnValue(mockStorage);

    const { req, res } = createMocks({ method: 'GET' });
    await releasesHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });
});
