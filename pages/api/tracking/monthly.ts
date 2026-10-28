import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';
import { getLogger } from '../../../apiUtils/logger';

const logger = getLogger('monthlyTracking');

export default async function monthlyTracking(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Expected GET.' });
    return;
  }
  try {
    const installations = await DatabaseFactory.getDatabase().getMonthlyInstallationMetrics();
    res.status(200).json({ installations });
  } catch (error) {
    logger.error('Failed to fetch monthly installation metrics', { error });
    res.status(500).json({ error: 'Failed to fetch monthly installation metrics' });
  }
}
