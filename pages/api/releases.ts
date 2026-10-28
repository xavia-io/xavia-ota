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

    const records = await DatabaseFactory.getDatabase().listReleases();
    const filesByPath = new Map<string, { metadata: { size: number }; created_at: string }>();
    for (const directory of directories) {
      const folderPath = `updates/${directory}`;
      const files = await storage.listFiles(folderPath);
      for (const file of files) {
        filesByPath.set(`${folderPath}/${file.name}`, file);
      }
    }
    const releases = records
      .filter((release) => release.status !== 'uploading' && release.status !== 'failed')
      .map((release) => ({
        id: release.id,
        path: release.path,
        runtimeVersion: release.runtimeVersion,
        timestamp: new Date(release.timestamp).toISOString(),
        size: filesByPath.get(release.path)?.metadata.size ?? 0,
        commitHash: release.commitHash,
        commitMessage: release.commitMessage,
        repositoryUrl: release.repositoryUrl ?? null,
        updateId: release.updateId,
        status: release.status,
        publications: release.publications ?? [],
        archiveAvailable: filesByPath.has(release.path),
      }));

    res.status(200).json({ releases });
  } catch (error) {
    console.error('Failed to fetch releases:', error);
    res.status(500).json({ error: 'Failed to fetch releases' });
  }
}
