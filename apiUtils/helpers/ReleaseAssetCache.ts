import AdmZip from 'adm-zip';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import mime from 'mime';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import zlib from 'zlib';

import { HashHelper } from './HashHelper';
import { StorageFactory } from '../storage/StorageFactory';
import { getLogger } from '../logger';

const logger = getLogger('ReleaseAssetCache');
const gzip = promisify(zlib.gzip);

const RELEASE_ID_PATTERN = /^[0-9a-zA-Z-]+$/;
const RELEASE_FILE = 'release.json';
const TEMP_PREFIX = '.tmp-';
const TEMP_MAX_AGE_MS = 10 * 60 * 1000;
const MEMORY_MAX_RELEASES = 50;
// Only keep a gzip copy when it saves at least this share of the bytes (images rarely shrink).
const GZIP_MAX_RATIO = 0.9;

export interface PreparedAsset {
  path: string;
  hash: string;
  key: string;
  fileExtension: string;
  contentType: string | null;
  size: number;
  gzipSize: number | null;
}

export interface PreparedPlatform {
  launchAsset: PreparedAsset;
  assets: PreparedAsset[];
}

export interface PreparedRelease {
  isRollback: boolean;
  expoConfig: unknown;
  platforms: { [platform: string]: PreparedPlatform };
}

export interface CachedAssetFile {
  handle: fs.FileHandle;
  size: number;
  gzipped: boolean;
}

type ReleaseRef = { id: string; path: string };

// A release zip never changes, so everything phones need from it is worked out once: each asset's
// hash and key for the manifest, and the file itself (plus a gzip copy) on local disk for /assets.
// Requests then read from memory and disk instead of downloading, unzipping and hashing the bundle.
export class ReleaseAssetCache {
  private static memory = new Map<string, PreparedRelease>();
  private static preparing = new Map<string, Promise<PreparedRelease>>();

  static getCacheDir(): string {
    return process.env.ASSET_CACHE_DIR || path.join(os.tmpdir(), 'xavia-ota-asset-cache');
  }

  private static getMaxReleasesOnDisk(): number {
    const max = parseInt(process.env.ASSET_CACHE_MAX_RELEASES ?? '', 10);
    return Number.isFinite(max) && max > 0 ? max : 20;
  }

  private static getReleaseDir(releaseId: string): string {
    if (!RELEASE_ID_PATTERN.test(releaseId)) throw new Error(`Invalid release id: ${releaseId}`);
    return path.join(this.getCacheDir(), releaseId);
  }

  static async getPreparedRelease(release: ReleaseRef): Promise<PreparedRelease> {
    const cached = this.memory.get(release.id);
    if (cached) return cached;

    // Phones arrive together after a publish; they all wait on the same preparation.
    let pending = this.preparing.get(release.id);
    if (!pending) {
      pending = this.loadOrPrepare(release).finally(() => this.preparing.delete(release.id));
      this.preparing.set(release.id, pending);
    }
    return pending;
  }

  // Used at upload, where the zip is already open, so the first phone does not pay for it.
  static async prepareFromZip(releaseId: string, zip: AdmZip): Promise<PreparedRelease> {
    const prepared = await this.writeToDisk(releaseId, zip);
    this.remember(releaseId, prepared);
    await this.prune(releaseId);
    return prepared;
  }

  static findAsset(
    prepared: PreparedRelease,
    platform: string,
    assetPath: string
  ): PreparedAsset | null {
    const platformAssets = prepared.platforms[platform];
    if (!platformAssets) return null;
    if (platformAssets.launchAsset.path === assetPath) return platformAssets.launchAsset;
    return platformAssets.assets.find((asset) => asset.path === assetPath) ?? null;
  }

  // Opens the cached file for an asset, re-preparing the release once if its files were pruned.
  static async openAsset(
    release: ReleaseRef,
    asset: PreparedAsset,
    acceptsGzip: boolean
  ): Promise<CachedAssetFile> {
    const gzipped = acceptsGzip && asset.gzipSize !== null;
    const fileName = gzipped ? `${asset.key}.gz` : asset.key;
    const size = gzipped ? asset.gzipSize! : asset.size;
    try {
      const handle = await fs.open(path.join(this.getReleaseDir(release.id), fileName));
      return { handle, size, gzipped };
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }
    this.forget(release.id);
    await fs.rm(this.getReleaseDir(release.id), { recursive: true, force: true });
    await this.getPreparedRelease(release);
    const handle = await fs.open(path.join(this.getReleaseDir(release.id), fileName));
    return { handle, size, gzipped };
  }

  static forget(releaseId: string) {
    this.memory.delete(releaseId);
  }

  static clearMemory() {
    this.memory.clear();
    this.preparing.clear();
  }

  private static remember(releaseId: string, prepared: PreparedRelease) {
    this.memory.delete(releaseId);
    this.memory.set(releaseId, prepared);
    while (this.memory.size > MEMORY_MAX_RELEASES) {
      this.memory.delete(this.memory.keys().next().value!);
    }
  }

  private static async loadOrPrepare(release: ReleaseRef): Promise<PreparedRelease> {
    const fromDisk = await this.readFromDisk(release.id);
    if (fromDisk) {
      this.remember(release.id, fromDisk);
      return fromDisk;
    }

    const startedAt = Date.now();
    const zipBuffer = await StorageFactory.getStorage().downloadFile(release.path);
    const prepared = await this.prepareFromZip(release.id, new AdmZip(zipBuffer));
    logger.info('Prepared release assets', {
      releaseId: release.id,
      durationMs: Date.now() - startedAt,
    });
    return prepared;
  }

  private static async readFromDisk(releaseId: string): Promise<PreparedRelease | null> {
    const releaseDir = this.getReleaseDir(releaseId);
    try {
      const prepared = JSON.parse(
        await fs.readFile(path.join(releaseDir, RELEASE_FILE), 'utf-8')
      ) as PreparedRelease;
      const now = new Date();
      await fs.utimes(releaseDir, now, now).catch(() => undefined);
      return prepared;
    } catch (error: any) {
      if (error?.code === 'ENOENT') return null;
      logger.error('Ignoring unreadable release cache', { releaseId, error });
      return null;
    }
  }

  private static async writeToDisk(releaseId: string, zip: AdmZip): Promise<PreparedRelease> {
    const releaseDir = this.getReleaseDir(releaseId);
    const tempDir = path.join(this.getCacheDir(), `${TEMP_PREFIX}${randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      const prepared = await this.extract(zip, tempDir);
      await fs.writeFile(path.join(tempDir, RELEASE_FILE), JSON.stringify(prepared));
      try {
        await fs.rename(tempDir, releaseDir);
      } catch (error: any) {
        // Another request finished the same release first; its files are identical.
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error?.code)) throw error;
        await fs.rm(tempDir, { recursive: true, force: true });
      }
      return prepared;
    } catch (error) {
      await fs.rm(tempDir, { recursive: true, force: true });
      throw error;
    }
  }

  private static async extract(zip: AdmZip, dir: string): Promise<PreparedRelease> {
    if (zip.getEntry('rollback') !== null) {
      return { isRollback: true, expoConfig: null, platforms: {} };
    }

    const metadataJson = JSON.parse((await readEntry(zip, 'metadata.json')).toString('utf-8'));
    const expoConfig = JSON.parse((await readEntry(zip, 'expoconfig.json')).toString('utf-8'));

    const written = new Map<string, Omit<PreparedAsset, 'fileExtension' | 'contentType'>>();
    const writeAsset = async (filePath: string, ext: string | null): Promise<PreparedAsset> => {
      let file = written.get(filePath);
      if (!file) {
        const data = await readEntry(zip, filePath);
        const key = HashHelper.createHash(data, 'md5', 'hex');
        const compressed = await gzip(data, { level: zlib.constants.Z_BEST_COMPRESSION });
        const keepGzip = compressed.length < data.length * GZIP_MAX_RATIO;
        await fs.writeFile(path.join(dir, key), data);
        if (keepGzip) await fs.writeFile(path.join(dir, `${key}.gz`), compressed);
        file = {
          path: filePath,
          hash: HashHelper.getBase64URLEncoding(HashHelper.createHash(data, 'sha256', 'base64')),
          key,
          size: data.length,
          gzipSize: keepGzip ? compressed.length : null,
        };
        written.set(filePath, file);
      }
      return {
        ...file,
        fileExtension: `.${ext ?? 'bundle'}`,
        contentType: ext === null ? 'application/javascript' : mime.getType(ext),
      };
    };

    const platforms: { [platform: string]: PreparedPlatform } = {};
    for (const [platform, fileMetadata] of Object.entries<any>(metadataJson.fileMetadata ?? {})) {
      const launchAsset = await writeAsset(fileMetadata.bundle, null);
      const assets: PreparedAsset[] = [];
      for (const asset of fileMetadata.assets ?? []) {
        assets.push(await writeAsset(asset.path, asset.ext));
      }
      platforms[platform] = { launchAsset, assets };
    }

    return { isRollback: false, expoConfig, platforms };
  }

  // Keeps disk use bounded: the most recently used releases stay, older ones are re-prepared from
  // storage if a phone still asks for them.
  private static async prune(keepReleaseId: string) {
    const cacheDir = this.getCacheDir();
    try {
      const entries = await fs.readdir(cacheDir, { withFileTypes: true });
      const dirs = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => ({
            name: entry.name,
            mtimeMs: (await fs.stat(path.join(cacheDir, entry.name))).mtimeMs,
          }))
      );

      const now = Date.now();
      const staleTemp = dirs.filter(
        (dir) => dir.name.startsWith(TEMP_PREFIX) && now - dir.mtimeMs > TEMP_MAX_AGE_MS
      );
      const releases = dirs
        .filter(
          (dir) =>
            !dir.name.startsWith(TEMP_PREFIX) &&
            dir.name !== 'bundle-patches-v1' &&
            dir.name !== keepReleaseId
        )
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(this.getMaxReleasesOnDisk() - 1);

      for (const dir of [...staleTemp, ...releases]) {
        this.memory.delete(dir.name);
        await fs.rm(path.join(cacheDir, dir.name), { recursive: true, force: true });
      }
    } catch (error) {
      logger.error('Failed to prune release asset cache', { error });
    }
  }
}

function readEntry(zip: AdmZip, name: string): Promise<Buffer> {
  const entry = zip.getEntry(name);
  if (!entry) return Promise.reject(new Error(`File not found in zip: ${name}`));
  return new Promise((resolve, reject) =>
    entry.getDataAsync((data, err) => (err ? reject(new Error(String(err))) : resolve(data)))
  );
}
