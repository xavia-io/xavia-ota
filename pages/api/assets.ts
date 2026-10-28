import { NextApiRequest, NextApiResponse } from 'next';
import { pipeline } from 'stream/promises';

import { BundlePatchCache } from '../../apiUtils/helpers/BundlePatchCache';
import { ReleaseAssetCache } from '../../apiUtils/helpers/ReleaseAssetCache';
import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';

// JS bundles are several MB and are streamed from disk, so Next's 4 MB "API response exceeds" warning
// fires on every bundle download without pointing at a problem.
export const config = {
  api: {
    responseLimit: false,
  },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function acceptsGzip(header: string | string[] | undefined): boolean {
  const value = Array.isArray(header) ? header.join(',') : header ?? '';
  return value.split(',').some((encoding) => {
    const [name, ...params] = encoding.trim().toLowerCase().split(';');
    if (name !== 'gzip' && name !== '*') return false;
    return !params.some((param) => /^\s*q=0(\.0*)?\s*$/.test(param));
  });
}

export default async function assetsEndpoint(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  const { asset: assetPath, runtimeVersion, updateId, platform } = req.query;

  if (!assetPath || typeof assetPath !== 'string') {
    res.statusCode = 400;
    res.json({ error: 'No asset path provided.' });
    return;
  }

  if (platform !== 'ios' && platform !== 'android') {
    res.statusCode = 400;
    res.json({ error: 'No platform provided. Expected "ios" or "android".' });
    return;
  }

  if (!runtimeVersion || typeof runtimeVersion !== 'string') {
    res.statusCode = 400;
    res.json({ error: 'No runtimeVersion provided.' });
    return;
  }
  if (!updateId || typeof updateId !== 'string') {
    res.status(400).json({ error: 'No updateId provided.' });
    return;
  }

  try {
    const release = await DatabaseFactory.getDatabase().getReleaseByUpdateId(
      runtimeVersion,
      updateId
    );
    if (!release || (release.status !== 'active' && release.status !== 'inactive')) {
      res.status(404).json({ error: 'Release not found.' });
      return;
    }
    const prepared = await ReleaseAssetCache.getPreparedRelease(release);
    const asset = ReleaseAssetCache.findAsset(prepared, platform, assetPath);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found.' });
      return;
    }

    const gzipAccepted = acceptsGzip(req.headers['accept-encoding']);
    const baseUpdateId = req.headers['expo-current-update-id'];
    const requestedUpdateId = req.headers['expo-requested-update-id'];
    const aim = req.headers['a-im'];
    const wantsPatch =
      typeof aim === 'string' &&
      aim.split(',').some((value) => value.trim().toLowerCase() === 'bsdiff');
    const isLaunchAsset = prepared.platforms[platform]?.launchAsset.path === asset.path;
    const fullSize = gzipAccepted && asset.gzipSize !== null ? asset.gzipSize : asset.size;
    const patch =
      wantsPatch &&
      isLaunchAsset &&
      typeof baseUpdateId === 'string' &&
      (!requestedUpdateId ||
        (typeof requestedUpdateId === 'string' &&
          requestedUpdateId.toLowerCase() === updateId.toLowerCase()))
        ? await BundlePatchCache.getPatch({
            baseUpdateId,
            runtimeVersion,
            platform,
            target: release,
            targetAsset: asset,
            fullDownloadSize: fullSize,
          })
        : null;

    let transferredBytes: number;
    // Patch negotiation must never leak a base-specific response through a shared cache.
    // Keep the same Vary fields on both the patch and full-bundle fallback.
    if (isLaunchAsset) {
      res.setHeader(
        'vary',
        'Accept-Encoding, A-IM, Expo-Current-Update-ID, Expo-Requested-Update-ID'
      );
      res.setHeader('cache-control', 'private, no-store');
    } else {
      res.setHeader('cache-control', 'public, max-age=31536000, immutable');
      if (asset.gzipSize !== null) res.setHeader('vary', 'Accept-Encoding');
    }
    if (patch) {
      transferredBytes = patch.length;
      res.statusCode = 226;
      res.setHeader('im', 'bsdiff');
      res.setHeader('expo-base-update-id', (baseUpdateId as string).toLowerCase());
      res.setHeader('content-type', 'application/octet-stream');
      res.setHeader('content-length', patch.length);
      res.end(patch);
    } else {
      const file = await ReleaseAssetCache.openAsset(release, asset, gzipAccepted);
      transferredBytes = file.size;
      res.statusCode = 200;
      res.setHeader('content-type', asset.contentType ?? 'application/octet-stream');
      res.setHeader('content-length', file.size);
      if (file.gzipped) res.setHeader('content-encoding', 'gzip');
      await pipeline(file.handle.createReadStream(), res);
    }

    try {
      const installationHeader = req.headers['x-installation-id'];
      const installationId =
        typeof installationHeader === 'string' && UUID_PATTERN.test(installationHeader)
          ? installationHeader.toLowerCase()
          : null;
      await DatabaseFactory.getDatabase().recordAssetRequest(
        release.id,
        platform,
        transferredBytes,
        installationId
      );
    } catch (error) {
      console.error('Failed to count asset request:', error);
    }
  } catch (error) {
    console.error(error);
    // A phone that drops mid-download has already had headers; the pipeline closed the response.
    if (res.headersSent) return;
    res.statusCode = 500;
    res.json({ error });
  }
}
