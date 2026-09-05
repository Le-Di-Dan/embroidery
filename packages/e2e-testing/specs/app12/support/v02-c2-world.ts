/**
 * `APP12-V02-C2` — the shared vocabulary of the media journeys.
 *
 * Everything here is read from the delivered Vietnamese locale rather than
 * retyped, so a copy change breaks the import instead of silently making a
 * selector match nothing. The images are generated in-process: a real PNG,
 * JPEG and WebP with real pixel content, because the correction is about bytes
 * surviving the whole chain and a zero-byte stand-in proves none of it.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import admin from '../../../../i18n/messages/vi/admin.json';

export const ASSETS_PATH = '/assets';

export const COPY = {
  pageTitle: admin.assets.page.title,
  collectionLabel: admin.assets.page.collectionLabel,
  uploadInputLabel: admin.assets.upload.inputLabel,
  uploadSubmit: admin.assets.upload.submit,
  acceptedTitle: admin.assets.accepted.title,
  uploadErrorTitle: admin.assets.uploadError.title,
  // The tile captions live at app-shared scope: three Admin features draw the
  // same tile, so the words for its states cannot belong to one of them.
  thumbnailAlt: admin.media.thumbnailAlt,
  thumbnailProcessing: admin.media.processing,
  thumbnailUnavailable: admin.media.unavailable,
  statusReady: admin.assets.status.ready,
  logoutName: admin.shell.logout.action,
} as const;

const LOGIN = {
  emailInput: '#staff-login-email',
  passwordInput: '#staff-login-password',
  submitName: admin.login.submit.default,
} as const;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} must be set by the e2e orchestrator.`);
  }
  return value;
}

/**
 * Logs in through the real form.
 *
 * The fill runs under `toPass` for the reason `a01-world` documents: the inputs
 * are React-controlled, and a fill that lands before hydration is discarded
 * when the client adopts the DOM, so the submit would carry empty credentials.
 */
export async function loginAsOperator(page: Page): Promise<void> {
  await page.goto('/login');
  await expect(async () => {
    await page.locator(LOGIN.emailInput).fill(requiredEnv('E2E_ADMIN_EMAIL'));
    await page.locator(LOGIN.passwordInput).fill(requiredEnv('E2E_ADMIN_PASSWORD'));
    await expect(page.locator(LOGIN.emailInput)).not.toHaveValue('');
    await expect(page.locator(LOGIN.passwordInput)).not.toHaveValue('');
  }).toPass({ timeout: 30_000 });

  await page.getByRole('button', { name: LOGIN.submitName }).click();
  await expect(page.getByRole('button', { name: COPY.logoutName })).toBeVisible();
}

export async function openAssets(page: Page): Promise<void> {
  await page.goto(ASSETS_PATH);
  await expect(page.getByRole('heading', { name: COPY.pageTitle, level: 1 })).toBeVisible();
}

/**
 * Every tile image currently in the library grid.
 *
 * The class is `asset-card__thumb__image` because the shared tile component
 * derives it from the block its host passes in (`asset-card__thumb`), so this
 * selector follows the component's naming rather than the feature's.
 */
export function libraryImages(page: Page): Locator {
  return page
    .getByRole('list', { name: COPY.collectionLabel })
    .locator('img.asset-card__thumb__image');
}

/**
 * What the browser actually decoded for one image.
 *
 * `naturalWidth` is the assertion that matters: a request can answer 200 with
 * an error page, a zero-byte body or a type the decoder refuses, and every one
 * of those still yields a rendered `<img>` element. Only a non-zero natural
 * size proves pixels exist.
 */
export interface DecodedImage {
  readonly src: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly renderedWidth: number;
  readonly renderedHeight: number;
}

export async function decode(image: Locator): Promise<DecodedImage> {
  return image.evaluate((node) => {
    const img = node as HTMLImageElement;
    const box = img.getBoundingClientRect();
    return {
      src: img.currentSrc || img.src,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      renderedWidth: Math.round(box.width),
      renderedHeight: Math.round(box.height),
    };
  });
}

/** Asserts an image is genuinely showing pixels, not an empty box. */
export async function expectRealPixels(image: Locator): Promise<DecodedImage> {
  await expect(image).toBeVisible();
  await expect
    .poll(async () => (await decode(image)).naturalWidth, { timeout: 20_000 })
    .toBeGreaterThan(0);

  const decoded = await decode(image);
  expect(decoded.naturalHeight).toBeGreaterThan(0);
  expect(decoded.renderedWidth).toBeGreaterThan(0);
  expect(decoded.renderedHeight).toBeGreaterThan(0);
  return decoded;
}
