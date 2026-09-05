/**
 * The `APP12-V01` Playwright projects.
 *
 * ## Why these four live outside `playwright.config.ts`
 *
 * Not taste: `playwright.config.ts` stood at 389 lines before this checkpoint,
 * and four more projects with the reasoning they need would have carried it past
 * the 400-line hard limit in `CLAUDE.md` §6. The split is by checkpoint, which is
 * how that file has always been organised internally, so nothing moved and
 * nothing else changed — the config imports this array and spreads it where the
 * block used to be.
 *
 * ## What the four are, and why four rather than one
 *
 * The split is by **origin and by what each project has to build**, not by file
 * count. The public tour opens every anonymous Wave-1 Storefront route at three
 * viewports and needs no order at all; the commerce audit places a real one and
 * watches the secure surface; the Admin shell tour opens every operator route;
 * and the Admin order audit drives the six-state lifecycle, photographing the
 * operator's screen and the customer's at every state. Two origins, two
 * different setup costs.
 *
 * ## Every project sets its own viewport per navigation
 *
 * The audit is a responsive review at 1440/1024/390, so a project-level viewport
 * would be the wrong unit. The specs call `page.setViewportSize` themselves; the
 * size declared below is only what the first navigation opens at.
 *
 * ## Artifacts are off, and that is a security control
 *
 * The reason `APP12-S03`, `APP12-H01` and `APP12-H08` all record: the commerce
 * journey opens a live `ORDER_ACCESS` surface, and a trace, a video or a HAR of
 * one writes secret-bearing material to disk that outlives the disposable
 * database. Off unconditionally, so a *failure* cannot be the thing that creates
 * the artefact. The audit's own screenshots are taken deliberately by
 * `v01-evidence.mjs`, which refuses to photograph a page whose URL still carries
 * a credential.
 */
import { devices, type PlaywrightTestConfig } from '@playwright/test';

type Project = NonNullable<PlaywrightTestConfig['projects']>[number];

export function app12V01Projects(options: {
  readonly storefrontUrl: string;
  readonly adminUrl: string;
  readonly chromiumLaunch: Record<string, unknown>;
}): Project[] {
  const common = {
    ...devices['Desktop Chrome'],
    ...options.chromiumLaunch,
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  } as const;

  return [
    {
      name: 'app12-v01-public-chromium',
      testMatch: '**/app12/v01-storefront-public.audit.spec.ts',
      use: { ...common, baseURL: options.storefrontUrl },
    },
    {
      name: 'app12-v01-commerce-chromium',
      testMatch: '**/app12/v01-storefront-commerce.audit.spec.ts',
      use: { ...common, baseURL: options.storefrontUrl },
    },
    {
      name: 'app12-v01-admin-shell-chromium',
      testMatch: '**/app12/v01-admin-shell.audit.spec.ts',
      use: { ...common, baseURL: options.adminUrl },
    },
    {
      name: 'app12-v01-admin-order-chromium',
      testMatch: '**/app12/v01-admin-order.audit.spec.ts',
      use: { ...common, baseURL: options.adminUrl },
    },
  ] as Project[];
}
