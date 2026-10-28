import { execFile } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { PreparedAsset, PreparedRelease, ReleaseAssetCache } from './ReleaseAssetCache';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { Release } from '../database/DatabaseInterface';
import { getLogger } from '../logger';
import { StorageFactory } from '../storage/StorageFactory';

const run = promisify(execFile);
const logger = getLogger('BundlePatchCache');
const UPDATE_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_BUNDLE_BYTES = 32 * 1024 * 1024;
const MAX_CACHE_FILES = 128;
const TIMEOUT_MS = 15000;

type ReleaseRef = { id: string; path: string };
export interface BundlePatchSummary {
  ready: number;
  patchBytes: number;
  fullBytes: number;
}

// Patches are generated only while uploading. Downloads resolve persisted references and bytes.
export class BundlePatchCache {
  private static generation: Promise<unknown> = Promise.resolve();

  static async prepareRelease(
    target: Release,
    prepared: PreparedRelease
  ): Promise<BundlePatchSummary> {
    const summary = { ready: 0, patchBytes: 0, fullBytes: 0 };
    if (process.env.BUNDLE_DIFFING_ENABLED === '0' || prepared.isRollback) return summary;
    const database = DatabaseFactory.getDatabase();
    const bases = await database.getRecentPatchBases(target.runtimeVersion, target.id);
    for (const base of bases) {
      let basePrepared: PreparedRelease;
      try {
        basePrepared = await ReleaseAssetCache.getPreparedRelease(base);
      } catch (error) {
        logger.warn('Base bundle unavailable; skipping upload-time patches', {
          baseReleaseId: base.id,
          error: String(error),
        });
        continue;
      }
      for (const platform of ['ios', 'android']) {
        const baseAsset = basePrepared.platforms[platform]?.launchAsset;
        const targetAsset = prepared.platforms[platform]?.launchAsset;
        if (
          !baseAsset ||
          !targetAsset ||
          baseAsset.hash === targetAsset.hash ||
          baseAsset.size > MAX_BUNDLE_BYTES ||
          targetAsset.size > MAX_BUNDLE_BYTES
        )
          continue;
        let patch: Buffer;
        try {
          // Serialise diff processes even when uploads overlap, bounding process memory.
          const pending = this.generation.then(() =>
            this.generate(base, baseAsset, target, targetAsset)
          );
          this.generation = pending.catch(() => undefined);
          patch = await pending;
        } catch (error) {
          logger.warn('Bundle patch generation failed; full bundle remains available', {
            baseReleaseId: base.id,
            platform,
            error: String(error),
          });
          continue;
        }
        const fullSize = targetAsset.gzipSize ?? targetAsset.size;
        if (patch.length >= fullSize * 0.9) continue;
        const patchHash = createHash('sha256').update(patch).digest('hex');
        const storagePath = `bundle-patches/${patchHash}.patch`;
        // Persist bytes before the reference. A storage/DB failure prevents activation, so no
        // release can advertise a patch whose upload has not completed.
        await StorageFactory.getStorage().uploadFile(storagePath, patch);
        await database.saveBundlePatch({
          targetReleaseId: target.id,
          baseReleaseId: base.id,
          platform,
          targetHash: targetAsset.hash,
          baseHash: baseAsset.hash,
          patchHash,
          storagePath,
          size: patch.length,
        });
        summary.ready++;
        summary.patchBytes += patch.length;
        summary.fullBytes += fullSize;
      }
    }
    logger.info('Prepared release bundle patches before activation', {
      releaseId: target.id,
      ...summary,
    });
    return summary;
  }

  static async getPatch(options: {
    baseUpdateId: string;
    runtimeVersion: string;
    platform: string;
    target: ReleaseRef;
    targetAsset: PreparedAsset;
    fullDownloadSize: number;
  }): Promise<Buffer | null> {
    if (process.env.BUNDLE_DIFFING_ENABLED === '0' || !UPDATE_ID.test(options.baseUpdateId))
      return null;
    const { baseUpdateId, runtimeVersion, platform, target, targetAsset, fullDownloadSize } =
      options;
    try {
      const database = DatabaseFactory.getDatabase();
      const base = await database.getReleaseByUpdateId(runtimeVersion, baseUpdateId.toLowerCase());
      if (!base || (base.status !== 'active' && base.status !== 'inactive')) return null;
      const ref = await database.getBundlePatch(target.id, base.id, platform);
      if (
        !ref ||
        ref.targetHash !== targetAsset.hash ||
        ref.size >= fullDownloadSize * 0.9 ||
        !/^[0-9a-f]{64}$/.test(ref.patchHash)
      )
        return null;
      const dir = path.join(ReleaseAssetCache.getCacheDir(), 'bundle-patches-v1');
      const file = path.join(dir, `${ref.patchHash}.patch`);
      const valid = (bytes: Buffer) =>
        bytes.length === ref.size &&
        createHash('sha256').update(bytes).digest('hex') === ref.patchHash;
      try {
        const cached = await fs.readFile(file);
        if (valid(cached)) return cached;
      } catch (error: any) {
        if (error.code !== 'ENOENT') throw error;
      }
      const patch = await StorageFactory.getStorage().downloadFile(ref.storagePath);
      if (!valid(patch)) throw new Error('Stored bundle patch hash mismatch');
      // Caching is optional: durable storage remains authoritative after restarts/eviction.
      try {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(file, patch);
        const files = (await fs.readdir(dir)).filter((name) => name.endsWith('.patch'));
        const dated = await Promise.all(
          files.map(async (name) => ({
            name,
            mtime: (await fs.stat(path.join(dir, name))).mtimeMs,
          }))
        );
        dated.sort((a, b) => b.mtime - a.mtime);
        await Promise.all(
          dated.slice(MAX_CACHE_FILES).map(({ name }) => fs.unlink(path.join(dir, name)))
        );
      } catch (error) {
        logger.warn('Could not cache prepared patch', { error: String(error) });
      }
      return patch;
    } catch (error) {
      logger.warn('Prepared bundle patch unavailable; serving full bundle', {
        error: String(error),
      });
      return null;
    }
  }

  private static async generate(
    base: ReleaseRef,
    baseAsset: PreparedAsset,
    target: ReleaseRef,
    targetAsset: PreparedAsset
  ): Promise<Buffer> {
    const dir = path.join(ReleaseAssetCache.getCacheDir(), 'bundle-patches-v1');
    await fs.mkdir(dir, { recursive: true });
    const work = await fs.mkdtemp(path.join(dir, '.tmp-'));
    const oldPath = path.join(work, 'old');
    const newPath = path.join(work, 'new');
    const patchPath = path.join(work, 'patch');
    const resultPath = path.join(work, 'result');
    try {
      for (const [release, asset, output] of [
        [base, baseAsset, oldPath],
        [target, targetAsset, newPath],
      ] as const) {
        const file = await ReleaseAssetCache.openAsset(release, asset, false);
        try {
          await fs.writeFile(output, await file.handle.readFile());
        } finally {
          await file.handle.close();
        }
      }
      await run(process.env.BSDIFF_BINARY || 'bsdiff', [oldPath, newPath, patchPath], {
        timeout: TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      });
      await run(process.env.BSPATCH_BINARY || 'bspatch', [oldPath, resultPath, patchPath], {
        timeout: TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      });
      const rebuilt = await fs.readFile(resultPath);
      const hash = createHash('sha256')
        .update(rebuilt)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      if (hash !== targetAsset.hash) throw new Error('Reconstructed bundle hash mismatch');
      const patch = await fs.readFile(patchPath);
      if (patch.subarray(0, 8).toString() !== 'BSDIFF40') throw new Error('Invalid patch format');
      logger.info('Generated verified bundle patch during upload', {
        baseBytes: baseAsset.size,
        targetBytes: targetAsset.size,
        patchBytes: patch.length,
      });
      return patch;
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }
}
