import crypto from 'crypto';
import { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';

export const ADMIN_SESSION_COOKIE = 'xavia_admin_session';
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

function sha256(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

export function safeEqual(received: unknown, expected: string | undefined): boolean {
  if (typeof received !== 'string' || !received || !expected) {
    return false;
  }
  return crypto.timingSafeEqual(sha256(received), sha256(expected));
}

function signSessionExpiry(expiresAt: number, adminPassword: string): string {
  return crypto
    .createHmac('sha256', adminPassword)
    .update(`xavia-admin-session:${expiresAt}`)
    .digest('hex');
}

export function createAdminSessionToken(adminPassword: string, now = Date.now()): string {
  const expiresAt = now + ADMIN_SESSION_TTL_SECONDS * 1000;
  return `${expiresAt}.${signSessionExpiry(expiresAt, adminPassword)}`;
}

export function isValidAdminSessionToken(
  token: unknown,
  adminPassword: string | undefined,
  now = Date.now()
): boolean {
  if (typeof token !== 'string' || !adminPassword) {
    return false;
  }
  const [expiresAtRaw, signature] = token.split('.');
  const expiresAt = Number(expiresAtRaw);
  if (!signature || !Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    return false;
  }
  return safeEqual(signature, signSessionExpiry(expiresAt, adminPassword));
}

function readBearerToken(req: NextApiRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') {
    return null;
  }
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export function isAdminRequest(req: NextApiRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return false;
  }
  if (safeEqual(readBearerToken(req), adminPassword)) {
    return true;
  }
  return isValidAdminSessionToken(req.cookies?.[ADMIN_SESSION_COOKIE], adminPassword);
}

function sessionCookieAttributes(maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export function setAdminSessionCookie(res: NextApiResponse, adminPassword: string): void {
  res.setHeader(
    'Set-Cookie',
    `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken(adminPassword)}; ${sessionCookieAttributes(
      ADMIN_SESSION_TTL_SECONDS
    )}`
  );
}

export function clearAdminSessionCookie(res: NextApiResponse): void {
  res.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=; ${sessionCookieAttributes(0)}`);
}

export function withAdminAuth(handler: NextApiHandler): NextApiHandler {
  return async (req, res) => {
    if (!isAdminRequest(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    return handler(req, res);
  };
}
