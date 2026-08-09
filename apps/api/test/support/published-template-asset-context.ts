/**
 * The live harness for published Template asset delivery (`APP3-B05A` §21).
 *
 * Composes the existing public-media context — real `AppModule`, disposable
 * PostgreSQL, disposable MinIO — and adds the one thing those suites have no
 * reason to know: how to stand up a *published Design Template* whose current
 * version places a piece of Template artwork.
 *
 * Everything above the Asset goes through accepted boundaries. The Template is
 * created, scoped, saved and published by the real `APP3-B03`/`B03A`/`B03B`/`B04`
 * services, so `design_template_assets` is written by the production save path
 * and the association under test is the one production produces. Only the
 * `TEMPLATE_SOURCE` original is inserted directly:
 * `FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01` is open, and `APP3-B05A` invents no
 * intake to close it.
 *
 * Extracted from the delivery suite so the two halves — transport and revocation
 * — share one seeder instead of one file crossing the 600-line test limit.
 *
 * Test-only.
 */
import { get as httpGet, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';

import { createPublicMediaContext, type PublicMediaTestContext } from './public-media-context';
import { asAdmin, seedAdminId, seedPublishableProduct } from './product-publication-fixtures';
import { areaCommand, seedBackgroundAsset, sideCommand } from './product-placement-fixtures';
import {
  seedTemplateAsset,
  templateAssetPath,
  templateDocument,
  type SeededTemplateAsset,
} from './design-template-delivery-fixtures';
import { ProductPlacementService } from '../../src/modules/catalog/application/product-placement.service';
import { ProductPublicationService } from '../../src/modules/catalog/application/product-publication.service';
import { DesignTemplateDraftService } from '../../src/modules/design/application/design-template-draft.service';
import { DesignTemplateLifecycleUseCase } from '../../src/modules/design/application/design-template-lifecycle.use-case';
import { SaveTemplateDocumentUseCase } from '../../src/modules/design/application/save-template-document.use-case';

/** Distinct content, so "the right object" is provable rather than plausible. */
export const ARTWORK = Buffer.from('TEMPLATE-ARTWORK-'.repeat(48), 'utf8');
export const SECOND_ARTWORK = Buffer.from('SECOND-ARTWORK-'.repeat(32), 'utf8');
export const SANITIZED_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><path d="M0 0h800v600H0z"/></svg>',
  'utf8',
);
export const NORMALIZED = 'NORMALIZED';

export interface HttpResult {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: Buffer;
}

export interface SeededTemplate {
  readonly templateId: string;
  readonly slug: string;
  readonly version: number;
  readonly currentVersion: number;
  readonly productId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
  readonly artwork: SeededTemplateAsset;
  readonly path: string;
}

export interface SeedOptions {
  readonly bytes?: Buffer;
  readonly asset?: Parameters<typeof seedTemplateAsset>[1];
}

export interface PublishedTemplateAssetContext {
  readonly media: PublicMediaTestContext;
  readonly lifecycle: DesignTemplateLifecycleUseCase;
  readonly publication: ProductPublicationService;
  readonly save: SaveTemplateDocumentUseCase;
  readonly drafts: DesignTemplateDraftService;
  /** Runs `work` with an ADMIN actor bound, the way every write path expects. */
  admin<T>(work: () => Promise<T>): Promise<T>;
  fetchPath(path: string): Promise<HttpResult>;
  rows<T extends Record<string, unknown>>(statement: ReturnType<typeof sql>): Promise<T[]>;
  count(table: string): Promise<number>;
  seedPublished(options?: SeedOptions): Promise<SeededTemplate>;
  /** The document of a seeded Template, so a suite can re-save it with or without the image. */
  documentFor(seeded: SeededTemplate, images: readonly SeededTemplateAsset[]): unknown;
  close(): Promise<void>;
}

/**
 * The concurrency token a lifecycle or save command expects.
 *
 * `0` for a header that has no version yet: `APP3-B03`'s projection answers with
 * an absent object rather than a `0`, because there is no version zero.
 */
export const versionOf = (view: {
  readonly currentVersion?: { readonly version: number };
}): number => view.currentVersion?.version ?? 0;

export async function createPublishedTemplateAssetContext(
  label: string,
): Promise<PublishedTemplateAssetContext> {
  const media = await createPublicMediaContext(label);
  const adminId = await seedAdminId(media.api);
  const placement = media.api.app.get(ProductPlacementService);
  const publication = media.api.app.get(ProductPublicationService);
  const drafts = media.api.app.get(DesignTemplateDraftService);
  const save = media.api.app.get(SaveTemplateDocumentUseCase);
  const lifecycle = media.api.app.get(DesignTemplateLifecycleUseCase);

  const server = media.api.app.getHttpServer() as Server;
  if (!server.listening) await new Promise<void>((resolve) => server.listen(0, resolve));
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const admin = <T>(work: () => Promise<T>): Promise<T> => asAdmin(media.api, adminId, work);

  const fetchPath = (path: string): Promise<HttpResult> =>
    new Promise((resolve, reject) => {
      httpGet(`${origin}${path}`, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
      }).on('error', reject);
    });

  const rows = <T extends Record<string, unknown>>(statement: ReturnType<typeof sql>) =>
    media.api.database.client.db.execute(statement).then((result) => result.rows as T[]);

  const count = async (table: string): Promise<number> => {
    const [row] = await rows<{ n: string }>(sql`select count(*)::text as n from ${sql.raw(table)}`);
    return Number(row?.n ?? '0');
  };

  const documentFor = (seeded: SeededTemplate, images: readonly SeededTemplateAsset[]): unknown =>
    templateDocument(
      { productSideId: seeded.productSideId, embroideryAreaId: seeded.embroideryAreaId },
      images,
    );

  async function seedPublished(options: SeedOptions = {}): Promise<SeededTemplate> {
    const bytes = options.bytes ?? ARTWORK;
    const product = await admin(() => seedPublishableProduct(media.api));
    const backgroundAssetId = await seedBackgroundAsset(media.api, { byteSize: bytes.length });
    await media.putDerivative(backgroundAssetId, NORMALIZED, bytes);

    const view = await admin(() =>
      placement.replace({
        productId: product.productId,
        expectedUpdatedAt: new Date(product.updatedAt),
        sides: [sideCommand({ backgroundAssetId, areas: [areaCommand()] })],
      }),
    );
    await admin(() =>
      publication.publish({
        productId: product.productId,
        expectedUpdatedAt: new Date(view.updatedAt),
      }),
    );

    const side = view.sides[0];
    const area = side?.areas[0];
    if (side === undefined || area === undefined) throw new Error('The fixture seeded no area.');

    const artwork = await seedTemplateAsset(media.api, {
      byteSize: bytes.length,
      ...options.asset,
    });
    await media.putDerivative(artwork.assetId, NORMALIZED, bytes);

    const created = await admin(() =>
      drafts.create({
        name: `Mẫu thêu ${artwork.assetId.slice(0, 8)}`,
        productId: product.productId,
        productSideId: side.id,
        embroideryAreaId: area.id,
      }),
    );

    const document = templateDocument({ productSideId: side.id, embroideryAreaId: area.id }, [
      artwork,
    ]);
    const saved = await admin(() =>
      save.save({
        templateId: created.templateId,
        expectedCurrentVersion: versionOf(created),
        document,
      }),
    );
    const currentVersion = versionOf(saved);

    const published = await admin(() =>
      lifecycle.publish({ templateId: created.templateId, expectedCurrentVersion: currentVersion }),
    );

    return {
      templateId: created.templateId,
      slug: published.slug,
      version: currentVersion,
      currentVersion,
      productId: product.productId,
      productSideId: side.id,
      embroideryAreaId: area.id,
      artwork,
      path: templateAssetPath(published.slug, currentVersion, artwork.assetId),
    };
  }

  return {
    media,
    lifecycle,
    publication,
    save,
    drafts,
    admin,
    fetchPath,
    rows,
    count,
    seedPublished,
    documentFor,
    close: () => media.close(),
  };
}
