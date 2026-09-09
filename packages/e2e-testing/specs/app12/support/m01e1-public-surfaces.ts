/**
 * How `APP12-M01.E1` reads the five public surfaces, and the disposable-world
 * inspections its cross-boundary journeys compare them against.
 *
 * Split out of `m01e1-world.ts` when that file crossed the 400-line source
 * limit, and split **here** rather than at an arbitrary line: everything in this
 * file answers one question — *which image is this Product showing, and where
 * does storage say it should be?* — while the file next door owns the run's
 * identity, its operator session and its evidence.
 *
 * Never imported by application code.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { E1, databaseUrl, sf } from './m01e1-world';

/**
 * The id inside a public media address.
 *
 * It is the **`product_media` row's own id**, not the Asset's:
 * `publicProductMediaPath({ slug, productMediaId, rendition })` is what the
 * projection composes. The distinction is the whole point of §11 — the claim is
 * that one *association* drives every surface — and comparing these ids against
 * `product_media.asset_id` reports a mismatch on a page that is entirely
 * correct, which is exactly what the first version of this suite did.
 */
export function mediaIdOf(url: string): string {
  const match = /\/media\/([0-9a-f-]{36})\//.exec(url);
  if (match?.[1] === undefined) {
    throw new Error(`Not a public product-media address: ${url}`);
  }
  return match[1];
}

/**
 * The four public surfaces that must agree on one image.
 *
 * Read as *association ids* rather than as URLs, because the question §11 and §12 both
 * ask is "which association is each surface using", and two surfaces can name
 * one association through two different renditions — the card renders
 * `thumbnail` and the detail stage renders `catalog-preview`. Comparing the
 * addresses would report a difference that is not one; comparing the ids is the
 * comparison actually being made.
 */
export interface PublicPrimaries {
  readonly card: string;
  readonly detailFirst: string;
  readonly stage: string;
  readonly ogImage: string;
  readonly jsonLdFirst: string;
  /** The addresses the ids were read from, for a failure that has to be explained. */
  readonly raw: { readonly card: string; readonly stage: string; readonly ogImage: string };
}

/** The Discover card for one Product, found by the address it links to. */
export function discoverCard(page: Page, slug: string): Locator {
  return page.locator(`a.discover__card[href$="/san-pham/${slug}"]`);
}

async function metaContent(page: Page, selector: string): Promise<string> {
  const value = await page.locator(selector).first().getAttribute('content');
  if (value === null || value === '') {
    throw new Error(`No content on ${selector}`);
  }
  return value;
}

/** Every JSON-LD document on the page, parsed. */
export async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.map((text) => JSON.parse(text) as Record<string, unknown>);
}

export async function productJsonLd(page: Page): Promise<Record<string, unknown>> {
  const doc = (await jsonLd(page)).find((entry) => entry['@type'] === 'Product');
  if (doc === undefined) {
    throw new Error('The page published no Product JSON-LD document.');
  }
  return doc;
}

/**
 * Reads all five public answers for one Product, in one pass over two pages.
 *
 * The Discover read is filtered to this run's own category. `/kham-pha` is a
 * paginated feed over every published Product in the disposable world — the A1,
 * S1 and E1 fixtures all live there — so an unfiltered first page is not
 * guaranteed to contain the card being asked about, and a card that is merely
 * absent from page one would read exactly like a card whose image is wrong.
 */
export async function readPublicPrimaries(page: Page, slug: string): Promise<PublicPrimaries> {
  await page.goto(sf(`/kham-pha?category=${E1.categorySlug()}`), {
    waitUntil: 'domcontentloaded',
  });
  const card = discoverCard(page, slug);
  await expect(card, `the Discover feed must carry a card for ${slug}`).toHaveCount(1);
  const cardSrc = await card.locator('img.discover__card-image').getAttribute('src');
  if (cardSrc === null) {
    throw new Error(`The Discover card for ${slug} rendered no image.`);
  }

  await page.goto(sf(`/san-pham/${slug}`), { waitUntil: 'domcontentloaded' });
  // The page reached is the page asked for. Cheap, and it is the difference
  // between "the surfaces disagree with storage" and "the harness read the
  // wrong Product" — two findings that look identical at the assertion.
  await expect(page).toHaveURL(new RegExp(`/san-pham/${slug}(?:[?#]|$)`));
  const stageSrc = await page.locator('.product-detail__stage-image').getAttribute('src');
  if (stageSrc === null) {
    throw new Error(`The Product Detail stage for ${slug} rendered no image.`);
  }
  const ogImage = await metaContent(page, 'meta[property="og:image"]');
  const images = (await productJsonLd(page))['image'];
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error(`The Product JSON-LD for ${slug} published no image list.`);
  }

  // The detail array's first entry is what the strip's first control addresses,
  // which is the rendered proof that `media[0]` is what the page received.
  const firstThumb = await page
    .locator('.product-detail__thumbnail-image')
    .first()
    .getAttribute('src');

  return {
    card: mediaIdOf(cardSrc),
    detailFirst: mediaIdOf(firstThumb ?? stageSrc),
    stage: mediaIdOf(stageSrc),
    ogImage: mediaIdOf(ogImage),
    jsonLdFirst: mediaIdOf(String(images[0])),
    raw: { card: cardSrc, stage: stageSrc, ogImage },
  };
}

/** Every surface named the same association. */
export function agreedPrimary(primaries: PublicPrimaries): boolean {
  const { raw: _raw, ...ids } = primaries;
  const values = Object.values(ids);
  return values.every((value) => value === values[0]);
}

/** Every Product row carrying a slug — diagnostic, for an id/slug mismatch. */
export async function describeSlug(slug: string): Promise<unknown[]> {
  const { describeSlug: describe } =
    (await import('../../../support/app12/m01e1-world-mutations.mjs')) as {
      describeSlug: (input: { databaseUrl: string; slug: string }) => Promise<unknown[]>;
    };
  return describe({ databaseUrl: databaseUrl(), slug });
}

/** Which Product a media association belongs to — diagnostic, so a mismatch names its cause. */
export async function describeMediaOwners(mediaId: string): Promise<unknown[]> {
  const { describeMediaOwners: describe } =
    (await import('../../../support/app12/m01e1-world-mutations.mjs')) as {
      describeMediaOwners: (input: { databaseUrl: string; mediaId: string }) => Promise<unknown[]>;
    };
  return describe({ databaseUrl: databaseUrl(), mediaId });
}

/**
 * Makes one Asset ineligible for every public surface, or restores it.
 *
 * `assetEligibility()` compares `assets.status` to `ACCEPTED` exactly, so this
 * is the real Asset authority the read path consults — not a `product_media`
 * edit, which is precisely what §12 forbids. Imported dynamically for the same
 * reason `A1` journey E imports its own: an `.mjs` support module has no types
 * to import at the top of a TypeScript spec.
 */
export async function setAssetStatus(assetId: string, status: 'ACCEPTED' | 'REJECTED') {
  const { setAssetStatus: write } =
    (await import('../../../support/app12/m01e1-world-mutations.mjs')) as {
      setAssetStatus: (input: {
        databaseUrl: string;
        assetId: string;
        status: string;
      }) => Promise<void>;
    };
  await write({ databaseUrl: databaseUrl(), assetId, status });
}

/**
 * Removes one derivative kind from an Asset, for §10's missing-derivative case.
 *
 * A different state from a rejected Asset, and the refusal it produces is a
 * different code — which is why it is a separate case rather than a second way
 * of writing the first.
 */
export async function dropDerivative(assetId: string, kind: string): Promise<unknown> {
  const { dropDerivative: drop } =
    (await import('../../../support/app12/m01e1-world-mutations.mjs')) as {
      dropDerivative: (input: {
        databaseUrl: string;
        assetId: string;
        kind: string;
      }) => Promise<unknown>;
    };
  return drop({ databaseUrl: databaseUrl(), assetId, kind });
}

/** Puts back what {@link dropDerivative} removed, so the next case starts clean. */
export async function restoreDerivative(row: unknown): Promise<void> {
  const { restoreDerivative: restore } =
    (await import('../../../support/app12/m01e1-world-mutations.mjs')) as {
      restoreDerivative: (input: { databaseUrl: string; row: unknown }) => Promise<void>;
    };
  await restore({ databaseUrl: databaseUrl(), row });
}
