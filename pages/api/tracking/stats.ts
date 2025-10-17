import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';
import { getLogger } from '../../../apiUtils/logger';

const logger = getLogger('statsTrackingHandler');

interface TimeBasedStats {
  total: number;
  ios: number;
  android: number;
}

export interface StatsResponse {
  today: TimeBasedStats;
  thisWeek: TimeBasedStats;
  thisMonth: TimeBasedStats;
  allTime: TimeBasedStats;
  totalReleases: number;
}

export default async function statsTrackingHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  logger.info('Fetching time-based statistics');

  try {
    const database = DatabaseFactory.getDatabase();
    const allTrackings = await database.getAllTrackingRecords();
    const releases = await database.listReleases();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const calculateStats = (filterFn: (date: Date) => boolean): TimeBasedStats => {
      const filtered = allTrackings.filter((t) => filterFn(new Date(t.downloadTimestamp)));
      const ios = filtered.filter((t) => t.platform === 'ios').length;
      const android = filtered.filter((t) => t.platform === 'android').length;

      return {
        total: ios + android,
        ios,
        android,
      };
    };

    const today = calculateStats((date) => date >= todayStart);
    const thisWeek = calculateStats((date) => date >= weekStart);
    const thisMonth = calculateStats((date) => date >= monthStart);
    const allTime = calculateStats(() => true);

    res.status(200).json({
      today,
      thisWeek,
      thisMonth,
      allTime,
      totalReleases: releases.length,
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
}
