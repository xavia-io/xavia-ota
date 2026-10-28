import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';

export default async function runtimeMetricsHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { runtimeVersion } = req.query;
  if (typeof runtimeVersion !== 'string' || !runtimeVersion) {
    res.status(400).json({ error: 'Runtime version is required' });
    return;
  }

  try {
    const metrics = await DatabaseFactory.getDatabase().getRuntimeInstallationMetrics(
      runtimeVersion
    );
    res.status(200).json(metrics);
  } catch (error) {
    console.error('Failed to fetch runtime metrics:', error);
    res.status(500).json({ error: 'Failed to fetch runtime metrics' });
  }
}
