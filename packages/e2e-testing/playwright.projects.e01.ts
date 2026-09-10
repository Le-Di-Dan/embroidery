/**
 * The `APP12-E01` Playwright projects.
 *
 * ## Why these two live outside `playwright.config.ts`
 *
 * The same reason `playwright.projects.v01.ts` gives, and `CLAUDE.md` §6 /
 * `APP12-E01` §24 make binding: that file is already past the 400-line hard
 * limit, so a checkpoint may not add to it. The split is by checkpoint, which is
 * how the config has always been organised internally — it imports this array
 * and spreads it where the block would have gone.
 *
 * ## Three projects, split by who is looking and by which transport
 *
 * The **commerce** project places real orders over a real SMTP boundary and
 * proves the composition and the delivered link. The **review** project reaches
 * `PAYMENT_UNDER_REVIEW` on the recording topology and scans it — deliberately
 * a separate world, so an accessibility result is never hostage to a delivery
 * defect in an unrelated transport. The **public** project opens the same
 * Storefront as an anonymous visitor and asserts CSP, the security headers and
 * the public SEO truth.
 *
 * They are separate projects rather than two describes in one, and the reason is
 * not tidiness. A public-surface assertion made in a context that has already
 * held an `ORDER_ACCESS` grant or an operator session is worthless: it would
 * report a page as publicly correct when it was only correct for someone already
 * signed in. Separate projects mean separate browser contexts by construction,
 * so there is no state to forget to clear.
 *
 * ## Artifacts are off, and that is a security control
 *
 * The commerce journey's first navigation carries a live `ORDER_ACCESS` token in
 * a URL fragment. A trace, a video or a HAR would record it into a file that
 * outlives the disposable database the rest of the run is so careful to drop.
 * `APP12-S03` established this rule; E01 inherits it, and applies it to the
 * public project too — those cases assert, they do not illustrate.
 */
import { devices, type Project } from '@playwright/test';

export function app12E01Projects(options: {
  readonly storefrontUrl: string;
  readonly chromiumLaunch: Record<string, unknown>;
}): Project[] {
  const common = {
    ...devices['Desktop Chrome'],
    ...options.chromiumLaunch,
    baseURL: options.storefrontUrl,
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  } as const;

  return [
    {
      name: 'app12-e01-commerce-chromium',
      testMatch: '**/app12/e01-commerce.acceptance.spec.ts',
      use: { ...common },
    },
    {
      name: 'app12-e01-review-chromium',
      testMatch: '**/app12/e01-review.acceptance.spec.ts',
      use: { ...common },
    },
    {
      name: 'app12-e01-public-chromium',
      testMatch: '**/app12/e01-public.acceptance.spec.ts',
      use: { ...common },
    },
  ];
}
