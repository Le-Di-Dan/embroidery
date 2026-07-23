import { test, expect, fetchJsonInPage } from './support/smoke-test';

test.describe('admin foundation smoke (through gateway)', () => {
  test('home renders the admin heading', async ({ page, pageErrors }) => {
    void pageErrors;
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Embroidery Commerce Admin');
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
