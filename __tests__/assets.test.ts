import AdmZip from 'adm-zip';
import fs from 'fs';
import http from 'http';
import { AddressInfo } from 'net';
import { createMocks } from 'node-mocks-http';
import os from 'os';
import path from 'path';
import zlib from 'zlib';

import { BundlePatchCache } from '../apiUtils/helpers/BundlePatchCache';
import { ReleaseAssetCache } from '../apiUtils/helpers/ReleaseAssetCache';
import assetsEndpoint from '../pages/api/assets';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';

jest.mock('../apiUtils/helpers/BundlePatchCache');
jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/storage/StorageFactory');

const bundle = Buffer.from('console.log("hello");\n'.repeat(2000));
const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function buildReleaseZip(): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    'metadata.json',
    Buffer.from(
      JSON.stringify({
        fileMetadata: {
          ios: { bundle: 'bundles/ios.hbc', assets: [{ path: 'assets/image', ext: 'png' }] },
        },
      })
    )
  );
  zip.addFile('expoconfig.json', Buffer.from('{}'));
  zip.addFile('bundles/ios.hbc', bundle);
  zip.addFile('assets/image', image);
  return zip.toBuffer();
}

type Response = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

describe('Assets API', () => {
  let cacheDir: string;
  let server: http.Server;
  let baseUrl: string;
  let getReleaseByUpdateId: jest.Mock;
  let recordAssetRequest: jest.Mock;
  let downloadFile: jest.Mock;
  // The handler records metrics after the body is sent, so requests also wait for it to finish.
  const handlers = new Set<Promise<void>>();

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      // Stand in for the helpers Next adds to API routes.
      const apiRes = Object.assign(res, {
        status: (code: number) => Object.assign(res, { statusCode: code }) && apiRes,
        json: (body: unknown) => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        },
      });
      (req as any).query = Object.fromEntries(new URL(req.url!, 'http://localhost').searchParams);
      handlers.add(assetsEndpoint(req as any, apiRes as any));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (BundlePatchCache.getPatch as jest.Mock).mockResolvedValue(null);
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-test-'));
    process.env.ASSET_CACHE_DIR = cacheDir;
    ReleaseAssetCache.clearMemory();

    getReleaseByUpdateId = jest.fn().mockResolvedValue({
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      path: 'updates/1.0.0/original.zip',
      updateId: 'original-content-id',
      status: 'inactive',
    });
    recordAssetRequest = jest.fn();
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({
      getReleaseByUpdateId,
      recordAssetRequest,
    });
    downloadFile = jest.fn().mockResolvedValue(buildReleaseZip());
    (StorageFactory.getStorage as jest.Mock).mockReturnValue({ downloadFile });
  });

  afterEach(() => {
    delete process.env.ASSET_CACHE_DIR;
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  function get(asset: string, headers: http.OutgoingHttpHeaders = {}): Promise<Response> {
    const query = new URLSearchParams({
      asset,
      platform: 'ios',
      runtimeVersion: '1.0.0',
      updateId: 'rollback-publication-id',
    });
    return new Promise((resolve, reject) => {
      http
        .get(`${baseUrl}/api/assets?${query}`, { headers }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', async () => {
            await Promise.all(handlers);
            resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) });
          });
        })
        .on('error', reject);
    });
  }

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

  it('serves a gzip copy of the bundle to phones that accept it', async () => {
    const res = await get('bundles/ios.hbc', {
      'accept-encoding': 'gzip',
      'x-installation-id': '576634C0-6482-4C50-8C60-169F7AC9B7B8',
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/javascript');
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['vary']).toBe(
      'Accept-Encoding, A-IM, Expo-Current-Update-ID, Expo-Requested-Update-ID'
    );
    expect(Number(res.headers['content-length'])).toBe(res.body.length);
    expect(res.body.length).toBeLessThan(bundle.length);
    expect(zlib.gunzipSync(res.body)).toEqual(bundle);
    // The rollback publication ID resolves to the parent release, whose zip is served.
    expect(getReleaseByUpdateId).toHaveBeenCalledWith('1.0.0', 'rollback-publication-id');
    expect(downloadFile).toHaveBeenCalledWith('updates/1.0.0/original.zip');
    expect(recordAssetRequest).toHaveBeenCalledWith(
      'a1b2c3d4-0000-4000-8000-000000000001',
      'ios',
      res.body.length,
      '576634c0-6482-4c50-8c60-169f7ac9b7b8'
    );
  });

  it('serves the plain file to phones that do not accept gzip', async () => {
    const res = await get('bundles/ios.hbc', { 'accept-encoding': 'gzip;q=0, identity' });

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body).toEqual(bundle);
    expect(recordAssetRequest).toHaveBeenCalledWith(
      'a1b2c3d4-0000-4000-8000-000000000001',
      'ios',
      bundle.length,
      null
    );
  });

  it('serves an asset that does not compress as is', async () => {
    const res = await get('assets/image', { 'accept-encoding': 'gzip' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers['vary']).toBeUndefined();
    expect(res.body).toEqual(image);
  });

  it('serves negotiated patches with Expo headers and counts patch bytes', async () => {
    const patch = Buffer.from('BSDIFF40-example');
    (BundlePatchCache.getPatch as jest.Mock).mockResolvedValue(patch);
    const res = await get('bundles/ios.hbc', {
      'a-im': 'bsdiff',
      'expo-current-update-id': '01234567-0123-0123-0123-0123456789ab',
      'expo-requested-update-id': 'rollback-publication-id',
      'accept-encoding': 'gzip',
    });
    expect(res.status).toBe(226);
    expect(res.headers.im).toBe('bsdiff');
    expect(res.headers['expo-base-update-id']).toBe('01234567-0123-0123-0123-0123456789ab');
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual(patch);
    expect(recordAssetRequest).toHaveBeenCalledWith(expect.any(String), 'ios', patch.length, null);
    expect(BundlePatchCache.getPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        fullDownloadSize: expect.any(Number),
        platform: 'ios',
        runtimeVersion: '1.0.0',
      })
    );
  });

  it.each([
    { 'a-im': 'bsdiff' },
    { 'expo-current-update-id': 'base' },
    { 'a-im': 'bsdiff', 'expo-current-update-id': 'base', 'expo-requested-update-id': 'wrong' },
  ])('serves full bundles without valid negotiation: %j', async (headers) => {
    const res = await get('bundles/ios.hbc', headers);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(bundle);
    expect(BundlePatchCache.getPatch).not.toHaveBeenCalled();
  });

  it('does not patch image assets even if requested', async () => {
    const res = await get('assets/image', { 'a-im': 'bsdiff', 'expo-current-update-id': 'base' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(BundlePatchCache.getPatch).not.toHaveBeenCalled();
  });

  it('unpacks the release zip once across asset requests', async () => {
    await Promise.all([get('bundles/ios.hbc'), get('assets/image'), get('bundles/ios.hbc')]);
    await get('assets/image');

    expect(downloadFile).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for a file the update does not list', async () => {
    const res = await get('expoconfig.json');

    expect(res.status).toBe(404);
    expect(recordAssetRequest).not.toHaveBeenCalled();
  });

  it('rejects an update ID without a matching release', async () => {
    getReleaseByUpdateId.mockResolvedValue(null);

    const res = await get('bundles/ios.hbc');

    expect(res.status).toBe(404);
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('rejects a release that is not live or past', async () => {
    getReleaseByUpdateId.mockResolvedValue({
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      path: 'updates/1.0.0/original.zip',
      status: 'uploading',
    });

    const res = await get('bundles/ios.hbc');

    expect(res.status).toBe(404);
    expect(downloadFile).not.toHaveBeenCalled();
  });
});
