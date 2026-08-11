/**
 * Row shapes and reads for the Asset aggregate (APP2-W01 §19).
 *
 * Split out of the repository so that file states the *lifecycle* and this one
 * states the *shapes*: what a row looks like coming off the driver, and how it
 * becomes a domain value. Statements go through the sanctioned raw-SQL boundary
 * (`executeRaw` + the `sql` tag, ADR-DB1-002) because the worker application
 * deliberately does not depend on the ORM or the driver — the rule the I02 test
 * harness already follows. Every value travels as a bound parameter.
 */
import { executeRaw, sql } from '@embroidery/database';
import type { AssetDerivativeState } from '@embroidery/database';
import type { DatabaseExecutorHandle } from '@embroidery/persistence';

import {
  resolveInspectionLane,
  type AssetInspectionLane,
} from '../../domain/asset-inspection-lane';
import { contradiction } from '../../domain/inspection-contradiction';
import type {
  AssetSourceFacts,
  DerivativeRowState,
} from '../../domain/repositories/asset-inspection.repository';
import type { InspectionRow } from './terminal-replay';

export interface AssetRow {
  readonly id: string;
  readonly kind: string;
  readonly classification: string;
  readonly storage_key: string;
  readonly mime_type: string;
  /**
   * Selected as text. `int8` reaches the driver as a string regardless, and
   * saying so in the statement beats depending on a default that a future
   * type-parser change could move under us.
   */
  readonly size_bytes: string;
  readonly checksum: string | null;
  readonly status: string;
}

interface DerivativeRow {
  readonly kind: string;
  readonly status: string;
  readonly storage_key: string | null;
  readonly checksum: string | null;
  readonly is_watermarked: boolean;
}

export function toSourceFacts(row: AssetRow): AssetSourceFacts {
  return {
    assetId: row.id,
    storageKey: row.storage_key,
    mediaType: row.mime_type,
    byteSize: BigInt(row.size_bytes),
    checksum: row.checksum,
  };
}

function toDerivativeState(row: DerivativeRow): DerivativeRowState {
  return {
    kind: row.kind,
    status: row.status as AssetDerivativeState,
    storageKey: row.storage_key,
    checksum: row.checksum,
    isWatermarked: row.is_watermarked,
  };
}

/** The asset row, locked for the duration of the caller's transaction. */
export async function lockAsset(db: DatabaseExecutorHandle, assetId: string): Promise<AssetRow> {
  const rows = await executeRaw<AssetRow>(
    db,
    sql`
      select id, kind, classification, storage_key, mime_type,
             size_bytes::text as size_bytes, checksum, status
        from assets
       where id = ${assetId}
       limit 1
         for update
    `,
  );
  return assertOwnedAsset(rows[0]);
}

export async function readAsset(db: DatabaseExecutorHandle, assetId: string): Promise<AssetRow> {
  const rows = await executeRaw<AssetRow>(
    db,
    sql`
      select id, kind, classification, storage_key, mime_type,
             size_bytes::text as size_bytes, checksum, status
        from assets
       where id = ${assetId}
       limit 1
    `,
  );
  return assertOwnedAsset(rows[0]);
}

/** Non-FAILED rows, locked. FAILED rows are lineage and are never re-used. */
export async function lockLiveDerivatives(
  db: DatabaseExecutorHandle,
  assetId: string,
): Promise<DerivativeRowState[]> {
  const rows = await executeRaw<DerivativeRow>(
    db,
    sql`
      select kind, status, storage_key, checksum, is_watermarked
        from asset_derivatives
       where asset_id = ${assetId} and status <> 'FAILED'
         for update
    `,
  );
  return rows.map(toDerivativeState);
}

export async function readDerivatives(
  db: DatabaseExecutorHandle,
  assetId: string,
): Promise<DerivativeRowState[]> {
  const rows = await executeRaw<DerivativeRow>(
    db,
    sql`
      select kind, status, storage_key, checksum, is_watermarked
        from asset_derivatives
       where asset_id = ${assetId}
    `,
  );
  return rows.map(toDerivativeState);
}

export async function readInspections(
  db: DatabaseExecutorHandle,
  assetId: string,
): Promise<InspectionRow[]> {
  const rows = await executeRaw<{ outcome: string; detail: string | null }>(
    db,
    sql`select outcome, detail from asset_inspections where asset_id = ${assetId} order by id`,
  );
  return rows.map((row) => ({ outcome: row.outcome, detail: row.detail }));
}

/**
 * Refuses an asset this handler does not own, and says which lane it is.
 *
 * The kind/classification **pair** is resolved on every read, not just the
 * first, and a pair matching no lane is still a stop: an Asset outside every
 * declared lane is work belonging to some pipeline with privacy rules this one
 * cannot know, and processing it under either lane's assumptions is precisely
 * the mistake the original two-literal check existed to prevent.
 *
 * What changed at `APP3-S06` is only the *number* of lanes. `CUSTOMER_UPLOAD` +
 * `CUSTOMER_PRIVATE` is now a lane this pipeline owns rather than foreign work;
 * `PUBLIC`, `TEMPLATE_SOURCE`, `PRODUCTION_FILE` and `GALLERY_MEDIA` are refused
 * exactly as before.
 */
export function laneOf(row: AssetRow | undefined): AssetInspectionLane {
  if (row === undefined) {
    throw contradiction('the asset does not exist');
  }
  const lane = resolveInspectionLane(row.kind, row.classification);
  if (lane === undefined) {
    throw contradiction('the asset belongs to no inspection lane');
  }
  return lane;
}

/** The same refusal, when the caller needs the row rather than the lane. */
export function assertOwnedAsset(row: AssetRow | undefined): AssetRow {
  laneOf(row);
  return row as AssetRow;
}

/** Every immutable source fact the terminal transaction re-verifies. */
export function assertUnchangedSource(asset: AssetRow, source: AssetSourceFacts): void {
  if (
    asset.mime_type !== source.mediaType ||
    BigInt(asset.size_bytes) !== source.byteSize ||
    asset.checksum !== source.checksum ||
    asset.storage_key !== source.storageKey
  ) {
    throw contradiction('source facts changed during processing');
  }
}
