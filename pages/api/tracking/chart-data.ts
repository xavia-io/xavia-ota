import { NextApiRequest, NextApiResponse } from 'next';
import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';
import { getLogger } from '../../../apiUtils/logger';

const logger = getLogger('chartDataHandler');

interface DailyData {
  date: string;
  ios: number;
  android: number;
  total: number;
}

interface PlatformData {
  name: string;
  value: number;
  color: string;
}

export interface ChartDataResponse {
  dailyDownloads: DailyData[];
  platformDistribution: PlatformData[];
}

export default async function chartDataHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  logger.info('Fetching chart data');

  try {
    const database = DatabaseFactory.getDatabase();
    const allTrackings = await database.getAllTrackingRecords();

    // Son 7 günün verilerini al
    const now = new Date();
    const last7Days: DailyData[] = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      // download_timestamp kolonunu kullanarak filtreleme
      const dayTrackings = allTrackings.filter((t) => {
        const trackingDate = new Date(t.downloadTimestamp);
        return trackingDate >= date && trackingDate < nextDay;
      });

      const ios = dayTrackings.filter((t) => t.platform === 'ios').length;
      const android = dayTrackings.filter((t) => t.platform === 'android').length;

      last7Days.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        ios,
        android,
        total: ios + android,
      });
    }

    // Platform dağılımı (tüm zamanlar)
    const iosTotal = allTrackings.filter((t) => t.platform === 'ios').length;
    const androidTotal = allTrackings.filter((t) => t.platform === 'android').length;

    const platformDistribution: PlatformData[] = [
      { name: 'iOS', value: iosTotal, color: '#48BB78' },
      { name: 'Android', value: androidTotal, color: '#38B2AC' },
    ];

    res.status(200).json({
      dailyDownloads: last7Days,
      platformDistribution,
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
}
