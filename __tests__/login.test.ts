import { createMocks } from 'node-mocks-http';

import loginEndpoint from '../pages/api/login';

describe('Login API', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return 405 for non-POST requests', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await loginEndpoint(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should return 500 if admin password is not configured', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { password: 'test' },
    });

    process.env.ADMIN_PASSWORD = '';
    await loginEndpoint(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should return 401 for invalid password', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { password: 'wrong' },
    });

    process.env.ADMIN_PASSWORD = 'correct';
    await loginEndpoint(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });

  it('should return 200 for correct password', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { password: 'correct' },
    });

    process.env.ADMIN_PASSWORD = 'correct';
    await loginEndpoint(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toMatchSnapshot();
  });
});
