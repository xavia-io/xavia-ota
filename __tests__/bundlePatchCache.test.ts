import AdmZip from 'adm-zip';
import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import zlib from 'zlib';

import { BundlePatchCache } from '../apiUtils/helpers/BundlePatchCache';
import { ReleaseAssetCache } from '../apiUtils/helpers/ReleaseAssetCache';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { BundlePatch, Release } from '../apiUtils/database/DatabaseInterface';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';

jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/storage/StorageFactory');

const baseId = '01234567-0123-0123-0123-0123456789ab';
const base = {
  id: 'base-release',
  path: 'base.zip',
  status: 'inactive',
  runtimeVersion: '1.0.0',
} as Release;
const target = {
  id: 'target-release',
  path: 'target.zip',
  status: 'uploading',
  runtimeVersion: '1.0.0',
} as Release;

function zip(bundle: Buffer, platforms: string[]) {
  const result = new AdmZip();
  result.addFile(
    'metadata.json',
    Buffer.from(
      JSON.stringify({
        fileMetadata: Object.fromEntries(
          platforms.map((platform) => [platform, { bundle: 'bundle.hbc', assets: [] }])
        ),
      })
    )
  );
  result.addFile('expoconfig.json', Buffer.from('{}'));
  result.addFile('bundle.hbc', bundle);
  return result;
}

describe('Upload-time bundle patches with Expo decoder', () => {
  let tools: string;
  let cache: string;
  let getRelease: jest.Mock;
  let getBases: jest.Mock;
  let getRef: jest.Mock;
  let saveRef: jest.Mock;
  let upload: jest.Mock;
  let download: jest.Mock;
  let refs: BundlePatch[];
  let stored: Map<string, Buffer>;

  beforeAll(async () => {
    tools = await fs.mkdtemp(path.join(os.tmpdir(), 'xavia-patch-tools-'));
    execFileSync('cc', [
      '-O2',
      'vendor/bsdiff/bsdiff.c',
      '-lbz2',
      '-o',
      path.join(tools, 'bsdiff'),
    ]);
    execFileSync('cc', [
      '-O2',
      '-Dbspatch_main=main',
      'vendor/bsdiff/bspatch.c',
      '-lbz2',
      '-o',
      path.join(tools, 'bspatch'),
    ]);
    process.env.BSDIFF_BINARY = path.join(tools, 'bsdiff');
    process.env.BSPATCH_BINARY = path.join(tools, 'bspatch');
  });

  beforeEach(async () => {
    cache = await fs.mkdtemp(path.join(os.tmpdir(), 'xavia-patch-test-'));
    process.env.ASSET_CACHE_DIR = cache;
    ReleaseAssetCache.clearMemory();
    refs = [];
    stored = new Map();
    getRelease = jest.fn().mockResolvedValue(base);
    getBases = jest.fn().mockResolvedValue([base]);
    getRef = jest
      .fn()
      .mockImplementation(
        async (targetReleaseId, baseReleaseId, platform) =>
          refs.find(
            (ref) =>
              ref.targetReleaseId === targetReleaseId &&
              ref.baseReleaseId === baseReleaseId &&
              ref.platform === platform
          ) ?? null
      );
    saveRef = jest.fn().mockImplementation(async (ref) => {
      refs.push(ref);
    });
    upload = jest.fn().mockImplementation(async (key, bytes) => {
      stored.set(key, bytes);
    });
    download = jest.fn().mockImplementation(async (key) => {
      const bytes = stored.get(key);
      if (!bytes) throw new Error('missing object');
      return bytes;
    });
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({
      getReleaseByUpdateId: getRelease,
      getRecentPatchBases: getBases,
      getBundlePatch: getRef,
      saveBundlePatch: saveRef,
    });
    (StorageFactory.getStorage as jest.Mock).mockReturnValue({
      uploadFile: upload,
      downloadFile: download,
    });
  });

  afterEach(async () => {
    delete process.env.BUNDLE_DIFFING_ENABLED;
    await fs.rm(cache, { recursive: true, force: true });
  });

  afterAll(async () => {
    delete process.env.ASSET_CACHE_DIR;
    delete process.env.BSDIFF_BINARY;
    delete process.env.BSPATCH_BINARY;
    await fs.rm(tools, { recursive: true, force: true });
  });

  async function setup(platforms = ['ios']) {
    const old = randomBytes(128 * 1024);
    const next = Buffer.concat([
      old.subarray(0, 60000),
      Buffer.from('inserted code'),
      old.subarray(60000),
    ]);
    await ReleaseAssetCache.prepareFromZip(base.id, zip(old, platforms));
    const prepared = await ReleaseAssetCache.prepareFromZip(target.id, zip(next, platforms));
    return {
      old,
      next,
      prepared,
      options: {
        baseUpdateId: baseId,
        runtimeVersion: '1.0.0',
        platform: platforms[0],
        target,
        targetAsset: prepared.platforms[platforms[0]].launchAsset,
        fullDownloadSize: zlib.gzipSync(next).length,
      },
    };
  }

  it.each(['ios', 'android'])(
    'prepares and persists a verified %s patch before any download',
    async (platform) => {
      const { old, next, prepared, options } = await setup([platform]);
      expect(await BundlePatchCache.getPatch(options)).toBeNull();
      expect(upload).not.toHaveBeenCalled();
      const summary = await BundlePatchCache.prepareRelease(target, prepared);
      expect(summary.ready).toBe(1);
      expect(summary.patchBytes).toBeLessThan(next.length / 10);
      expect(upload.mock.invocationCallOrder[0]).toBeLessThan(saveRef.mock.invocationCallOrder[0]);
      expect(getBases).toHaveBeenCalledWith('1.0.0', target.id);
      expect(refs[0]).toEqual(
        expect.objectContaining({ targetReleaseId: target.id, baseReleaseId: base.id, platform })
      );

      // No tool is available during delivery, and extraction must not happen on this path.
      const binary = process.env.BSDIFF_BINARY;
      process.env.BSDIFF_BINARY = '/missing/bsdiff';
      const preparation = jest.spyOn(ReleaseAssetCache, 'getPreparedRelease');
      const patch = await BundlePatchCache.getPatch(options);
      expect(preparation).not.toHaveBeenCalled();
      preparation.mockRestore();
      process.env.BSDIFF_BINARY = binary;
      expect(patch).not.toBeNull();
      expect(download).toHaveBeenCalledWith(refs[0].storagePath);
      const oldFile = path.join(cache, 'old');
      const patchFile = path.join(cache, 'patch');
      const output = path.join(cache, 'output');
      await fs.writeFile(oldFile, old);
      await fs.writeFile(patchFile, patch!);
      execFileSync(process.env.BSPATCH_BINARY!, [oldFile, output, patchFile]);
      expect(await fs.readFile(output)).toEqual(next);
      expect(await BundlePatchCache.getPatch(options)).toEqual(patch);
      expect(download).toHaveBeenCalledTimes(1);

      // Restart/eviction removes only the cache; durable storage still supplies the patch.
      await fs.rm(path.join(cache, 'bundle-patches-v1'), { recursive: true, force: true });
      ReleaseAssetCache.clearMemory();
      expect(await BundlePatchCache.getPatch(options)).toEqual(patch);
      expect(download).toHaveBeenCalledTimes(2);
    }
  );

  it('prepares both platforms for multiple recent bases including skipped releases', async () => {
    const { old, prepared } = await setup(['ios', 'android']);
    const older = { ...base, id: 'older-release', path: 'older.zip' };
    await ReleaseAssetCache.prepareFromZip(older.id, zip(old, ['ios', 'android']));
    getBases.mockResolvedValue([base, older]);
    expect((await BundlePatchCache.prepareRelease(target, prepared)).ready).toBe(4);
    expect(refs.map((ref) => `${ref.baseReleaseId}/${ref.platform}`)).toEqual([
      'base-release/ios',
      'base-release/android',
      'older-release/ios',
      'older-release/android',
    ]);
  });

  it('uses full downloads for missing, malformed and disabled bases without generating', async () => {
    const { prepared, options } = await setup();
    expect(await BundlePatchCache.getPatch({ ...options, baseUpdateId: '../bad' })).toBeNull();
    expect(getRelease).not.toHaveBeenCalled();
    expect(await BundlePatchCache.getPatch(options)).toBeNull();
    getRelease.mockResolvedValue(null);
    expect(await BundlePatchCache.getPatch(options)).toBeNull();
    process.env.BUNDLE_DIFFING_ENABLED = '0';
    expect((await BundlePatchCache.prepareRelease(target, prepared)).ready).toBe(0);
    expect(await BundlePatchCache.getPatch(options)).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it('discards patches that do not beat the compressed full bundle', async () => {
    const { prepared } = await setup();
    prepared.platforms.ios.launchAsset.gzipSize = 1;
    expect((await BundlePatchCache.prepareRelease(target, prepared)).ready).toBe(0);
    expect(upload).not.toHaveBeenCalled();
    expect(saveRef).not.toHaveBeenCalled();
  });

  it('skips unavailable tools and never persists unverified patches', async () => {
    const { prepared } = await setup();
    const binary = process.env.BSPATCH_BINARY;
    process.env.BSPATCH_BINARY = '/missing/bspatch';
    try {
      expect((await BundlePatchCache.prepareRelease(target, prepared)).ready).toBe(0);
      expect(upload).not.toHaveBeenCalled();
      expect(saveRef).not.toHaveBeenCalled();
    } finally {
      process.env.BSPATCH_BINARY = binary;
    }
  });

  it('propagates persistence failure so the uploader cannot activate', async () => {
    const { prepared } = await setup();
    upload.mockRejectedValue(new Error('storage unavailable'));
    await expect(BundlePatchCache.prepareRelease(target, prepared)).rejects.toThrow(
      'storage unavailable'
    );
    expect(saveRef).not.toHaveBeenCalled();
  });

  it('falls back for missing/corrupted stored bytes and wrong target hashes', async () => {
    const { prepared, options } = await setup();
    await BundlePatchCache.prepareRelease(target, prepared);
    const ref = refs[0];
    stored.set(ref.storagePath, Buffer.from('broken patch'));
    expect(await BundlePatchCache.getPatch(options)).toBeNull();
    stored.clear();
    expect(await BundlePatchCache.getPatch(options)).toBeNull();
    refs[0] = { ...ref, targetHash: 'wrong-target' };
    expect(await BundlePatchCache.getPatch(options)).toBeNull();
  });
});
