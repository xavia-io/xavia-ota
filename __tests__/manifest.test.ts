import AdmZip from 'adm-zip';
import { createMocks } from 'node-mocks-http';

import { ConfigHelper } from '../apiUtils/helpers/ConfigHelper';
import { UpdateHelper } from '../apiUtils/helpers/UpdateHelper';
import { ZipHelper } from '../apiUtils/helpers/ZipHelper';
import manifestEndpoint from '../pages/api/manifest';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { DatabaseInterface } from '../apiUtils/database/DatabaseInterface';

jest.mock('../apiUtils/helpers/UpdateHelper');
jest.mock('../apiUtils/helpers/ZipHelper');
jest.mock('../apiUtils/helpers/ConfigHelper');
jest.mock('../apiUtils/database/DatabaseFactory');

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

  it('should handle normal update successfully', async () => {
    const mockDatabase = {
      getReleaseByPath: jest.fn().mockResolvedValue('release'),
      createTracking: jest.fn().mockResolvedValue(undefined),
    } as unknown as DatabaseInterface;

    DatabaseFactory.getDatabase = jest.fn().mockReturnValue(mockDatabase);

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

    jest
      .spyOn(UpdateHelper, 'getLatestUpdateBundlePathForRuntimeVersionAsync')
      .mockResolvedValue('path/to/update');
    jest.spyOn(UpdateHelper, 'getMetadataAsync').mockResolvedValue(mockMetadata);
    jest.spyOn(ConfigHelper, 'getExpoConfigAsync').mockResolvedValue({});
    jest.spyOn(UpdateHelper, 'getAssetMetadataAsync').mockResolvedValue({
      hash: 'hash',
      key: 'key',
      fileExtension: '.ext',
      contentType: 'contentType',
      url: 'url',
    });

    const mockZip = {
      getEntry: jest.fn().mockReturnValue(null),
    };
    jest.spyOn(ZipHelper, 'getZipFromStorage').mockResolvedValue(mockZip as unknown as AdmZip);

    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        'expo-platform': 'ios',
        'expo-runtime-version': '1.0.0',
        'expo-protocol-version': '1',
        'expo-current-update-id': 'different-id',
        'expo-embedded-update-id': 'embedded-id',
      },
    });

    await manifestEndpoint(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getData()).toMatchSnapshot();
  });
});
