import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';
import { getLogger } from '../../../apiUtils/logger';
import { withAdminAuth } from '../../../apiUtils/helpers/AdminAuthHelper';

const logger = getLogger('trackingByReleaseHandler');

async function trackingByReleaseHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { release_id } = req.query;

  logger.info(`Fetching tracking data for release`, { release_id });

  if (!release_id || typeof release_id !== 'string') {
    res.status(400).json({ error: 'Release ID is required' });
    return;
  }

  try {
    const database = DatabaseFactory.getDatabase();
    const trackings = await database.getReleaseTrackingMetrics(release_id);

    res.status(200).json(trackings);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ error: 'Failed to fetch tracking data' });
  }
}

export default withAdminAuth(trackingByReleaseHandler);
