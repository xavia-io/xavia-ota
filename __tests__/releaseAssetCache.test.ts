import AdmZip from 'adm-zip';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { ReleaseAssetCache } from '../apiUtils/helpers/ReleaseAssetCache';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';

jest.mock('../apiUtils/storage/StorageFactory');

const bundle = Buffer.from('console.log("hello");\n'.repeat(2000));
const font = crypto.randomBytes(4096);

function buildReleaseZip(): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    'metadata.json',
    Buffer.from(
      JSON.stringify({
        version: 0,
        bundler: 'metro',
        fileMetadata: {
          ios: { bundle: 'bundles/ios.hbc', assets: [{ path: 'assets/font', ext: 'ttf' }] },
          android: {
            bundle: 'bundles/android.hbc',
            assets: [{ path: 'assets/font', ext: 'ttf' }],
          },
        },
      })
    )
  );
  zip.addFile('expoconfig.json', Buffer.from(JSON.stringify({ name: 'item7go' })));
  zip.addFile('bundles/ios.hbc', bundle);
  zip.addFile('bundles/android.hbc', bundle);
  zip.addFile('assets/font', font);
  return zip.toBuffer();
}

function sha256(data: Buffer) {
  return crypto
    .createHash('sha256')
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('ReleaseAssetCache', () => {
  let cacheDir: string;
  let downloadFile: jest.Mock;
  const release = { id: 'a1b2c3d4-0000-4000-8000-000000000001', path: 'updates/1.0.0/a.zip' };

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-cache-test-'));
    process.env.ASSET_CACHE_DIR = cacheDir;
    ReleaseAssetCache.clearMemory();
    downloadFile = jest.fn().mockResolvedValue(buildReleaseZip());
    (StorageFactory.getStorage as jest.Mock).mockReturnValue({ downloadFile });
  });

  afterEach(() => {
    delete process.env.ASSET_CACHE_DIR;
    delete process.env.ASSET_CACHE_MAX_RELEASES;
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it('downloads and hashes a release once for phones arriving together', async () => {
    const [first, second] = await Promise.all([
      ReleaseAssetCache.getPreparedRelease(release),
      ReleaseAssetCache.getPreparedRelease(release),
    ]);

    expect(first).toBe(second);
    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(downloadFile).toHaveBeenCalledWith('updates/1.0.0/a.zip');
    expect(first.isRollback).toBe(false);
    expect(first.expoConfig).toEqual({ name: 'item7go' });
    expect(first.platforms.ios.launchAsset).toEqual({
      path: 'bundles/ios.hbc',
      hash: sha256(bundle),
      key: crypto.createHash('md5').update(bundle).digest('hex'),
      fileExtension: '.bundle',
      contentType: 'application/javascript',
      size: bundle.length,
      gzipSize: expect.any(Number),
    });
    expect(first.platforms.android.assets).toEqual([
      expect.objectContaining({
        path: 'assets/font',
        hash: sha256(font),
        fileExtension: '.ttf',
        contentType: 'font/ttf',
        size: font.length,
        // Random bytes do not compress, so no gzip copy is kept.
        gzipSize: null,
      }),
    ]);

    await ReleaseAssetCache.getPreparedRelease(release);
    expect(downloadFile).toHaveBeenCalledTimes(1);
  });

  it('serves the stored files and gzip copy', async () => {
    const prepared = await ReleaseAssetCache.getPreparedRelease(release);
    const launchAsset = prepared.platforms.ios.launchAsset;

    const plain = await ReleaseAssetCache.openAsset(release, launchAsset, false);
    expect(plain.gzipped).toBe(false);
    expect(await plain.handle.readFile()).toEqual(bundle);
    await plain.handle.close();

    const gzipped = await ReleaseAssetCache.openAsset(release, launchAsset, true);
    expect(gzipped.gzipped).toBe(true);
    expect(gzipped.size).toBeLessThan(bundle.length);
    expect(require('zlib').gunzipSync(await gzipped.handle.readFile())).toEqual(bundle);
    await gzipped.handle.close();
  });

  it('reloads a prepared release from disk after a restart', async () => {
    const prepared = await ReleaseAssetCache.getPreparedRelease(release);
    ReleaseAssetCache.clearMemory();

    expect(await ReleaseAssetCache.getPreparedRelease(release)).toEqual(prepared);
    expect(downloadFile).toHaveBeenCalledTimes(1);
  });

  it('prepares the release again if its files were removed', async () => {
    const prepared = await ReleaseAssetCache.getPreparedRelease(release);
    fs.rmSync(path.join(cacheDir, release.id), { recursive: true });

    const file = await ReleaseAssetCache.openAsset(
      release,
      prepared.platforms.android.assets[0],
      true
    );
    expect(await file.handle.readFile()).toEqual(font);
    await file.handle.close();
    expect(downloadFile).toHaveBeenCalledTimes(2);
  });

  it('prepares a zip opened at upload without downloading it', async () => {
    const prepared = await ReleaseAssetCache.prepareFromZip(
      release.id,
      new AdmZip(buildReleaseZip())
    );

    expect(await ReleaseAssetCache.getPreparedRelease(release)).toBe(prepared);
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('marks a rollback bundle', async () => {
    const zip = new AdmZip();
    zip.addFile('rollback', Buffer.alloc(0));
    downloadFile.mockResolvedValue(zip.toBuffer());

    expect(await ReleaseAssetCache.getPreparedRelease(release)).toEqual({
      isRollback: true,
      expoConfig: null,
      platforms: {},
    });
  });

  it('rejects a bundle without an expo config', async () => {
    const zip = new AdmZip();
    zip.addFile('metadata.json', Buffer.from('{"fileMetadata":{}}'));

    await expect(ReleaseAssetCache.prepareFromZip(release.id, zip)).rejects.toThrow(
      'expoconfig.json'
    );
    expect(fs.readdirSync(cacheDir)).toEqual([]);
  });

  it('keeps only the most recent releases on disk', async () => {
    process.env.ASSET_CACHE_MAX_RELEASES = '2';
    const ids = ['1', '2', '3'].map((n) => `a1b2c3d4-0000-4000-8000-00000000000${n}`);
    for (let index = 0; index < ids.length; index++) {
      await ReleaseAssetCache.prepareFromZip(ids[index], new AdmZip(buildReleaseZip()));
      const time = new Date(Date.now() + index * 1000);
      fs.utimesSync(path.join(cacheDir, ids[index]), time, time);
    }

    expect(fs.readdirSync(cacheDir).sort()).toEqual(ids.slice(1));
  });
});
