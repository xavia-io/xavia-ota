import { NextApiHandler } from 'next';
import { Body, Cookies, createMocks, Headers, Query, RequestMethod } from 'node-mocks-http';

import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from '../apiUtils/helpers/AdminAuthHelper';
import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';
import loginEndpoint from '../pages/api/login';
import logoutEndpoint from '../pages/api/logout';
import releasesHandler from '../pages/api/releases';
import rollbackHandler from '../pages/api/rollback';
import trackingByReleaseHandler from '../pages/api/tracking/[release_id]';
import allTrackingHandler from '../pages/api/tracking/all';

jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/storage/StorageFactory');

const ADMIN_PASSWORD = 'test-admin-password';

interface AdminRoute {
  name: string;
  handler: NextApiHandler;
  method: RequestMethod;
  query?: Query;
  body?: Body;
}

const adminRoutes: AdminRoute[] = [
  { name: 'GET /api/releases', handler: releasesHandler, method: 'GET' },
  {
    name: 'POST /api/rollback',
    handler: rollbackHandler,
    method: 'POST',
    body: { path: 'updates/1.0.0/old.zip', runtimeVersion: '1.0.0', commitHash: 'abc123' },
  },
  { name: 'GET /api/tracking/all', handler: allTrackingHandler, method: 'GET' },
  {
    name: 'GET /api/tracking/[release_id]',
    handler: trackingByReleaseHandler,
    method: 'GET',
    query: { release_id: 'release-1' },
  },
];

function mockBackends() {
  const storage = {
    listDirectories: jest.fn().mockResolvedValue([]),
    listFiles: jest.fn().mockResolvedValue([]),
    copyFile: jest.fn().mockResolvedValue(true),
  };
  const database = {
    listReleases: jest.fn().mockResolvedValue([]),
    createRelease: jest.fn().mockResolvedValue(true),
    getReleaseTrackingMetrics: jest.fn().mockResolvedValue([]),
    getReleaseTrackingMetricsForAllReleases: jest.fn().mockResolvedValue([]),
  };
  (StorageFactory.getStorage as jest.Mock).mockReturnValue(storage);
  (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue(database);
  return { storage, database };
}

function backendCallCount({ storage, database }: ReturnType<typeof mockBackends>) {
  return [...Object.values(storage), ...Object.values(database)].reduce(
    (total, mock) => total + mock.mock.calls.length,
    0
  );
}

describe('Admin routes authentication', () => {
  const originalPassword = process.env.ADMIN_PASSWORD;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  });

  afterAll(() => {
    process.env.ADMIN_PASSWORD = originalPassword;
  });

  describe.each(adminRoutes)('$name', ({ handler, method, query, body }) => {
    async function call(options: { headers?: Headers; cookies?: Cookies } = {}) {
      const backends = mockBackends();
      const { req, res } = createMocks({ method, query, body, ...options });
      await handler(req, res);
      return { status: res._getStatusCode(), backendCalls: backendCallCount(backends) };
    }

    it('rejects a request without credentials and touches no storage or database', async () => {
      const result = await call();
      expect(result.status).toBe(401);
      expect(result.backendCalls).toBe(0);
    });

    it('rejects a wrong bearer password', async () => {
      const result = await call({ headers: { authorization: 'Bearer wrong-password' } });
      expect(result.status).toBe(401);
      expect(result.backendCalls).toBe(0);
    });

    it('rejects the upload key used as an admin credential', async () => {
      const result = await call({
        headers: { authorization: `Bearer ${process.env.UPLOAD_KEY}` },
      });
      expect(result.status).toBe(401);
    });

    it('rejects a tampered session cookie', async () => {
      const [expiresAt] = createAdminSessionToken(ADMIN_PASSWORD).split('.');
      const result = await call({ cookies: { [ADMIN_SESSION_COOKIE]: `${expiresAt}.deadbeef` } });
      expect(result.status).toBe(401);
    });

    it('rejects an expired session cookie', async () => {
      const expired = createAdminSessionToken(ADMIN_PASSWORD, Date.now() - 13 * 60 * 60 * 1000);
      const result = await call({ cookies: { [ADMIN_SESSION_COOKIE]: expired } });
      expect(result.status).toBe(401);
    });

    it('rejects a session signed with another password', async () => {
      const result = await call({
        cookies: { [ADMIN_SESSION_COOKIE]: createAdminSessionToken('old-password') },
      });
      expect(result.status).toBe(401);
    });

    it('rejects everything when the admin password is not configured', async () => {
      process.env.ADMIN_PASSWORD = '';
      const result = await call({ headers: { authorization: 'Bearer ' } });
      expect(result.status).toBe(401);
      expect(result.backendCalls).toBe(0);
    });

    it('accepts the admin password as a bearer token', async () => {
      const result = await call({ headers: { authorization: `Bearer ${ADMIN_PASSWORD}` } });
      expect(result.status).toBe(200);
      expect(result.backendCalls).toBeGreaterThan(0);
    });

    it('accepts a valid session cookie', async () => {
      const result = await call({
        cookies: { [ADMIN_SESSION_COOKIE]: createAdminSessionToken(ADMIN_PASSWORD) },
      });
      expect(result.status).toBe(200);
      expect(result.backendCalls).toBeGreaterThan(0);
    });
  });

  it('login with the right password sets an HttpOnly, SameSite=Strict session cookie that opens admin routes', async () => {
    const login = createMocks({ method: 'POST', body: { password: ADMIN_PASSWORD } });
    await loginEndpoint(login.req, login.res);

    expect(login.res._getStatusCode()).toBe(200);
    const setCookie = String(login.res.getHeader('Set-Cookie'));
    expect(setCookie).toContain(`${ADMIN_SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/api');

    const token = setCookie.split(';')[0].split('=')[1];
    mockBackends();
    const releases = createMocks({ method: 'GET', cookies: { [ADMIN_SESSION_COOKIE]: token } });
    await releasesHandler(releases.req, releases.res);
    expect(releases.res._getStatusCode()).toBe(200);
  });

  it('login with a wrong password sets no cookie', async () => {
    const { req, res } = createMocks({ method: 'POST', body: { password: 'wrong' } });
    await loginEndpoint(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(res.getHeader('Set-Cookie')).toBeUndefined();
  });

  it('logout clears the session cookie', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await logoutEndpoint(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(String(res.getHeader('Set-Cookie'))).toContain('Max-Age=0');
  });
});
