import { createMocks } from 'node-mocks-http';

import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';
import { hasAdminSession } from '../apiUtils/helpers/AdminSession';
import { ZipHelper } from '../apiUtils/helpers/ZipHelper';
import { HashHelper } from '../apiUtils/helpers/HashHelper';
import rollbackHandler from '../pages/api/rollback';

jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/storage/StorageFactory');
jest.mock('../apiUtils/helpers/AdminSession');
jest.mock('../apiUtils/helpers/ZipHelper');
jest.mock('../apiUtils/helpers/HashHelper');

const path = 'updates/1.0.0/old.zip';
const current = {
  id: 'current-id',
  path: 'updates/1.0.0/current.zip',
  runtimeVersion: '1.0.0',
  status: 'active',
  updateId: 'current-update',
  servedUpdateId: 'current-served-update',
  commitHash: 'current-commit',
  timestamp: '2026-09-25T12:00:00Z',
};
const target = {
  id: 'target-id',
  path,
  runtimeVersion: '1.0.0',
  status: 'inactive',
  updateId: 'old-update',
  commitHash: 'old-commit',
  timestamp: '2026-09-24T12:00:00Z',
};

describe('Rollback API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (hasAdminSession as jest.Mock).mockReturnValue(true);
    (StorageFactory.getStorage as jest.Mock).mockReturnValue({
      listFiles: jest.fn().mockResolvedValue([{ name: 'old.zip' }]),
    });
  });

  it('rejects unsupported methods and missing fields', async () => {
    const unsupported = createMocks({ method: 'PUT' });
    await rollbackHandler(unsupported.req, unsupported.res);
    expect(unsupported.res._getStatusCode()).toBe(405);
    const missing = createMocks({ method: 'POST', body: {} });
    await rollbackHandler(missing.req, missing.res);
    expect(missing.res._getStatusCode()).toBe(400);
  });

  it('requires an admin session for preview and activation', async () => {
    (hasAdminSession as jest.Mock).mockReturnValue(false);
    for (const method of ['GET', 'POST'] as const) {
      const { req, res } = createMocks({
        method,
        query: { path, runtimeVersion: '1.0.0' },
        body: { path, runtimeVersion: '1.0.0', expectedActiveReleaseId: 'current-id' },
      });
      await rollbackHandler(req, res);
      expect(res._getStatusCode()).toBe(401);
    }
    expect(DatabaseFactory.getDatabase).not.toHaveBeenCalled();
  });

  it('previews the current and target release for the selected runtime', async () => {
    const database = {
      getReleaseByPath: jest.fn().mockResolvedValue(target),
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue(current),
      getReleaseTrackingMetrics: jest.fn().mockResolvedValue([
        { platform: 'ios', count: 3 },
        { platform: 'android', count: 2 },
      ]),
      rollbackToRelease: jest.fn(),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(database);
    const { req, res } = createMocks({ method: 'GET', query: { path, runtimeVersion: '1.0.0' } });
    await rollbackHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      runtimeVersion: '1.0.0',
      current: {
        id: 'current-id',
        commitHash: 'current-commit',
        updateId: 'current-served-update',
        timestamp: current.timestamp,
      },
      target: { commitHash: 'old-commit', updateId: 'old-update', timestamp: target.timestamp },
      estimatedAffectedInstallations: 5,
      archiveAvailable: true,
      blockedReason: null,
    });
    expect(database.getLatestReleaseRecordForRuntimeVersion).toHaveBeenCalledWith('1.0.0');
    expect(database.rollbackToRelease).not.toHaveBeenCalled();
  });

  it('serves the selected release under a new update ID without copying or inserting', async () => {
    const database = {
      getReleaseByPath: jest.fn().mockResolvedValue(target),
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue(current),
      rollbackToRelease: jest
        .fn()
        .mockResolvedValue({ outcome: 'activated', updateId: 'rollback-update' }),
      createRelease: jest.fn(),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(database);
    const { req, res } = createMocks({
      method: 'POST',
      body: { path, runtimeVersion: '1.0.0', expectedActiveReleaseId: 'current-id' },
    });
    await rollbackHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      success: true,
      path,
      updateId: 'rollback-update',
    });
    expect(database.rollbackToRelease).toHaveBeenCalledWith('target-id', 'current-id');
    expect(database.createRelease).not.toHaveBeenCalled();
    expect(StorageFactory.getStorage().copyFile).toBeUndefined();
  });

  it('refuses a target that is already Live', async () => {
    const database = {
      getReleaseByPath: jest.fn().mockResolvedValue({ ...target, status: 'active' }),
      getLatestReleaseRecordForRuntimeVersion: jest.fn(),
      rollbackToRelease: jest.fn(),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(database);
    const { req, res } = createMocks({
      method: 'POST',
      body: { path, runtimeVersion: '1.0.0', expectedActiveReleaseId: 'current-id' },
    });
    await rollbackHandler(req, res);
    expect(res._getStatusCode()).toBe(409);
    expect(database.rollbackToRelease).not.toHaveBeenCalled();
  });

  it('reports a concurrent publish instead of overwriting it', async () => {
    const database = {
      getReleaseByPath: jest.fn().mockResolvedValue(target),
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue(current),
      rollbackToRelease: jest.fn().mockResolvedValue({ outcome: 'active_changed' }),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(database);
    const { req, res } = createMocks({
      method: 'POST',
      body: { path, runtimeVersion: '1.0.0', expectedActiveReleaseId: 'stale-id' },
    });
    await rollbackHandler(req, res);
    expect(res._getStatusCode()).toBe(409);
    expect(JSON.parse(res._getData()).error).toMatch(/Active release changed/);
  });

  it('blocks a target with the same update ID as the active release', async () => {
    const database = {
      getReleaseByPath: jest.fn().mockResolvedValue({ ...target, updateId: current.updateId }),
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue(current),
      rollbackToRelease: jest.fn(),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(database);
    const { req, res } = createMocks({
      method: 'POST',
      body: { path, runtimeVersion: '1.0.0', expectedActiveReleaseId: 'current-id' },
    });
    await rollbackHandler(req, res);
    expect(res._getStatusCode()).toBe(409);
    expect(database.rollbackToRelease).not.toHaveBeenCalled();
  });

  it('blocks a missing archive', async () => {
    (StorageFactory.getStorage as jest.Mock).mockReturnValue({
      listFiles: jest.fn().mockResolvedValue([]),
    });
    const database = {
      getReleaseByPath: jest.fn().mockResolvedValue(target),
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue(current),
      rollbackToRelease: jest.fn(),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(database);
    const { req, res } = createMocks({
      method: 'POST',
      body: { path, runtimeVersion: '1.0.0', expectedActiveReleaseId: 'current-id' },
    });
    await rollbackHandler(req, res);
    expect(res._getStatusCode()).toBe(409);
    expect(database.rollbackToRelease).not.toHaveBeenCalled();
  });

  it('backfills a legacy target update ID before activation', async () => {
    const database = {
      getReleaseByPath: jest.fn().mockResolvedValue({ ...target, updateId: null }),
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue(current),
      setReleaseUpdateId: jest.fn(),
      rollbackToRelease: jest
        .fn()
        .mockResolvedValue({ outcome: 'activated', updateId: 'rollback-update' }),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(database);
    (ZipHelper.getZipFromStorage as jest.Mock).mockResolvedValue({});
    (ZipHelper.getFileFromZip as jest.Mock).mockResolvedValue(Buffer.from('metadata'));
    (HashHelper.createHash as jest.Mock).mockReturnValue('hash');
    (HashHelper.convertSHA256HashToUUID as jest.Mock).mockReturnValue('restored-id');
    const { req, res } = createMocks({
      method: 'POST',
      body: { path, runtimeVersion: '1.0.0', expectedActiveReleaseId: 'current-id' },
    });
    await rollbackHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(database.setReleaseUpdateId).toHaveBeenCalledWith('target-id', 'restored-id');
  });
});
