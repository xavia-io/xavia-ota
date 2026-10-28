import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../../../apiUtils/database/DatabaseFactory';

export default async function releaseMetricsHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { releaseId } = req.query;
  if (typeof releaseId !== 'string' || !releaseId) {
    res.status(400).json({ error: 'Release ID is required' });
    return;
  }

  try {
    const metrics = await DatabaseFactory.getDatabase().getReleaseMetricsHierarchy(releaseId);
    if (metrics.length === 0) {
      res.status(404).json({ error: 'Release not found' });
      return;
    }
    res.status(200).json({ metrics });
  } catch (error) {
    console.error('Failed to fetch release metrics:', error);
    res.status(500).json({ error: 'Failed to fetch release metrics' });
  }
}
