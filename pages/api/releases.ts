import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../../apiUtils/storage/StorageFactory';

export default async function releasesHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const storage = StorageFactory.getStorage();
    const directories = await storage.listDirectories('updates/');

    const releasesWithCommitHash = await DatabaseFactory.getDatabase().listReleases();

    const releases = [];
    for (const directory of directories) {
      const folderPath = `updates/${directory}`;
      const files = await storage.listFiles(folderPath);
      const runtimeVersion = directory;

      for (const file of files) {
        const release = releasesWithCommitHash.find((r) => r.path === `${folderPath}/${file.name}`);
        const commitHash = release ? release.commitHash : null;
        releases.push({
          path: release?.path || `${folderPath}/${file.name}`,
          runtimeVersion,
          timestamp: file.created_at,
          size: file.metadata.size,
          commitHash,
          commitMessage: release?.commitMessage,
        });
      }
    }

    res.status(200).json({ releases });
  } catch (error) {
    console.error('Failed to fetch releases:', error);
    res.status(500).json({ error: 'Failed to fetch releases' });
  }
}
