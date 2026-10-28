import formidable from 'formidable';
import fs from 'fs';
import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../../apiUtils/storage/StorageFactory';

import AdmZip from 'adm-zip';
import { randomUUID } from 'crypto';
import { ZipHelper } from '../../apiUtils/helpers/ZipHelper';
import { HashHelper } from '../../apiUtils/helpers/HashHelper';
import { BundlePatchCache } from '../../apiUtils/helpers/BundlePatchCache';
import { ReleaseAssetCache } from '../../apiUtils/helpers/ReleaseAssetCache';
import { RepositoryHelper } from '../../apiUtils/helpers/RepositoryHelper';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function uploadHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const form = formidable({});

  try {
    const [fields, files] = await form.parse(req);
    const uploadKey = fields.uploadKey?.[0] || null;
    const file = files.file?.[0];
    const runtimeVersion = fields.runtimeVersion?.[0];
    const commitHash = fields.commitHash?.[0];
    const commitMessage = fields.commitMessage?.[0] || 'No message provided';
    const repositoryUrl = RepositoryHelper.toBrowserUrl(fields.repositoryUrl?.[0]);

    if (!uploadKey || !file || !runtimeVersion || !commitHash) {
      res.status(400).json({ error: 'Missing upload key, file, runtime version or commit hash' });
      return;
    }

    if (process.env.UPLOAD_KEY !== uploadKey) {
      res.status(400).json({ error: 'Upload failed: wrong upload key' });
      return;
    }

    if (!repositoryUrl) {
      res.status(400).json({ error: 'Missing or invalid repository URL' });
      return;
    }

    const zipContent = fs.readFileSync(file.filepath);
    const zipFolder = new AdmZip(file.filepath);
    const metadataJsonFile = await ZipHelper.getFileFromZip(zipFolder, 'metadata.json');

    const updateHash = HashHelper.createHash(metadataJsonFile, 'sha256', 'hex');
    const updateId = HashHelper.convertSHA256HashToUUID(updateHash);
    const database = DatabaseFactory.getDatabase();
    let release = await database.getReleaseByUpdateId(runtimeVersion, updateId);
    let created = false;
    if (!release) {
      try {
        release = await database.createRelease({
          path: `updates/${runtimeVersion}/${randomUUID()}.zip`,
          runtimeVersion,
          timestamp: new Date().toISOString(),
          commitHash,
          commitMessage,
          updateId,
          repositoryUrl,
          status: 'uploading',
        });
        created = true;
      } catch (error: any) {
        if (error?.code !== '23505') throw error;
        release = await database.getReleaseByUpdateId(runtimeVersion, updateId);
        if (!release) throw error;
      }
    }

    if (release.status === 'active' || release.status === 'inactive') {
      res.status(200).json({ success: true, path: release.path, updateId });
      return;
    }
    if (release.status === 'failed') {
      if (!(await database.retryFailedRelease(release.id))) {
        res.status(409).json({ error: 'Upload already in progress' });
        return;
      }
    } else if (!created && !(await database.retryStaleUpload(release.id))) {
      res.status(409).json({ error: 'Upload already in progress' });
      return;
    }

    let bundlePatches;
    try {
      // Hash and unpack the assets now so the first phone gets them from the cache, and a bundle
      // phones could not use fails here instead of going live.
      const prepared = await ReleaseAssetCache.prepareFromZip(release.id, zipFolder);
      await StorageFactory.getStorage().uploadFile(release.path, zipContent);
      bundlePatches = await BundlePatchCache.prepareRelease(release, prepared);
      await database.activateRelease(release.id);
    } catch (error) {
      await database.failRelease(release.id);
      throw error;
    }
    res.status(200).json({ success: true, path: release.path, updateId, bundlePatches });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
}
