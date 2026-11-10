import { NextApiRequest, NextApiResponse } from 'next';

import { safeEqual, setAdminSessionCookie } from '../../apiUtils/helpers/AdminAuthHelper';

export default async function loginEndpoint(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    res.status(500).json({ error: 'Admin password not configured' });
    return;
  }

  if (safeEqual(password, adminPassword)) {
    setAdminSessionCookie(res, adminPassword);
    res.status(200).json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
}
