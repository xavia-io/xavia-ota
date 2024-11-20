import { createMocks } from 'node-mocks-http';

import { UpdateHelper } from '../apiUtils/helpers/UpdateHelper';
import { ZipHelper } from '../apiUtils/helpers/ZipHelper';
import assetsEndpoint from '../pages/api/assets';

jest.mock('../apiUtils/helpers/UpdateHelper');
jest.mock('../apiUtils/helpers/ZipHelper');

describe('Assets API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 400 if asset path is missing', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: {
        platform: 'ios',
        runtimeVersion: '1.0.0',
      },
    });

    await assetsEndpoint(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it('should return 400 if platform is invalid', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: {
        asset: 'test.png',
        platform: 'web',
        runtimeVersion: '1.0.0',
      },
    });

    await assetsEndpoint(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it('should serve asset successfully', async () => {
    const mockMetadata = {
      metadataJson: {
        fileMetadata: {
          ios: {
            assets: [{ path: 'test.png', ext: '.png' }],
            bundle: 'bundle.js',
          },
        },
      },
    };

    (UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync as jest.Mock).mockResolvedValue(
      'path/to/update'
    );
    (UpdateHelper.getMetadataAsync as jest.Mock).mockResolvedValue(mockMetadata);
    (ZipHelper.getZipFromStorage as jest.Mock).mockResolvedValue({});
    (ZipHelper.getFileFromZip as jest.Mock).mockResolvedValue(Buffer.from('test'));

    const { req, res } = createMocks({
      method: 'GET',
      query: {
        asset: 'test.png',
        platform: 'ios',
        runtimeVersion: '1.0.0',
      },
    });

    await assetsEndpoint(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getData()).toMatchSnapshot();
  });
});
