import moment from 'moment';
import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../../apiUtils/storage/StorageFactory';

export default async function rollbackHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // postgres schema uses VARCHAR(255) for commit_message; defensively normalize + truncate to avoid DB errors
  const normalizeAndTruncateCommitMessage = (input: unknown, maxChars = 255): string => {
    const raw = typeof input === 'string' ? input : 'No message provided';
    const normalized = raw.replace(/\s+/g, ' ').trim();
    const chars = Array.from(normalized); // unicode-safe (code points)
    return chars.length > maxChars ? chars.slice(0, maxChars).join('') : normalized;
  };

  const { path, runtimeVersion, commitHash, commitMessage } = req.body;

  if (!path) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }

  if (!runtimeVersion) {
    res.status(400).json({ error: 'Missing runtimeVersion' });
    return;
  }

  if (!commitHash) {
    res.status(400).json({ error: 'Missing commitHash' });
    return;
  }

  try {
    const storage = StorageFactory.getStorage();

    const timestamp = moment().utc().format('YYYYMMDDHHmmss');
    const newPath = `updates/${runtimeVersion}/${timestamp}.zip`;

    await storage.copyFile(path, newPath);

    await DatabaseFactory.getDatabase().createRelease({
      path: newPath,
      runtimeVersion,
      timestamp: moment().utc().toString(),
      commitHash,
      commitMessage: normalizeAndTruncateCommitMessage(commitMessage),
    });

    res.status(200).json({ success: true, newPath });
  } catch (error) {
    console.error('Rollback error:', error);
    res.status(500).json({ error: 'Rollback failed' });
  }
}
