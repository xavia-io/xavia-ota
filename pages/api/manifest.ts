import FormData from 'form-data';
import { randomUUID } from 'crypto';

import { NextApiRequest, NextApiResponse } from 'next';
import { parseList, serializeDictionary } from 'structured-headers';

import { ConfigHelper } from '../../apiUtils/helpers/ConfigHelper';
import { DictionaryHelper } from '../../apiUtils/helpers/DictionaryHelper';
import { HashHelper } from '../../apiUtils/helpers/HashHelper';
import {
  PreparedAsset,
  PreparedRelease,
  ReleaseAssetCache,
} from '../../apiUtils/helpers/ReleaseAssetCache';
import { UpdateHelper, NoUpdateAvailableError } from '../../apiUtils/helpers/UpdateHelper';
import { getLogger } from '../../apiUtils/logger';
import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';

const logger = getLogger('manifest');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Update IDs are cut from a SHA-256 hash, so they carry no UUID version or variant bits.
const UPDATE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// expo-updates lists updates that threw before their first screen and were rolled back.
function getRecentFailedUpdateIds(header: string | string[] | undefined): string[] {
  if (typeof header !== 'string') return [];
  try {
    return parseList(header)
      .map(([value]) => value)
      .filter(
        (value): value is string => typeof value === 'string' && UPDATE_ID_PATTERN.test(value)
      )
      .map((value) => value.toLowerCase());
  } catch {
    return [];
  }
}

function getInstallationId(
  req: NextApiRequest,
  res: NextApiResponse
): { id: string; confirmed: boolean } {
  const header = req.headers['x-installation-id'];
  const confirmed = typeof header === 'string' && UUID_PATTERN.test(header);
  const id = confirmed ? header.toLowerCase() : randomUUID();
  res.setHeader(
    'expo-server-defined-headers',
    serializeDictionary(new Map([['x-installation-id', [id, new Map()]]]))
  );
  return { id, confirmed };
}

async function trackInstallation(releaseId: string, platform: string, installationId: string) {
  try {
    await DatabaseFactory.getDatabase().createTracking({ releaseId, platform, installationId });
  } catch (error) {
    logger.error('Failed to track installation', { releaseId, error });
  }
}

async function trackFailedLaunches(
  runtimeVersion: string,
  platform: string,
  installationId: string,
  updateIds: string[]
) {
  try {
    await DatabaseFactory.getDatabase().recordFailedLaunches(
      runtimeVersion,
      platform,
      installationId,
      updateIds
    );
  } catch (error) {
    logger.error('Failed to record failed launches', { runtimeVersion, error });
  }
}

async function countManifestRequest(releaseId: string, platform: string) {
  try {
    await DatabaseFactory.getDatabase().recordManifestRequest(releaseId, platform);
  } catch (error) {
    logger.error('Failed to count manifest request', { releaseId, error });
  }
}

export default async function manifestEndpoint(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.json({ error: 'Expected GET.' });
    return;
  }

  logger.info('A client requested a release', {
    runtimeVersion: req.headers['expo-runtime-version'],
    platform: req.headers['expo-platform'],
    protocolVersion: req.headers['expo-protocol-version'],
    apiVersion: req.headers['expo-api-version'],
    currentUpdateId: req.headers['expo-current-update-id'],
    embeddedUpdateId: req.headers['expo-embedded-update-id'],
    recentFailedUpdateIds: req.headers['expo-recent-failed-update-ids'],
  });

  const protocolVersionMaybeArray = req.headers['expo-protocol-version'];
  if (protocolVersionMaybeArray && Array.isArray(protocolVersionMaybeArray)) {
    res.statusCode = 400;
    res.json({
      error: 'Unsupported protocol version. Expected either 0 or 1.',
    });
    return;
  }

  const protocolVersion = parseInt(protocolVersionMaybeArray ?? '0', 10);

  const platform = req.headers['expo-platform'] ?? req.query['platform'];
  if (platform !== 'ios' && platform !== 'android') {
    res.statusCode = 400;
    res.json({
      error: 'Unsupported platform. Expected either ios or android.',
    });
    return;
  }

  const runtimeVersion = req.headers['expo-runtime-version'] ?? req.query['runtime-version'];
  if (!runtimeVersion || typeof runtimeVersion !== 'string') {
    res.statusCode = 400;
    res.json({
      error: 'No runtimeVersion provided.',
    });
    return;
  }

  const installation = getInstallationId(req, res);
  const failedUpdateIds = getRecentFailedUpdateIds(req.headers['expo-recent-failed-update-ids']);
  if (installation.confirmed && failedUpdateIds.length > 0) {
    await trackFailedLaunches(runtimeVersion, platform, installation.id, failedUpdateIds);
  }

  const database = DatabaseFactory.getDatabase();
  const releaseRecord = await database.getLatestReleaseRecordForRuntimeVersion(runtimeVersion);
  if (!releaseRecord) {
    await putNoUpdateAvailableInResponseAsync(req, res, protocolVersion);
    return;
  }
  const updateBundlePath = releaseRecord.path.replace(/\.zip$/, '');
  // A rollback is served under its own update ID and time. Phones ignore an ID they already have and
  // an update older than the one they run, so both must come from the latest publication.
  let updateId = releaseRecord.servedUpdateId ?? releaseRecord.updateId;
  if (!updateId) {
    const metadata = await UpdateHelper.getMetadataAsync({ updateBundlePath, runtimeVersion });
    updateId = HashHelper.convertSHA256HashToUUID(metadata.id);
    await database.setReleaseUpdateId(releaseRecord.id, updateId);
  }
  const createdAt = releaseRecord.servedAt
    ? new Date(releaseRecord.servedAt).toISOString()
    : new Date().toISOString();

  // Only the exact served ID means up to date. A phone running an earlier publication of the same
  // bundle may have a newer bad update downloaded for its next launch, so it still needs this one.
  const currentUpdateId = req.headers['expo-current-update-id'];
  if (currentUpdateId && updateId && currentUpdateId === updateId) {
    logger.info('User is already running the latest release. Returning NoUpdateAvailable.', {
      runtimeVersion,
    });
    await putNoUpdateAvailableInResponseAsync(req, res, protocolVersion);
    if (res.statusCode === 200) await countManifestRequest(releaseRecord.id, platform);
    return;
  }

  try {
    try {
      const prepared = await ReleaseAssetCache.getPreparedRelease(releaseRecord);
      if (!prepared.isRollback) {
        logger.info('Found a normal update available.');
        await putUpdateInResponseAsync(
          req,
          res,
          prepared,
          runtimeVersion,
          platform,
          protocolVersion,
          installation,
          releaseRecord.id,
          updateId,
          createdAt
        );
      } else {
        logger.info('Rollback is available.');
        await putRollBackInResponseAsync(req, res, updateBundlePath, protocolVersion);
        if (res.statusCode === 200) await countManifestRequest(releaseRecord.id, platform);
      }
    } catch (maybeNoUpdateAvailableError) {
      if (maybeNoUpdateAvailableError instanceof NoUpdateAvailableError) {
        logger.info('psych!! User already running latest available update');
        await putNoUpdateAvailableInResponseAsync(req, res, protocolVersion);
        if (res.statusCode === 200) await countManifestRequest(releaseRecord.id, platform);
        return;
      }
      throw maybeNoUpdateAvailableError;
    }
  } catch (error) {
    logger.error(error);
    res.statusCode = 404;
    res.json({ error });
  }
}

function toManifestAsset(
  asset: PreparedAsset,
  runtimeVersion: string,
  updateId: string,
  platform: string
) {
  return {
    hash: asset.hash,
    key: asset.key,
    fileExtension: asset.fileExtension,
    contentType: asset.contentType,
    url: `${process.env.HOST}/api/assets?asset=${encodeURIComponent(
      asset.path
    )}&runtimeVersion=${encodeURIComponent(runtimeVersion)}&updateId=${encodeURIComponent(
      updateId
    )}&platform=${platform}`,
  };
}

async function putUpdateInResponseAsync(
  req: NextApiRequest,
  res: NextApiResponse,
  prepared: PreparedRelease,
  runtimeVersion: string,
  platform: string,
  protocolVersion: number,
  installation: { id: string; confirmed: boolean },
  releaseId: string,
  updateId: string,
  createdAt: string
): Promise<void> {
  const currentUpdateId = req.headers['expo-current-update-id'];

  // NoUpdateAvailable directive only supported on protocol version 1
  // for protocol version 0, serve most recent update as normal
  if (currentUpdateId === updateId && protocolVersion === 1) {
    logger.info('returning NoUpdateAvailable to client');
    throw new NoUpdateAvailableError();
  }

  const platformAssets = prepared.platforms[platform];
  if (!platformAssets) {
    throw new Error(`No ${platform} bundle in update ${updateId}`);
  }
  const manifest = {
    id: updateId,
    createdAt,
    runtimeVersion,
    assets: platformAssets.assets.map((asset) =>
      toManifestAsset(asset, runtimeVersion, updateId, platform)
    ),
    launchAsset: toManifestAsset(platformAssets.launchAsset, runtimeVersion, updateId, platform),
    metadata: {},
    extra: {
      expoClient: prepared.expoConfig,
    },
  };

  let signature = null;
  const expectSignatureHeader = req.headers['expo-expect-signature'];
  if (expectSignatureHeader) {
    const privateKey = ConfigHelper.getPrivateKey();
    if (!privateKey) {
      res.statusCode = 400;
      res.json({
        error: 'Code signing requested but no key supplied when starting server.',
      });
      return;
    }
    const manifestString = JSON.stringify(manifest);
    const hashSignature = HashHelper.signRSASHA256(manifestString, privateKey);
    const dictionary = DictionaryHelper.convertToDictionaryItemsRepresentation({
      sig: hashSignature,
      keyid: 'main',
    });
    signature = serializeDictionary(dictionary);
  }

  const assetRequestHeaders: { [key: string]: object } = {};
  [...manifest.assets, manifest.launchAsset].forEach((asset) => {
    assetRequestHeaders[asset.key] = {
      'x-installation-id': installation.id,
    };
  });

  const form = new FormData();
  form.append('manifest', JSON.stringify(manifest), {
    contentType: 'application/json',
    header: {
      'content-type': 'application/json; charset=utf-8',
      ...(signature ? { 'expo-signature': signature } : {}),
    },
  });
  form.append('extensions', JSON.stringify({ assetRequestHeaders }), {
    contentType: 'application/json',
  });

  res.statusCode = 200;
  res.setHeader('expo-protocol-version', protocolVersion);
  res.setHeader('expo-sfv-version', 0);
  res.setHeader('cache-control', 'private, max-age=0');
  res.setHeader('content-type', `multipart/mixed; boundary=${form.getBoundary()}`);
  res.write(form.getBuffer());
  res.end();

  await countManifestRequest(releaseId, platform);

  if (installation.confirmed) {
    try {
      await trackInstallation(releaseId, platform, installation.id);
    } catch (error) {
      logger.error('Failed to look up release for installation tracking', { error });
    }
  }
}

async function putRollBackInResponseAsync(
  req: NextApiRequest,
  res: NextApiResponse,
  updateBundlePath: string,
  protocolVersion: number
): Promise<void> {
  if (protocolVersion === 0) {
    logger.error('Rollbacks not supported on protocol version 0');
    throw new Error('Rollbacks not supported on protocol version 0');
  }

  const embeddedUpdateId = req.headers['expo-embedded-update-id'];
  if (!embeddedUpdateId || typeof embeddedUpdateId !== 'string') {
    logger.error('Invalid Expo-Embedded-Update-ID request header specified.');
    throw new Error('Invalid Expo-Embedded-Update-ID request header specified.');
  }

  const currentUpdateId = req.headers['expo-current-update-id'];
  if (currentUpdateId === embeddedUpdateId) {
    logger.error('Found update already exists in the client.');
    throw new NoUpdateAvailableError();
  }

  const directive = await UpdateHelper.createRollBackDirectiveAsync(updateBundlePath);

  let signature = null;
  const expectSignatureHeader = req.headers['expo-expect-signature'];
  if (expectSignatureHeader) {
    const privateKey = ConfigHelper.getPrivateKey();
    if (!privateKey) {
      res.statusCode = 400;
      res.json({
        error: 'Code signing requested but no key supplied when starting server.',
      });
      return;
    }
    const directiveString = JSON.stringify(directive);
    const hashSignature = HashHelper.signRSASHA256(directiveString, privateKey);
    const dictionary = DictionaryHelper.convertToDictionaryItemsRepresentation({
      sig: hashSignature,
      keyid: 'main',
    });
    signature = serializeDictionary(dictionary);
  }

  const form = new FormData();
  form.append('directive', JSON.stringify(directive), {
    contentType: 'application/json',
    header: {
      'content-type': 'application/json; charset=utf-8',
      ...(signature ? { 'expo-signature': signature } : {}),
    },
  });

  res.statusCode = 200;
  res.setHeader('expo-protocol-version', 1);
  res.setHeader('expo-sfv-version', 0);
  res.setHeader('cache-control', 'private, max-age=0');
  res.setHeader('content-type', `multipart/mixed; boundary=${form.getBoundary()}`);
  res.write(form.getBuffer());
  res.end();
}

async function putNoUpdateAvailableInResponseAsync(
  req: NextApiRequest,
  res: NextApiResponse,
  protocolVersion: number
): Promise<void> {
  if (protocolVersion === 0) {
    throw new Error('NoUpdateAvailable directive not available in protocol version 0');
  }

  const directive = await UpdateHelper.createNoUpdateAvailableDirectiveAsync();

  let signature = null;
  const expectSignatureHeader = req.headers['expo-expect-signature'];
  if (expectSignatureHeader) {
    const privateKey = ConfigHelper.getPrivateKey();
    if (!privateKey) {
      res.statusCode = 400;
      res.json({
        error: 'Code signing requested but no key supplied when starting server.',
      });
      return;
    }
    const directiveString = JSON.stringify(directive);
    const hashSignature = HashHelper.signRSASHA256(directiveString, privateKey);
    const dictionary = DictionaryHelper.convertToDictionaryItemsRepresentation({
      sig: hashSignature,
      keyid: 'main',
    });
    signature = serializeDictionary(dictionary);
  }

  const form = new FormData();
  form.append('directive', JSON.stringify(directive), {
    contentType: 'application/json',
    header: {
      'content-type': 'application/json; charset=utf-8',
      ...(signature ? { 'expo-signature': signature } : {}),
    },
  });

  res.statusCode = 200;
  res.setHeader('expo-protocol-version', 1);
  res.setHeader('expo-sfv-version', 0);
  res.setHeader('cache-control', 'private, max-age=0');
  res.setHeader('content-type', `multipart/mixed; boundary=${form.getBoundary()}`);
  res.write(form.getBuffer());
  res.end();
}
