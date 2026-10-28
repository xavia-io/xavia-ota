import { NextApiRequest, NextApiResponse } from 'next';

import { DatabaseFactory } from '../../../apiUtils/database/DatabaseFactory';

const PAGE_SIZE = 20;

export default async function runtimesHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const page = Number(req.query.page ?? '1');
  if (!Number.isSafeInteger(page) || page < 1 || search.length > 255) {
    res.status(400).json({ error: 'Invalid page or search' });
    return;
  }

  try {
    const { runtimes, total } = await DatabaseFactory.getDatabase().listRuntimeSummaries(
      search,
      PAGE_SIZE,
      (page - 1) * PAGE_SIZE
    );
    res.status(200).json({ runtimes, total, page, pageSize: PAGE_SIZE });
  } catch (error) {
    console.error('Failed to fetch runtimes:', error);
    res.status(500).json({ error: 'Failed to fetch runtimes' });
  }
}
