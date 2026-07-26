import { test, expect, fetchJsonInPage } from './support/smoke-test';

test.describe('admin foundation smoke (through gateway)', () => {
  test('an unauthenticated visit is routed to the login screen', async ({ page, pageErrors }) => {
    void pageErrors;
    // Since APP1-A01-C1/A02 the Admin is protected: the unauthenticated home
    // redirects to `/login`, whose heading is the login title. (The authenticated
    // shell and the full route matrix are proven by the APP1-E01 admin specs.)
    await page.goto('/');
    expect(new URL(page.url()).pathname).toBe('/login');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Đăng nhập');
  });

  test('healthz reports ok through the gateway', async ({ page, pageErrors }) => {
    void pageErrors;
    await page.goto('/');
    const health = await fetchJsonInPage(page, '/healthz');
    expect(health.status).toBe(200);
    expect((health.body as { status?: string; service?: string }).status).toBe('ok');
    expect((health.body as { service?: string }).service).toBe('admin');
  });
});
