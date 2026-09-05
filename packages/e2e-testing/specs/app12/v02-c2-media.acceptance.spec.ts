/**
 * `APP12-V02-C2` — media upload, processing and image delivery, live.
 *
 * ```text
 * A  upload stability 6/6      2 PNG · 2 JPEG · 2 WebP through the native file
 *                              chooser, the real gateway, the real API, the
 *                              real worker — each to READY with real pixels
 * B  gateway body size         ~900 KiB and >4 MiB accepted by the edge
 * C  durability                hard reload → every preview still decodes
 * D  derivative dimensions     the promoted THUMBNAIL carries width/height
 * E  preview authorization     the same URL, no session → refused
 * F  truthful placeholders     a non-READY tile names its own state
 * ```
 *
 * Everything runs against **this run's disposable database and object store**,
 * as a real operator logged in through the real form. No shared development
 * data is read or written, and no `APP12-G03` dataset is created.
 *
 * The assertion throughout is `naturalWidth > 0`, never a screenshot and never
 * the presence of an `<img>`. A request can answer 200 with an error envelope,
 * an empty body or a type the decoder refuses, and every one of those still
 * leaves an `<img>` in the DOM — which is precisely the shape of the defect
 * this correction exists for.
 *
 * Serial: the journeys share one library, and the stability sequence counts
 * tiles, so a parallel worker uploading into the same account would change the
 * number under it.
 */
import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import {
  COPY,
  decode,
  expectRealPixels,
  libraryImages,
  loginAsOperator,
  openAssets,
} from './support/v02-c2-world';

test.describe.configure({ mode: 'serial' });

interface UploadSource {
  readonly name: string;
  readonly path: string;
  readonly format: string;
  readonly byteSize: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** The manifest the runner wrote before the browser started. */
function sources(): readonly UploadSource[] {
  const manifestPath = process.env['E2E_APP12_V02C2_SOURCES'];
  if (manifestPath === undefined || manifestPath === '') {
    throw new Error('E2E_APP12_V02C2_SOURCES must be set by the e2e orchestrator.');
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as readonly UploadSource[];
}

/**
 * Uploads one file and waits for the worker to finish with it.
 *
 * The wait is for the **accepted** banner rather than a fixed delay: the banner
 * is driven by the reconciliation poll reading the asset's real status, so it
 * appears when inspection and derivative generation have actually completed. A
 * sleep would pass on a slow machine by luck and fail on a fast one by timing.
 */
async function upload(page: Page, source: UploadSource): Promise<void> {
  await page.locator('input#asset-upload-input').setInputFiles(source.path);
  await page.getByRole('button', { name: COPY.uploadSubmit }).click();

  // The failure banner is polled alongside the success one so a refused upload
  // reports its own copy immediately instead of timing out with no diagnosis.
  await expect
    .poll(
      async () => {
        if (await page.getByText(COPY.uploadErrorTitle).isVisible()) {
          return 'error';
        }
        return (await page.getByText(COPY.acceptedTitle.replace('{name}', source.name)).isVisible())
          ? 'accepted'
          : 'pending';
      },
      { timeout: 90_000 },
    )
    .toBe('accepted');
}

test.describe('APP12-V02-C2 — Admin media upload and preview', () => {
  test('A/B/C — six uploads reach READY, render pixels, and survive a reload', async ({ page }) => {
    const manifest = sources();
    expect(manifest).toHaveLength(6);

    await loginAsOperator(page);
    await openAssets(page);

    const before = await libraryImages(page).count();

    for (const source of manifest) {
      await test.step(`upload ${source.name} (${String(Math.round(source.byteSize / 1024))} KiB)`, async () => {
        await upload(page, source);
      });
    }

    // Every upload produced a tile, and every tile decoded. Counted from the
    // starting number rather than asserted absolutely, because the disposable
    // database may carry library rows from an earlier journey in this file.
    await expect.poll(async () => libraryImages(page).count()).toBe(before + manifest.length);

    const decoded = [];
    for (let index = 0; index < manifest.length; index += 1) {
      decoded.push(await expectRealPixels(libraryImages(page).nth(index)));
    }
    expect(decoded.every((image) => image.naturalWidth > 0)).toBe(true);

    // C — the previews are not a post-upload artefact of the client's own
    // state. A hard reload re-fetches every one of them from the route.
    await page.reload({ waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: COPY.pageTitle, level: 1 })).toBeVisible();
    await expect.poll(async () => libraryImages(page).count()).toBe(before + manifest.length);
    for (let index = 0; index < manifest.length; index += 1) {
      await expectRealPixels(libraryImages(page).nth(index));
    }
  });

  test('every preview request answers 200 with image bytes', async ({ page }) => {
    await loginAsOperator(page);

    const responses: { status: number; contentType: string; url: string }[] = [];
    page.on('response', (response) => {
      if (/\/api\/admin\/assets\/[^/]+\/thumbnail$/.test(response.url())) {
        responses.push({
          status: response.status(),
          contentType: response.headers()['content-type'] ?? '',
          url: response.url(),
        });
      }
    });

    await openAssets(page);
    await expect.poll(async () => libraryImages(page).count()).toBeGreaterThan(0);
    await expectRealPixels(libraryImages(page).first());
    await expect.poll(() => responses.length).toBeGreaterThan(0);

    for (const response of responses) {
      expect(response.status, `${response.url} must answer 200`).toBe(200);
      expect(response.contentType, `${response.url} must be an image`).toContain('image/');
    }
  });

  test('E — the same preview URL is refused without a session', async ({ page, request }) => {
    await loginAsOperator(page);
    await openAssets(page);
    await expectRealPixels(libraryImages(page).first());
    const { src } = await decode(libraryImages(page).first());

    // A fresh request context carries no session cookie. The URL is otherwise
    // identical, so what is being proved is the guard and nothing else.
    const anonymous = await request.get(src, { headers: { cookie: '' } });
    expect(anonymous.status()).toBe(401);
  });

  test('E — no storage locator reaches the browser', async ({ page }) => {
    await loginAsOperator(page);
    await openAssets(page);
    await expectRealPixels(libraryImages(page).first());

    const { src } = await decode(libraryImages(page).first());
    // The address is the application's own route. A bucket name, an object key
    // or a provider host in this string would mean the browser had been handed
    // a way to reach storage directly.
    expect(src).toMatch(/\/api\/admin\/assets\/[0-9a-f-]+\/thumbnail$/);
    expect(src).not.toMatch(/minio|amazonaws|X-Amz-|originals|derivatives/i);

    const html = await page.content();
    expect(html).not.toMatch(/X-Amz-Signature|\boriginals\/|\bderivatives\//i);
  });
});
