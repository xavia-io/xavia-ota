import { createHmac, timingSafeEqual } from 'crypto';
import { NextApiRequest, NextApiResponse } from 'next';

const COOKIE_NAME = 'xavia_admin_session';
const MAX_AGE_SECONDS = 12 * 60 * 60;

function sign(expiresAt: string, password: string): string {
  return createHmac('sha256', password).update(`xavia-admin:${expiresAt}`).digest('hex');
}

export function setAdminSession(res: NextApiResponse, password: string): void {
  const expiresAt = String(Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS);
  const token = `${expiresAt}.${sign(expiresAt, password)}`;
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`
  );
}

export function hasAdminSession(req: NextApiRequest): boolean {
  const password = process.env.ADMIN_PASSWORD;
  const token = req.cookies[COOKIE_NAME];
  if (!password || !token) return false;

  const [expiresAt, providedSignature, extra] = token.split('.');
  if (extra || !/^\d+$/.test(expiresAt ?? '') || !/^[0-9a-f]{64}$/.test(providedSignature ?? '')) {
    return false;
  }
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;

  const actual = Buffer.from(providedSignature, 'hex');
  const expected = Buffer.from(sign(expiresAt, password), 'hex');
  return timingSafeEqual(actual, expected);
}
