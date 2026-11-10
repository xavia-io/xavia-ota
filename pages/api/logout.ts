import { NextApiRequest, NextApiResponse } from 'next';

import { clearAdminSessionCookie } from '../../apiUtils/helpers/AdminAuthHelper';

export default async function logoutEndpoint(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  clearAdminSessionCookie(res);
  res.status(200).json({ success: true });
}
