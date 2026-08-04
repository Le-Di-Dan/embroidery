/**
 * Normalization persistence (`APP3-W01A`).
 *
 * Every write states its own from-state in its own `WHERE` clause, exactly as
 * the inspection repository does and for the same reason: the runtime is
 * at-least-once, so two attempts at one Asset can overlap, and a guarded update
 * matching zero rows is not a retry — it is proof another attempt already moved
 * the row, and it fails closed.
 *
 * Two things this file must never do, both of which would be one line away:
 *
 * - **touch `assets.status`.** Normalization runs on an Asset that is already
 *   `ACCEPTED`; moving it would let an editor-safe job undo an inspection
 *   verdict.
 * - **touch a `THUMBNAIL` or `CATALOG_PREVIEW` row.** Every statement here is
 *   scoped to `kind = 'NORMALIZED'`, so the accepted APP2 outputs are outside
 *   this repository's reach rather than merely left alone.
 *
 * No object-storage call happens here and none may: an external call inside a
 * transaction holds a connection open for a network round trip.
 */
import { Injectable } from '@nestjs/common';
import { executeRaw, newId, sql } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';

import { NORMALIZED_OUTPUT_POLICY } from '../../domain/normalization-policy';
import type {
  AssetNormalizationRepository,
  AssociationFacts,
  FinalizeNormalizedInput,
  NormalizationSourceFacts,
  NormalizedDerivativeState,
  PrepareNormalizationInput,
  PreparedNormalization,
} from '../../domain/repositories/asset-normalization.repository';

const KIND = NORMALIZED_OUTPUT_POLICY.kind;

interface AssetRow extends Record<string, unknown> {
  readonly id: string;
  readonly storage_key: string;
  readonly mime_type: string;
  readonly size_bytes: string | number | bigint;
  readonly checksum: string | null;
  readonly status: string;
  readonly kind: string;
  readonly classification: string;
  readonly deleted_at: Date | string | null;
}

interface DerivativeRow extends Record<string, unknown> {
  readonly id: string;
  readonly status: string;
  readonly storage_key: string | null;
  readonly is_watermarked: boolean;
  readonly width_px: number | null;
  readonly height_px: number | null;
  readonly media_type: string | null;
  readonly byte_size: string | number | bigint | null;
}

interface AssociationRow extends Record<string, unknown> {
  readonly asset_id: string;
  readonly active: boolean;
}

const toBigInt = (value: string | number | bigint): bigint => BigInt(value);

function toSourceFacts(row: AssetRow): NormalizationSourceFacts {
  return {
    assetId: row.id,
    storageKey: row.storage_key,
    mediaType: row.mime_type,
    byteSize: toBigInt(row.size_bytes),
    checksum: row.checksum,
    status: row.status,
    kind: row.kind,
    classification: row.classification,
    deleted: row.deleted_at !== null,
  };
}

@Injectable()
export class SqlAssetNormalizationRepository
  extends DrizzleRepository
  implements AssetNormalizationRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async findSource(assetId: string): Promise<NormalizationSourceFacts | undefined> {
    return this.run('findSource', async () => {
      const [row] = await executeRaw<AssetRow>(
        this.db,
        sql`select id, storage_key, mime_type, size_bytes, checksum, status, kind,
                   classification, deleted_at
              from assets where id = ${assetId}`,
      );
      return row === undefined ? undefined : toSourceFacts(row);
    });
  }

  /**
   * The association's own facts, addressed **by its own id**.
   *
   * Never a lookup by Asset: `IMP-D046` PO-03 forbids scanning an Asset's
   * associations and choosing one, because that would let the worker find *some*
   * authorization for work whose actual trigger had gone.
   *
   * `active` is the lifecycle half of eligibility. A Product Side is current
   * while `retired_at` is null; the two design associations have no retirement
   * column of their own, so their owning row carries the fact — an archived
   * Template and a terminal Session both make their association stale.
   */
  async findAssociation(
    kind: 'PRODUCT_SIDE_BACKGROUND' | 'DESIGN_TEMPLATE_ASSET' | 'DESIGN_SESSION_ASSET',
    associationId: string,
  ): Promise<AssociationFacts | undefined> {
    return this.run('findAssociation', async () => {
      const statement =
        kind === 'PRODUCT_SIDE_BACKGROUND'
          ? sql`select s.background_asset_id as asset_id, (s.retired_at is null) as active
                  from product_sides s where s.id = ${associationId}`
          : kind === 'DESIGN_TEMPLATE_ASSET'
            ? sql`select a.asset_id, (t.archived_at is null) as active
                    from design_template_assets a
                    join design_templates t on t.id = a.design_template_id
                   where a.id = ${associationId}`
            : sql`select a.asset_id,
                         (s.status not in ('EXPIRED', 'DELETED')) as active
                    from design_session_assets a
                    join design_sessions s on s.id = a.session_id
                   where a.id = ${associationId}`;

      const [row] = await executeRaw<AssociationRow>(this.db, statement);
      return row === undefined ? undefined : { assetId: row.asset_id, active: row.active };
    });
  }

  /**
   * Locks the Asset, then claims or recovers the one NORMALIZED row.
   *
   * The lock is on the Asset rather than the derivative because the derivative
   * may not exist yet — two attempts racing to insert the first one would both
   * see nothing and both proceed, and only the partial unique index would catch
   * it, as a driver error mid-transaction rather than a decision here.
   *
   * `requiresCleanup` is true when a `PROCESSING` row already existed, meaning
   * an earlier attempt may have written bytes this attempt is about to replace.
   *
   * @requiresTransaction
   */
  async prepareOrRecover(input: PrepareNormalizationInput): Promise<PreparedNormalization> {
    this.requireTransaction('prepareOrRecover');
    return this.run('prepareOrRecover', async () => {
      const [asset] = await executeRaw<AssetRow>(
        this.db,
        sql`select id, storage_key, mime_type, size_bytes, checksum, status, kind,
                   classification, deleted_at
              from assets where id = ${input.assetId} for update`,
      );
      if (asset === undefined) {
        throw new Error('Asset disappeared between context validation and preparation.');
      }

      const [existing] = await executeRaw<DerivativeRow>(
        this.db,
        sql`select id, status, storage_key, is_watermarked, width_px, height_px,
                   media_type, byte_size
              from asset_derivatives
             where asset_id = ${input.assetId} and kind = ${KIND} and status <> 'FAILED'`,
      );

      if (existing?.status === 'READY') {
        // An authoritative result already exists. Whether it *satisfies* this
        // request is the use case's decision, because only it knows whether the
        // triggering association still holds.
        return { kind: 'REPLAY_READY', storageKey: existing.storage_key ?? input.expectedKey };
      }

      if (existing === undefined) {
        await executeRaw(
          this.db,
          sql`insert into asset_derivatives (id, asset_id, kind, status, is_watermarked)
              values (${newId()}, ${input.assetId}, ${KIND}, 'PROCESSING', false)`,
        );
        return { kind: 'PROCESS', source: toSourceFacts(asset), requiresCleanup: false };
      }

      // PENDING or PROCESSING from an earlier attempt: take it over.
      await executeRaw(
        this.db,
        sql`update asset_derivatives
               set status = 'PROCESSING', updated_at = ${input.at}
             where id = ${existing.id} and status <> 'READY'`,
      );
      return { kind: 'PROCESS', source: toSourceFacts(asset), requiresCleanup: true };
    });
  }

  /**
   * The one statement that makes the derivative usable.
   *
   * Storage identity, `READY` and all four canonical metadata fields land
   * together, guarded on the row still being this attempt's `PROCESSING` claim.
   * `ck_asset_derivatives__ready_normalized_metadata` would refuse a partial
   * quartet anyway; writing it in one statement means that CHECK proves the
   * invariant rather than discovering a bug.
   *
   * @requiresTransaction
   */
  async finalizeReady(input: FinalizeNormalizedInput): Promise<void> {
    this.requireTransaction('finalizeReady');
    return this.run('finalizeReady', async () => {
      const rows = await executeRaw<{ id: string }>(
        this.db,
        sql`update asset_derivatives
               set status = 'READY',
                   storage_key = ${input.storageKey},
                   checksum = ${input.checksum},
                   width_px = ${input.widthPx},
                   height_px = ${input.heightPx},
                   media_type = ${input.mediaType},
                   byte_size = ${input.byteSize.toString()},
                   is_watermarked = false,
                   updated_at = ${input.at}
             where asset_id = ${input.assetId}
               and kind = ${KIND}
               and status = 'PROCESSING'
         returning id`,
      );
      if (rows.length !== 1) {
        // Another attempt finalized or failed this claim first. Failing closed
        // is the only safe answer: the alternative is two workers each believing
        // they produced the authoritative bytes.
        throw new Error('Normalization claim was no longer held at finalization.');
      }
    });
  }

  /** @requiresTransaction */
  async failClaim(assetId: string, at: Date): Promise<void> {
    this.requireTransaction('failClaim');
    return this.run('failClaim', async () => {
      await executeRaw(
        this.db,
        sql`update asset_derivatives
               set status = 'FAILED', updated_at = ${at}
             where asset_id = ${assetId} and kind = ${KIND} and status = 'PROCESSING'`,
      );
    });
  }

  async findNormalized(assetId: string): Promise<NormalizedDerivativeState | undefined> {
    return this.run('findNormalized', async () => {
      const [row] = await executeRaw<DerivativeRow>(
        this.db,
        sql`select id, status, storage_key, is_watermarked, width_px, height_px,
                   media_type, byte_size
              from asset_derivatives
             where asset_id = ${assetId} and kind = ${KIND} and status <> 'FAILED'`,
      );
      if (row === undefined) return undefined;
      return {
        id: row.id,
        status: row.status,
        storageKey: row.storage_key,
        isWatermarked: row.is_watermarked,
        widthPx: row.width_px,
        heightPx: row.height_px,
        mediaType: row.media_type,
        byteSize: row.byte_size === null ? null : toBigInt(row.byte_size),
      };
    });
  }
}
