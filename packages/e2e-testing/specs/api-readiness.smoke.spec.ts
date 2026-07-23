import { test, expect, fetchJsonInPage } from './support/smoke-test';

/**
 * Proves the API is reachable through the real gateway (not the direct API
 * port) and that readiness reflects a live disposable database. The request is
 * issued from inside the admin page, so it travels admin-host → gateway →
 * API → PostgreSQL on the gateway origin.
 */
test('api readiness is ready through the gateway', async ({ page, pageErrors }) => {
  void pageErrors;
  await page.goto('/');
  const readiness = await fetchJsonInPage(page, '/api/health/readiness');
  expect(readiness.status).toBe(200);
  const body = readiness.body as {
    status?: string;
    service?: string;
    database?: { status?: string };
  };
  expect(body.status).toBe('ready');
  expect(body.service).toBe('api');
  expect(body.database?.status).toBe('up');
});
