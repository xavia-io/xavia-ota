import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../apiUtils/database/DatabaseFactory';
import { Release } from '../../apiUtils/database/DatabaseInterface';
import { hasAdminSession } from '../../apiUtils/helpers/AdminSession';
import { HashHelper } from '../../apiUtils/helpers/HashHelper';
import { ZipHelper } from '../../apiUtils/helpers/ZipHelper';
import { StorageFactory } from '../../apiUtils/storage/StorageFactory';

async function updateIdFor(release: Release): Promise<string> {
  if (release.updateId) return release.updateId;
  const zip = await ZipHelper.getZipFromStorage(release.path.replace(/\.zip$/, ''));
  const metadata = await ZipHelper.getFileFromZip(zip, 'metadata.json');
  return HashHelper.convertSHA256HashToUUID(HashHelper.createHash(metadata, 'sha256', 'hex'));
}

async function archiveExists(path: string): Promise<boolean> {
  const slash = path.lastIndexOf('/');
  if (slash < 0) return false;
  const files = await StorageFactory.getStorage().listFiles(path.slice(0, slash));
  return files.some((file) => file.name === path.slice(slash + 1));
}

export default async function rollbackHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!hasAdminSession(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const input = req.method === 'GET' ? req.query : req.body;
  const { path, runtimeVersion } = input || {};
  if (typeof path !== 'string' || !path) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }
  if (typeof runtimeVersion !== 'string' || !runtimeVersion) {
    res.status(400).json({ error: 'Missing runtimeVersion' });
    return;
  }
  const expectedActiveReleaseId = req.method === 'POST' ? input.expectedActiveReleaseId : null;
  if (
    req.method === 'POST' &&
    (typeof expectedActiveReleaseId !== 'string' || !expectedActiveReleaseId)
  ) {
    res.status(400).json({ error: 'Missing expectedActiveReleaseId' });
    return;
  }

  try {
    const database = DatabaseFactory.getDatabase();
    const target = await database.getReleaseByPath(path);
    if (!target || target.runtimeVersion !== runtimeVersion) {
      res.status(404).json({ error: 'Inactive release not found' });
      return;
    }
    if (target.status === 'active') {
      res.status(409).json({ error: 'Selected release is already active' });
      return;
    }
    if (target.status !== 'inactive') {
      res.status(404).json({ error: 'Inactive release not found' });
      return;
    }
    const current = await database.getLatestReleaseRecordForRuntimeVersion(runtimeVersion);
    if (!current) {
      res.status(409).json({ error: 'No active release for this runtime' });
      return;
    }
    const available = await archiveExists(target.path);
    const [currentUpdateId, targetUpdateId] = await Promise.all([
      updateIdFor(current),
      available ? updateIdFor(target) : Promise.resolve(target.updateId ?? null),
    ]);
    const sameUpdate = Boolean(targetUpdateId && currentUpdateId === targetUpdateId);

    if (req.method === 'GET') {
      const metrics = await database.getReleaseTrackingMetrics(current.id);
      res.status(200).json({
        runtimeVersion,
        current: {
          id: current.id,
          commitHash: current.commitHash,
          updateId: current.servedUpdateId ?? currentUpdateId,
          timestamp: current.timestamp,
        },
        target: {
          commitHash: target.commitHash,
          updateId: targetUpdateId,
          timestamp: target.timestamp,
        },
        estimatedAffectedInstallations: metrics.reduce((count, metric) => count + metric.count, 0),
        archiveAvailable: available,
        blockedReason: !available
          ? 'Archive is unavailable'
          : sameUpdate
          ? 'Target has the same update ID as the active release'
          : null,
      });
      return;
    }

    if (!available || sameUpdate) {
      res.status(409).json({
        error: !available
          ? 'Archive is unavailable'
          : 'Target has the same update ID as the active release',
      });
      return;
    }
    if (!targetUpdateId) {
      res.status(409).json({ error: 'Target update ID is unavailable' });
      return;
    }
    if (!current.updateId) await database.setReleaseUpdateId(current.id, currentUpdateId);
    if (!target.updateId) await database.setReleaseUpdateId(target.id, targetUpdateId);
    // No new release row and no archive copy: the target gets a new publication (update ID) instead.
    const result = await database.rollbackToRelease(target.id, expectedActiveReleaseId as string);
    if (result.outcome !== 'activated') {
      res.status(result.outcome === 'not_found' ? 404 : 409).json({
        error:
          result.outcome === 'active_changed'
            ? 'Active release changed. Review the rollback again.'
            : result.outcome,
      });
      return;
    }
    res.status(200).json({ success: true, path: target.path, updateId: result.updateId });
  } catch (error) {
    console.error('Rollback error:', error);
    res.status(500).json({ error: 'Rollback failed' });
  }
}
