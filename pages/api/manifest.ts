import FormData from 'form-data';

import { NextApiRequest, NextApiResponse } from 'next';
import { serializeDictionary } from 'structured-headers';

import { ConfigHelper } from '../../apiUtils/helpers/ConfigHelper';
import { DictionaryHelper } from '../../apiUtils/helpers/DictionaryHelper';
import { HashHelper } from '../../apiUtils/helpers/HashHelper';
import { UpdateHelper, NoUpdateAvailableError } from '../../apiUtils/helpers/UpdateHelper';
import { ZipHelper } from '../../apiUtils/helpers/ZipHelper';
import { getLogger } from '../../apiUtils/logger';
import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import moment from 'moment';

const logger = getLogger('manifest');

export default async function manifestEndpoint(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.json({ error: 'Expected GET.' });
    return;
  }

  logger.info('A client requested a release');

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

  let updateBundlePath: string;
  try {
    updateBundlePath = await UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync(
      runtimeVersion
    );
  } catch (error: any) {
    res.statusCode = 404;
    res.json({
      error: error.message,
    });
    return;
  }

  const updateType = await getTypeOfUpdateAsync(updateBundlePath);

  try {
    try {
      if (updateType === UpdateType.NORMAL_UPDATE) {
        logger.info('Found a normal update available.');
        await putUpdateInResponseAsync(
          req,
          res,
          updateBundlePath,
          runtimeVersion,
          platform,
          protocolVersion
        );
      } else if (updateType === UpdateType.ROLLBACK) {
        logger.info('Rollback is available.');
        await putRollBackInResponseAsync(req, res, updateBundlePath, protocolVersion);
      }
    } catch (maybeNoUpdateAvailableError) {
      if (maybeNoUpdateAvailableError instanceof NoUpdateAvailableError) {
        logger.info('psych!! User already running latest available update');
        await putNoUpdateAvailableInResponseAsync(req, res, protocolVersion);
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

enum UpdateType {
  NORMAL_UPDATE,
  ROLLBACK,
}

async function getTypeOfUpdateAsync(updateBundlePath: string): Promise<UpdateType> {
  const zip = await ZipHelper.getZipFromStorage(updateBundlePath);
  const hasRollback = zip.getEntry('rollback') !== null;
  return hasRollback ? UpdateType.ROLLBACK : UpdateType.NORMAL_UPDATE;
}

async function putUpdateInResponseAsync(
  req: NextApiRequest,
  res: NextApiResponse,
  updateBundlePath: string,
  runtimeVersion: string,
  platform: string,
  protocolVersion: number
): Promise<void> {
  const currentUpdateId = req.headers['expo-current-update-id'];
  const { metadataJson, createdAt, id } = await UpdateHelper.getMetadataAsync({
    updateBundlePath,
    runtimeVersion,
  });

  // NoUpdateAvailable directive only supported on protocol version 1
  // for protocol version 0, serve most recent update as normal
  if (currentUpdateId === HashHelper.convertSHA256HashToUUID(id) && protocolVersion === 1) {
    throw new NoUpdateAvailableError();
  }

  const expoConfig = await ConfigHelper.getExpoConfigAsync({
    updateBundlePath,
    runtimeVersion,
  });
  const platformSpecificMetadata = metadataJson.fileMetadata[platform];
  const manifest = {
    id: HashHelper.convertSHA256HashToUUID(id),
    createdAt,
    runtimeVersion,
    assets: await Promise.all(
      (platformSpecificMetadata.assets as any[]).map((asset: any) =>
        UpdateHelper.getAssetMetadataAsync({
          updateBundlePath,
          filePath: asset.path,
          ext: asset.ext,
          runtimeVersion,
          platform,
          isLaunchAsset: false,
        })
      )
    ),
    launchAsset: await UpdateHelper.getAssetMetadataAsync({
      updateBundlePath,
      filePath: platformSpecificMetadata.bundle,
      isLaunchAsset: true,
      runtimeVersion,
      platform,
      ext: null,
    }),
    metadata: {},
    extra: {
      expoClient: expoConfig,
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
      'test-header': 'test-header-value',
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

  const database = DatabaseFactory.getDatabase();
  const release = await database.getReleaseByPath(updateBundlePath + '.zip');

  if (release) {
    logger.info(`Tracking download for release.`, { releaseId: release.id });
    await database.createTracking({
      platform,
      releaseId: release.id,
      downloadTimestamp: moment().utc().toISOString(),
    });
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
