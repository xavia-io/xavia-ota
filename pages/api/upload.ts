import formidable from 'formidable';
import fs from 'fs';
import moment from 'moment';
import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../../apiUtils/storage/StorageFactory';

import AdmZip from 'adm-zip';
import { ZipHelper } from '../../apiUtils/helpers/ZipHelper';
import { HashHelper } from '../../apiUtils/helpers/HashHelper';

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

  // postgres schema uses VARCHAR(255) for commit_message; defensively normalize + truncate to avoid DB errors
  const normalizeAndTruncateCommitMessage = (input: unknown, maxChars = 255): string => {
    const raw = typeof input === 'string' ? input : 'No message provided';
    // Replace newlines/tabs to keep it readable in UI + consistent storage
    const normalized = raw.replace(/\s+/g, ' ').trim();
    const chars = Array.from(normalized); // unicode-safe (code points)
    return chars.length > maxChars ? chars.slice(0, maxChars).join('') : normalized;
  };

  const form = formidable({});

  try {
    const [fields, files] = await form.parse(req);
    const uploadKey = fields.uploadKey?.[0] || null;
    const file = files.file?.[0];
    const runtimeVersion = fields.runtimeVersion?.[0];
    const commitHash = fields.commitHash?.[0];
    const commitMessage = normalizeAndTruncateCommitMessage(fields.commitMessage?.[0]);

    if (!uploadKey || !file || !runtimeVersion || !commitHash) {
      res.status(400).json({ error: 'Missing upload key, file, runtime version or commit hash' });
      return;
    }

    if (process.env.UPLOAD_KEY !== uploadKey) {
      res.status(400).json({ error: 'Upload failed: wrong upload key' });
      return;
    }

    const storage = StorageFactory.getStorage();
    const timestamp = moment().utc().format('YYYYMMDDHHmmss');
    const updatePath = `updates/${runtimeVersion}`;

    // Store the zipped file as is
    const zipContent = fs.readFileSync(file.filepath);
    const zipFolder = new AdmZip(file.filepath);
    const metadataJsonFile = await ZipHelper.getFileFromZip(zipFolder, 'metadata.json');

    const updateHash = HashHelper.createHash(metadataJsonFile, 'sha256', 'hex');
    const updateId = HashHelper.convertSHA256HashToUUID(updateHash);

    const path = await storage.uploadFile(`${updatePath}/${timestamp}.zip`, zipContent);

    await DatabaseFactory.getDatabase().createRelease({
      path,
      runtimeVersion,
      timestamp: moment().utc().toString(),
      commitHash,
      commitMessage,
      updateId,
    });

    res.status(200).json({ success: true, path });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
}
