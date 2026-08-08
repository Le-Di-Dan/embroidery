/**
 * Fixtures for the live autosave suite (`APP3-B08` §12/§13).
 *
 * No disposable MinIO. Autosave performs no object-storage I/O at all — media
 * eligibility is decided from canonical persistence metadata (`IMP-D044`) — so
 * the non-connecting placeholders `createApiIntegrationContext` already installs
 * are enough to boot `AppModule`. Adding a container would only prove that the
 * suite can start one.
 *
 * Rows are inserted directly rather than through three application services, for
 * the reason the `APP3-B06A` suite gives: this suite is about what a save does,
 * and routing every fixture through the publication flow would make a failure
 * there read as a failure here.
 */
import { randomBytes } from 'node:crypto';

import { sql } from '@embroidery/database';

import { DesignSessionSecretVerifier } from '../../src/modules/design/infrastructure/crypto/design-session-secret.verifier';
import {
  createApiIntegrationContext,
  DESIGN_SESSION_TEST_ORIGIN,
  type ApiIntegrationTestContext,
} from './api-integration-context';

/** The one placement every fixture session is opened against. */
export const PLACEMENT_GEOMETRY = Object.freeze({
  canvasWidthPx: 1000,
  canvasHeightPx: 1200,
  physicalWidthMm: 400,
  physicalHeightMm: 480,
  pxPerMm: 2.5,
  boundXPx: 100,
  boundYPx: 150,
  boundWidthPx: 400,
  boundHeightPx: 300,
  maxWidthMm: 160,
  maxHeightMm: 120,
});

export interface SeededSession {
  readonly sessionId: string;
  readonly productSideId: string;
  readonly embroideryAreaId: string;
  readonly secret: string;
}

export interface AutosaveTestContext {
  readonly api: ApiIntegrationTestContext;
  rows<T>(statement: ReturnType<typeof sql>): Promise<T[]>;
  seedSession(options?: { status?: string; expiresIn?: string }): Promise<SeededSession>;
  /** A READY NORMALIZED derivative on a CUSTOMER_UPLOAD asset of that session. */
  seedSessionImage(
    sessionId: string,
    options?: { associate?: boolean; kind?: string; status?: string; measured?: boolean },
  ): Promise<{ assetId: string; derivativeId: string }>;
  cookieFor(session: SeededSession): string;
  close(): Promise<void>;
}

export async function createAutosaveContext(label: string): Promise<AutosaveTestContext> {
  const api = await createApiIntegrationContext(label);
  const verifier = api.app.get(DesignSessionSecretVerifier);

  const exec = (statement: ReturnType<typeof sql>) => api.database.client.db.execute(statement);
  const rows = async <T>(statement: ReturnType<typeof sql>): Promise<T[]> =>
    (await exec(statement)).rows as T[];

  return {
    api,
    rows,
    cookieFor: (session) => `__Host-nettheu_ds_${session.sessionId}=${session.secret}`,
    close: () => api.close(),

    seedSession: async (options = {}): Promise<SeededSession> => {
      const secret = randomBytes(32).toString('base64url');
      const ids = {
        asset: crypto.randomUUID(),
        category: crypto.randomUUID(),
        product: crypto.randomUUID(),
        side: crypto.randomUUID(),
        area: crypto.randomUUID(),
        session: crypto.randomUUID(),
      };
      const g = PLACEMENT_GEOMETRY;
      await exec(sql`insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
            values (${ids.asset}, 'CATALOG_MEDIA', 'PUBLIC', ${`catalog/${ids.asset}.png`},
                    'image/png', 1024, 'ACCEPTED')`);
      await exec(sql`insert into categories (id, name, slug, status, display_order, is_indexable)
            values (${ids.category}, 'Fixture', ${`c-${ids.category}`}, 'PUBLISHED', 1, true)`);
      await exec(sql`insert into products
              (id, category_id, name, slug, base_price_amount, currency_code, status,
               is_display_out_of_stock, display_order, is_indexable)
            values (${ids.product}, ${ids.category}, 'Fixture Tee', ${`t-${ids.product}`}, 150000,
                    'VND', 'PUBLISHED', false, 1, true)`);
      await exec(sql`insert into product_sides
              (id, product_id, code, name, background_asset_id, image_width_px, image_height_px,
               physical_width_mm, physical_height_mm, px_per_mm, display_order)
            values (${ids.side}, ${ids.product}, 'front', 'Front', ${ids.asset},
                    ${g.canvasWidthPx}, ${g.canvasHeightPx}, ${g.physicalWidthMm},
                    ${g.physicalHeightMm}, ${g.pxPerMm}, 1)`);
      await exec(sql`insert into embroidery_areas
              (id, product_side_id, code, name, bound_x_px, bound_y_px, bound_width_px,
               bound_height_px, max_width_mm, max_height_mm, display_order)
            values (${ids.area}, ${ids.side}, 'chest', 'Chest', ${g.boundXPx}, ${g.boundYPx},
                    ${g.boundWidthPx}, ${g.boundHeightPx}, ${g.maxWidthMm}, ${g.maxHeightMm}, 1)`);
      await exec(sql`insert into design_sessions (id, session_secret_hash, product_id, product_side_id,
                                         embroidery_area_id, design_document, document_schema_version,
                                         autosave_revision, status, expires_at, last_activity_at)
            values (${ids.session}, ${verifier.digest(secret)}, ${ids.product}, ${ids.side},
                    ${ids.area}, '{}'::jsonb, 1, 0, ${options.status ?? 'ACTIVE'},
                    now() + cast(${options.expiresIn ?? '30 days'} as interval), now())`);

      return {
        sessionId: ids.session,
        productSideId: ids.side,
        embroideryAreaId: ids.area,
        secret,
      };
    },

    seedSessionImage: async (sessionId, options = {}) => {
      const assetId = crypto.randomUUID();
      const derivativeId = crypto.randomUUID();
      await exec(sql`insert into assets (id, kind, classification, storage_key, mime_type, size_bytes, status)
            values (${assetId}, 'CUSTOMER_UPLOAD', 'CUSTOMER_PRIVATE',
                    ${`sessions/${assetId}.png`}, 'image/png', 2048, 'ACCEPTED')`);
      if (options.associate !== false) {
        await exec(sql`insert into design_session_assets (id, session_id, asset_id)
              values (${crypto.randomUUID()}, ${sessionId}, ${assetId})`);
      }
      // The quartet moves as a unit: all four or none. `measured: false` is how
      // a not-yet-measured derivative is expressed, never a partial row.
      const measured = options.measured !== false;
      await exec(sql`insert into asset_derivatives
              (id, asset_id, kind, status, storage_key, is_watermarked,
               width_px, height_px, media_type, byte_size)
            values (${derivativeId}, ${assetId}, ${options.kind ?? 'NORMALIZED'},
                    ${options.status ?? 'READY'}, ${`derivatives/${derivativeId}.webp`}, false,
                    ${measured ? 800 : null}, ${measured ? 600 : null},
                    ${measured ? 'image/webp' : null}, ${measured ? 4096 : null})`);
      return { assetId, derivativeId };
    },
  };
}

export { DESIGN_SESSION_TEST_ORIGIN };
