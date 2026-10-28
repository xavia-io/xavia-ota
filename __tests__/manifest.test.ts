import AdmZip from 'adm-zip';
import { createMocks } from 'node-mocks-http';
import FormData from 'form-data';

import { UpdateHelper, NoUpdateAvailableError } from '../apiUtils/helpers/UpdateHelper';
import { ZipHelper } from '../apiUtils/helpers/ZipHelper';
import { HashHelper } from '../apiUtils/helpers/HashHelper';
import { PreparedRelease, ReleaseAssetCache } from '../apiUtils/helpers/ReleaseAssetCache';
import manifestEndpoint from '../pages/api/manifest';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { DatabaseInterface, Release } from '../apiUtils/database/DatabaseInterface';

jest.mock('../apiUtils/helpers/UpdateHelper');
jest.mock('../apiUtils/helpers/ZipHelper');
jest.mock('../apiUtils/helpers/ConfigHelper');
jest.mock('../apiUtils/helpers/HashHelper');
jest.mock('../apiUtils/helpers/ReleaseAssetCache');
jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('form-data');

function preparedAsset(path: string, key: string, ext: string | null) {
  return {
    path,
    hash: `${key}-hash`,
    key,
    fileExtension: `.${ext ?? 'bundle'}`,
    contentType: ext === null ? 'application/javascript' : 'image/png',
    size: 4,
    gzipSize: null,
  };
}

function preparedRelease(): PreparedRelease {
  return {
    isRollback: false,
    expoConfig: { name: 'item7go' },
    platforms: {
      ios: {
        launchAsset: preparedAsset('bundle.js', 'bundle-key', null),
        assets: [preparedAsset('assets/image', 'key', 'png')],
      },
    },
  };
}

describe('Manifest API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-GET requests', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await manifestEndpoint(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should return 400 for invalid platform', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'web',
        'expo-runtime-version': '1.0.0',
      },
    });
    await manifestEndpoint(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should return 400 for missing runtime version', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'ios',
      },
    });
    await manifestEndpoint(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should return NoUpdateAvailable when user is already running the latest release', async () => {
    // Mock database to return a release with matching updateId
    const mockRelease: Release = {
      id: 'release-id',
      runtimeVersion: '1.0.0',
      path: 'path/to/update.zip',
      timestamp: '2024-03-20T00:00:00Z',
      commitHash: 'abc123',
      commitMessage: 'Test commit',
      updateId: 'test-update-id',
    };

    const mockDatabase = {
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue(mockRelease),
      createTracking: jest.fn(),
      recordManifestRequest: jest.fn(),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    // Mock NoUpdateAvailable directive
    const mockNoUpdateDirective = { type: 'noUpdateAvailable' };
    (UpdateHelper.createNoUpdateAvailableDirectiveAsync as jest.Mock).mockResolvedValue(
      mockNoUpdateDirective
    );

    // Mock FormData
    const mockFormData = {
      append: jest.fn(),
      getBoundary: jest.fn().mockReturnValue('boundary'),
      getBuffer: jest.fn().mockReturnValue(Buffer.from('mock-form-data')),
    };
    (FormData as unknown as jest.Mock).mockImplementation(() => mockFormData);

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '1.0.0',
        'expo-protocol-version': '1',
        'expo-current-update-id': 'test-update-id', // Same as the release updateId
      },
    });

    await manifestEndpoint(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(UpdateHelper.createNoUpdateAvailableDirectiveAsync).toHaveBeenCalled();
    expect(mockFormData.append).toHaveBeenCalledWith(
      'directive',
      JSON.stringify(mockNoUpdateDirective),
      expect.any(Object)
    );
    expect(res.getHeader('expo-server-defined-headers')).toMatch(/x-installation-id="[0-9a-f-]+"/);
    expect(mockDatabase.createTracking).not.toHaveBeenCalled();

    const installationId = String(res.getHeader('expo-server-defined-headers')).match(
      /"([0-9a-f-]+)"/
    )![1];
    const second = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '1.0.0',
        'expo-protocol-version': '1',
        'expo-current-update-id': 'test-update-id',
        'x-installation-id': installationId,
      },
    });
    await manifestEndpoint(second.req, second.res);
    expect(second.res.getHeader('expo-server-defined-headers')).toBe(
      `x-installation-id="${installationId}"`
    );
    expect(mockDatabase.createTracking).not.toHaveBeenCalled();
    expect(mockDatabase.recordManifestRequest).toHaveBeenCalledTimes(2);
    expect(mockDatabase.recordManifestRequest).toHaveBeenCalledWith('release-id', 'ios');
  });

  describe('failed launches', () => {
    const installationId = '576634c0-6482-4c50-8c60-169f7ac9b7b8';
    let mockDatabase: Record<string, jest.Mock>;

    beforeEach(() => {
      mockDatabase = {
        getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue(null),
        recordFailedLaunches: jest.fn(),
      };
      (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);
      (UpdateHelper.createNoUpdateAvailableDirectiveAsync as jest.Mock).mockResolvedValue({
        type: 'noUpdateAvailable',
      });
      (FormData as unknown as jest.Mock).mockImplementation(() => ({
        append: jest.fn(),
        getBoundary: jest.fn().mockReturnValue('boundary'),
        getBuffer: jest.fn().mockReturnValue(Buffer.from('mock-form-data')),
      }));
    });

    function request(headers: Record<string, string>) {
      return createMocks({
        method: 'GET',
        headers: {
          'expo-platform': 'android',
          'expo-runtime-version': '1.2.1',
          'expo-protocol-version': '1',
          ...headers,
        },
      });
    }

    it('records updates the phone reports as failed to launch', async () => {
      const { req, res } = request({
        'x-installation-id': installationId,
        'expo-recent-failed-update-ids':
          '"1946C03E-45AB-ED25-6D68-AB125ACDC059", "not-an-id", "4cdc655c-45ab-ed25-6d68-ab125acdc059"',
      });

      await manifestEndpoint(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockDatabase.recordFailedLaunches).toHaveBeenCalledWith(
        '1.2.1',
        'android',
        installationId,
        ['1946c03e-45ab-ed25-6d68-ab125acdc059', '4cdc655c-45ab-ed25-6d68-ab125acdc059']
      );
    });

    it('ignores the header without a confirmed installation or when it cannot be parsed', async () => {
      const unconfirmed = request({
        'expo-recent-failed-update-ids': '"1946c03e-45ab-ed25-6d68-ab125acdc059"',
      });
      await manifestEndpoint(unconfirmed.req, unconfirmed.res);

      const malformed = request({
        'x-installation-id': installationId,
        'expo-recent-failed-update-ids': '("unterminated',
      });
      await manifestEndpoint(malformed.req, malformed.res);

      expect(unconfirmed.res._getStatusCode()).toBe(200);
      expect(malformed.res._getStatusCode()).toBe(200);
      expect(mockDatabase.recordFailedLaunches).not.toHaveBeenCalled();
    });

    it('still answers the phone when recording fails', async () => {
      mockDatabase.recordFailedLaunches.mockRejectedValue(new Error('database down'));
      const { req, res } = request({
        'x-installation-id': installationId,
        'expo-recent-failed-update-ids': '"1946c03e-45ab-ed25-6d68-ab125acdc059"',
      });

      await manifestEndpoint(req, res);

      expect(res._getStatusCode()).toBe(200);
    });
  });

  it('should look for an update when the request and release have no update ID', async () => {
    const mockDatabase = {
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue({
        id: 'release-id',
        runtimeVersion: '1.2.0',
        path: 'updates/1.2.0/update.zip',
        timestamp: '2026-09-24T18:06:32Z',
        commitHash: 'abc123',
      }),
      setReleaseUpdateId: jest.fn(),
    };
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);
    (UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync as jest.Mock).mockResolvedValue(
      'updates/1.2.0/update'
    );
    (ZipHelper.getZipFromStorage as jest.Mock).mockResolvedValue({
      getEntry: jest.fn().mockReturnValue(null),
    });
    (UpdateHelper.getMetadataAsync as jest.Mock).mockResolvedValue({ id: 'metadata-hash' });
    (HashHelper.convertSHA256HashToUUID as jest.Mock).mockReturnValue('backfilled-id');
    (UpdateHelper.createNoUpdateAvailableDirectiveAsync as jest.Mock).mockResolvedValue({
      type: 'noUpdateAvailable',
    });
    (FormData as unknown as jest.Mock).mockImplementation(() => ({
      append: jest.fn(),
      getBoundary: () => 'boundary',
      getBuffer: () => Buffer.from('data'),
    }));

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'android',
        'expo-runtime-version': '1.2.0',
        'expo-protocol-version': '1',
        'expo-current-update-id': 'backfilled-id',
      },
    });

    await manifestEndpoint(req, res);

    expect(mockDatabase.setReleaseUpdateId).toHaveBeenCalledWith('release-id', 'backfilled-id');
    expect(UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync).not.toHaveBeenCalled();
  });

  it('should handle normal update successfully', async () => {
    // Mock database to return a release with different updateId
    const mockRelease: Release = {
      id: 'release-id',
      runtimeVersion: '1.0.0',
      path: 'path/to/update.zip',
      timestamp: '2024-03-20T00:00:00Z',
      commitHash: 'abc123',
      commitMessage: 'Test commit',
      updateId: 'different-update-id',
    };

    const mockDatabase = {
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue(mockRelease),
      getReleaseByPath: jest.fn().mockResolvedValue(mockRelease),
      createTracking: jest.fn().mockResolvedValue(undefined),
      recordManifestRequest: jest.fn(),
    };

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    const mockMetadata = {
      metadataJson: {
        fileMetadata: {
          ios: {
            assets: [{ path: 'test.png', ext: '.png' }],
            bundle: 'bundle.js',
          },
        },
      },
      createdAt: '2024-03-20T00:00:00Z',
      id: 'test-id',
    };

    // Mock UUID conversion
    const mockUUID = 'test-uuid';
    (HashHelper.convertSHA256HashToUUID as jest.Mock).mockReturnValue(mockUUID);

    // Mock UpdateHelper methods
    (UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync as jest.Mock).mockResolvedValue(
      'path/to/update'
    );
    (UpdateHelper.getMetadataAsync as jest.Mock).mockResolvedValue(mockMetadata);
    (ReleaseAssetCache.getPreparedRelease as jest.Mock).mockResolvedValue(preparedRelease());

    // Mock FormData
    const mockFormData = {
      append: jest.fn(),
      getBoundary: jest.fn().mockReturnValue('boundary'),
      getBuffer: jest.fn().mockReturnValue(Buffer.from('mock-form-data')),
    };
    (FormData as unknown as jest.Mock).mockImplementation(() => mockFormData);

    const first = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '1.0.0',
        'expo-protocol-version': '1',
        'expo-current-update-id': 'current-update-id',
      },
    });
    await manifestEndpoint(first.req, first.res);
    const assignedId = String(first.res.getHeader('expo-server-defined-headers')).match(
      /"([0-9a-f-]+)"/
    )![1];
    expect(mockDatabase.createTracking).not.toHaveBeenCalled();

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '1.0.0',
        'expo-protocol-version': '1',
        'expo-current-update-id': 'current-update-id', // Different from the release updateId
        'x-installation-id': assignedId,
      },
    });

    await manifestEndpoint(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockDatabase.createTracking).toHaveBeenCalledWith({
      platform: 'ios',
      releaseId: 'release-id',
      installationId: assignedId,
    });
    expect(mockDatabase.recordManifestRequest).toHaveBeenCalledWith('release-id', 'ios');
    expect(mockFormData.append).toHaveBeenCalledWith(
      'manifest',
      expect.any(String),
      expect.any(Object)
    );
    expect(mockFormData.append).toHaveBeenCalledWith(
      'extensions',
      expect.stringContaining('x-installation-id'),
      expect.any(Object)
    );
    const extensions = JSON.parse(
      mockFormData.append.mock.calls.find(([name]) => name === 'extensions')![1]
    );
    expect(extensions.assetRequestHeaders.key['x-installation-id']).toBe(assignedId);
    expect(ZipHelper.getZipFromStorage).not.toHaveBeenCalled();

    const manifest = JSON.parse(
      mockFormData.append.mock.calls.find(([name]) => name === 'manifest')![1]
    );
    expect(manifest.launchAsset).toEqual({
      hash: 'bundle-key-hash',
      key: 'bundle-key',
      fileExtension: '.bundle',
      contentType: 'application/javascript',
      url: `${process.env.HOST}/api/assets?asset=bundle.js&runtimeVersion=1.0.0&updateId=different-update-id&platform=ios`,
    });
    expect(manifest.assets).toEqual([
      {
        hash: 'key-hash',
        key: 'key',
        fileExtension: '.png',
        contentType: 'image/png',
        url: `${process.env.HOST}/api/assets?asset=assets%2Fimage&runtimeVersion=1.0.0&updateId=different-update-id&platform=ios`,
      },
    ]);
    expect(manifest.extra).toEqual({ expoClient: { name: 'item7go' } });
  });

  it('returns 404 when the update has no bundle for the platform', async () => {
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue({
        id: 'release-id',
        path: 'updates/1.0.0/update.zip',
        updateId: 'update-id',
      }),
      recordManifestRequest: jest.fn(),
    });
    (ReleaseAssetCache.getPreparedRelease as jest.Mock).mockResolvedValue(preparedRelease());
    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'android',
        'expo-runtime-version': '1.0.0',
        'expo-protocol-version': '1',
      },
    });

    await manifestEndpoint(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  describe('a rolled-back release', () => {
    const rolledBack: Release = {
      id: 'target-release-id',
      runtimeVersion: '1.0.0',
      path: 'updates/1.0.0/target.zip',
      timestamp: '2026-09-20T09:00:00Z',
      commitHash: 'good123',
      commitMessage: 'Known good',
      updateId: 'target-content-id',
      servedUpdateId: 'rollback-publication-id',
      servedAt: '2026-09-27T10:30:00.000Z',
      status: 'active',
    };

    function setUp() {
      const mockDatabase = {
        getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue(rolledBack),
        createTracking: jest.fn(),
        recordManifestRequest: jest.fn(),
        setReleaseUpdateId: jest.fn(),
      };
      (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);
      (ReleaseAssetCache.getPreparedRelease as jest.Mock).mockResolvedValue(preparedRelease());
      (UpdateHelper.createNoUpdateAvailableDirectiveAsync as jest.Mock).mockResolvedValue({
        type: 'noUpdateAvailable',
      });
      const mockFormData = {
        append: jest.fn(),
        getBoundary: jest.fn().mockReturnValue('boundary'),
        getBuffer: jest.fn().mockReturnValue(Buffer.from('mock-form-data')),
      };
      (FormData as unknown as jest.Mock).mockImplementation(() => mockFormData);
      return { mockDatabase, mockFormData };
    }

    function request(currentUpdateId: string) {
      return createMocks({
        method: 'GET',
        headers: {
          'expo-platform': 'ios',
          'expo-runtime-version': '1.0.0',
          'expo-protocol-version': '1',
          'expo-current-update-id': currentUpdateId,
        },
      });
    }

    it('is offered to a phone on the bad release under the new ID and rollback time', async () => {
      const { mockDatabase, mockFormData } = setUp();
      const { req, res } = request('bad-release-id');

      await manifestEndpoint(req, res);

      expect(res._getStatusCode()).toBe(200);
      const manifest = JSON.parse(
        mockFormData.append.mock.calls.find(([name]) => name === 'manifest')![1]
      );
      expect(manifest.id).toBe('rollback-publication-id');
      expect(manifest.createdAt).toBe('2026-09-27T10:30:00.000Z');
      expect(manifest.launchAsset.url).toContain('updateId=rollback-publication-id');
      expect(ReleaseAssetCache.getPreparedRelease).toHaveBeenCalledWith(rolledBack);
      expect(mockDatabase.recordManifestRequest).toHaveBeenCalledWith('target-release-id', 'ios');
      expect(mockDatabase.setReleaseUpdateId).not.toHaveBeenCalled();
    });

    it('is still offered to a phone running the same bundle under its original ID', async () => {
      const { mockFormData } = setUp();
      const { req, res } = request('target-content-id');

      await manifestEndpoint(req, res);

      const manifest = JSON.parse(
        mockFormData.append.mock.calls.find(([name]) => name === 'manifest')![1]
      );
      expect(manifest.id).toBe('rollback-publication-id');
    });

    it('is not offered again once the phone has the rollback publication', async () => {
      const { mockFormData } = setUp();
      const { req, res } = request('rollback-publication-id');

      await manifestEndpoint(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockFormData.append).toHaveBeenCalledWith(
        'directive',
        JSON.stringify({ type: 'noUpdateAvailable' }),
        expect.any(Object)
      );
      expect(mockFormData.append).not.toHaveBeenCalledWith(
        'manifest',
        expect.anything(),
        expect.anything()
      );
    });
  });

  it('should handle rollback update successfully', async () => {
    // Mock database
    const mockDatabase = {
      getLatestReleaseRecordForRuntimeVersion: jest
        .fn()
        .mockResolvedValue({ path: 'path/to/update.zip', updateId: 'rollback-id' }),
    } as unknown as DatabaseInterface;

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    // Mock UpdateHelper methods
    (UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync as jest.Mock).mockResolvedValue(
      'path/to/update'
    );
    (UpdateHelper.createRollBackDirectiveAsync as jest.Mock).mockResolvedValue({
      type: 'rollBackToEmbedded',
      parameters: {
        commitTime: '2024-03-20T00:00:00Z',
      },
    });

    (ReleaseAssetCache.getPreparedRelease as jest.Mock).mockResolvedValue({
      isRollback: true,
      expoConfig: null,
      platforms: {},
    });

    // Mock FormData
    const mockFormData = {
      append: jest.fn(),
      getBoundary: jest.fn().mockReturnValue('boundary'),
      getBuffer: jest.fn().mockReturnValue(Buffer.from('mock-form-data')),
    };
    (FormData as unknown as jest.Mock).mockImplementation(() => mockFormData);

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '1.0.0',
        'expo-protocol-version': '1',
        'expo-current-update-id': 'current-id',
        'expo-embedded-update-id': 'embedded-id',
      },
    });

    await manifestEndpoint(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(UpdateHelper.createRollBackDirectiveAsync).toHaveBeenCalled();
    expect(mockFormData.append).toHaveBeenCalledWith(
      'directive',
      expect.any(String),
      expect.any(Object)
    );
  });

  it('should return NoUpdateAvailable when current update matches latest', async () => {
    // Mock database
    const mockDatabase = {
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue(null),
    } as unknown as DatabaseInterface;

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    // Mock UpdateHelper methods
    (UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync as jest.Mock).mockResolvedValue(
      'path/to/update'
    );

    const mockMetadata = {
      metadataJson: { fileMetadata: { ios: {} } },
      createdAt: '2024-03-20T00:00:00Z',
      id: 'test-id',
    };
    (UpdateHelper.getMetadataAsync as jest.Mock).mockResolvedValue(mockMetadata);

    // Mock UUID conversion to match current update ID
    (HashHelper.convertSHA256HashToUUID as jest.Mock).mockReturnValue('current-update-id');

    // Mock NoUpdateAvailable directive
    const mockNoUpdateDirective = { type: 'noUpdateAvailable' };
    (UpdateHelper.createNoUpdateAvailableDirectiveAsync as jest.Mock).mockResolvedValue(
      mockNoUpdateDirective
    );

    // Mock ZipHelper
    const mockZip = {
      getEntry: jest.fn().mockReturnValue(null), // Not a rollback
    };
    (ZipHelper.getZipFromStorage as jest.Mock).mockResolvedValue(mockZip as unknown as AdmZip);

    // Mock FormData
    const mockFormData = {
      append: jest.fn(),
      getBoundary: jest.fn().mockReturnValue('boundary'),
      getBuffer: jest.fn().mockReturnValue(Buffer.from('mock-form-data')),
    };
    (FormData as unknown as jest.Mock).mockImplementation(() => mockFormData);

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '1.0.0',
        'expo-protocol-version': '1',
        'expo-current-update-id': 'current-update-id', // Will match the converted hash
      },
    });

    await manifestEndpoint(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(UpdateHelper.createNoUpdateAvailableDirectiveAsync).toHaveBeenCalled();
  });

  it('should handle NoUpdateAvailable error from UpdateHelper', async () => {
    // Mock database
    const mockDatabase = {
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue(null),
    } as unknown as DatabaseInterface;

    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(mockDatabase);

    // Mock UpdateHelper to throw NoUpdateAvailableError
    (UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync as jest.Mock).mockRejectedValue(
      new NoUpdateAvailableError()
    );

    // Mock NoUpdateAvailable directive
    const mockNoUpdateDirective = { type: 'noUpdateAvailable' };
    (UpdateHelper.createNoUpdateAvailableDirectiveAsync as jest.Mock).mockResolvedValue(
      mockNoUpdateDirective
    );

    // Mock FormData
    const mockFormData = {
      append: jest.fn(),
      getBoundary: jest.fn().mockReturnValue('boundary'),
      getBuffer: jest.fn().mockReturnValue(Buffer.from('mock-form-data')),
    };
    (FormData as unknown as jest.Mock).mockImplementation(() => mockFormData);

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '1.0.0',
        'expo-protocol-version': '1',
      },
    });

    await manifestEndpoint(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(UpdateHelper.createNoUpdateAvailableDirectiveAsync).toHaveBeenCalled();
  });
});
