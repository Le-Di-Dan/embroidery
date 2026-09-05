/**
 * The worker's Asset lifecycle persistence (APP2-W01 §11, §15, §16, §18, §19).
 *
 * Every method here is one durable step, and every step re-reads under a row
 * lock rather than trusting what an earlier step observed. That is the whole
 * design: the runtime is at-least-once, so two attempts at the same asset can
 * overlap, and the only thing keeping the *effect* at-most-once is that each
 * write states its own from-state in its own `WHERE` clause. A guarded update
 * that matches zero rows is not a retry — it is proof another attempt already
 * moved the asset, and it fails closed.
 *
 * Row shapes and reads live in `asset-rows.ts`; this file is the state machine.
 *
 * No object-storage call happens here, and none may: an external call inside a
 * transaction holds a connection open for a network round trip and turns a
 * provider stall into a database incident.
 */
import { Injectable } from '@nestjs/common';
import { executeRaw, newId, sql } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';

import { laneDerivativeKinds, type AssetInspectionLane } from '../../domain/asset-inspection-lane';
import { contradiction, isContradiction } from '../../domain/inspection-contradiction';
import type {
  AssetInspectionRepository,
  FinalizeAcceptedInput,
  FinalizeRejectedInput,
  PrepareInput,
  PreparedWork,
  ProcessingSnapshot,
  TerminalEffect,
} from '../../domain/repositories/asset-inspection.repository';
import {
  assertUnchangedSource,
  laneOf,
  lockAsset,
  lockLiveDerivatives,
  readAsset,
  readDerivatives,
  readInspections,
  toSourceFacts,
  type AssetRow,
} from './asset-rows';
import { verifyAcceptedReplay, verifyRejectedReplay } from './terminal-replay';

@Injectable()
export class SqlAssetInspectionRepository
  extends DrizzleRepository
  implements AssetInspectionRepository
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /**
   * `run`, but a contradiction survives it.
   *
   * `DrizzleRepository.run` funnels the body through `withMappedErrors`, whose
   * job is to make sure no raw driver error ever escapes a repository — and it
   * does that by mapping *everything* it catches to a `PersistenceError`. A
   * contradiction thrown inside therefore came out as the generic "the
   * operation could not be completed", and the use case, seeing an ordinary
   * persistence failure, retried an asset whose state nothing could reconcile.
   * The live suite caught it; the unit doubles never could, because they are
   * not wrapped by the mapper at all.
   *
   * So the contradiction crosses the mapper as a *value* and is re-thrown
   * outside it. It is still thrown inside the caller's transaction — the
   * boundary is opened by the use case, not here — so a finalization that
   * contradicts still rolls back. Real driver errors keep their mapping.
   */
  private async guarded<T>(operation: string, work: () => Promise<T>): Promise<T> {
    const outcome = await this.run(
      operation,
      async (): Promise<{ ok: true; value: T } | { ok: false; reason: string }> => {
        try {
          return { ok: true, value: await work() };
        } catch (error: unknown) {
          if (isContradiction(error)) {
            return { ok: false, reason: error.reason };
          }
          throw error;
        }
      },
    );
    if (!outcome.ok) {
      throw contradiction(outcome.reason);
    }
    return outcome.value;
  }

  async prepareOrRecover(input: PrepareInput): Promise<PreparedWork> {
    return this.guarded('prepareOrRecover', async () => {
      // Asserted before the first read: every branch below, including the two
      // read-only replay branches, must observe one consistent snapshot.
      this.requireTransaction('prepareOrRecover');
      const asset = await lockAsset(this.db, input.assetId);
      // Resolved from the locked row, so every branch below — and the whole
      // attempt that follows — is bound to one reading of the Asset's lane.
      const lane = laneOf(asset);

      switch (asset.status) {
        case 'INSPECTING':
          return this.prepareDerivatives(asset, lane, input.at);
        case 'ACCEPTED': {
          const keys = verifyAcceptedReplay(
            await readInspections(this.db, input.assetId),
            await readDerivatives(this.db, input.assetId),
            input.expectedKeys,
            lane,
          );
          return { kind: 'REPLAY_ACCEPTED', derivativeKeys: keys };
        }
        case 'REJECTED':
          verifyRejectedReplay(
            await readInspections(this.db, input.assetId),
            await readDerivatives(this.db, input.assetId),
            lane,
          );
          return { kind: 'REPLAY_REJECTED' };
        default:
          throw contradiction('asset is not in an inspectable or terminal state');
      }
    });
  }

  async loadProcessingSnapshot(assetId: string): Promise<ProcessingSnapshot> {
    return this.guarded('loadProcessingSnapshot', async () => {
      const asset = await readAsset(this.db, assetId);
      return {
        source: toSourceFacts(asset),
        status: asset.status,
        derivatives: await readDerivatives(this.db, assetId),
        terminalInspectionCount: (await readInspections(this.db, assetId)).length,
      };
    });
  }

  async finalizeAccepted(input: FinalizeAcceptedInput): Promise<void> {
    return this.guarded('finalizeAccepted', async () => {
      this.requireTransaction('finalizeAccepted');
      const asset = await lockAsset(this.db, input.assetId);
      if (asset.status !== 'INSPECTING') {
        throw contradiction('asset left INSPECTING before its accepted finalization');
      }
      assertUnchangedSource(asset, input.source);

      const live = await lockLiveDerivatives(this.db, input.assetId);
      for (const kind of laneDerivativeKinds(laneOf(asset))) {
        const row = live.find((entry) => entry.kind === kind);
        if (row === undefined || row.status !== 'PROCESSING') {
          throw contradiction('a prepared derivative is no longer PROCESSING');
        }
      }

      // The four metadata columns are written here and only here. The encoder
      // measured them (`DerivativeGenerationService.measure`) and they travelled
      // this far unused, so `APP12-H05-C1` published an intrinsic size that the
      // catalog lane never stored: every THUMBNAIL and CATALOG_PREVIEW row was
      // NULL, and its CLS correction was inert for all of them. They are set
      // together because `ck_asset_derivatives__metadata_all_or_none` accepts
      // all four or none — a partial write is rejected by the database, which is
      // exactly the guarantee the projection reads back.
      for (const derivative of input.derivatives) {
        const promoted = await executeRaw<{ id: string }>(
          this.db,
          sql`
            update asset_derivatives
               set status = 'READY',
                   storage_key = ${derivative.storageKey},
                   checksum = ${derivative.checksum},
                   is_watermarked = false,
                   width_px = ${derivative.width},
                   height_px = ${derivative.height},
                   media_type = ${derivative.mediaType},
                   byte_size = ${derivative.byteSize},
                   updated_at = ${input.at}
             where asset_id = ${input.assetId}
               and kind = ${derivative.kind}
               and status = 'PROCESSING'
             returning id
          `,
        );
        if (promoted.length !== 1) {
          throw contradiction('a prepared derivative could not be promoted to READY');
        }
      }

      await this.appendInspection(input.assetId, 'ACCEPTED', input.detail, input.at);
      await this.transitionAsset(input.assetId, 'ACCEPTED', input.at);
    });
  }

  async finalizeRejected(input: FinalizeRejectedInput): Promise<void> {
    return this.guarded('finalizeRejected', async () => {
      this.requireTransaction('finalizeRejected');
      const asset = await lockAsset(this.db, input.assetId);
      if (asset.status !== 'INSPECTING') {
        throw contradiction('asset left INSPECTING before its rejected finalization');
      }

      const live = await lockLiveDerivatives(this.db, input.assetId);
      if (live.some((row) => row.status === 'READY')) {
        // A READY derivative is a resolvable reference. It cannot survive a
        // rejection, and it cannot be quietly deleted either — the combination
        // means an earlier attempt believed this asset was fine.
        throw contradiction('rejection would leave a READY derivative behind');
      }

      await executeRaw(
        this.db,
        sql`
          update asset_derivatives
             set status = 'FAILED', updated_at = ${input.at}
           where asset_id = ${input.assetId} and status <> 'FAILED'
        `,
      );
      await this.appendInspection(input.assetId, 'REJECTED', input.detail, input.at);
      await this.transitionAsset(input.assetId, 'REJECTED', input.at);
    });
  }

  async loadTerminalEffect(assetId: string): Promise<TerminalEffect | undefined> {
    return this.guarded('loadTerminalEffect', async () => {
      const rows = await executeRaw<{ status: string }>(
        this.db,
        sql`select status from assets where id = ${assetId} limit 1`,
      );
      const asset = rows[0];
      if (asset === undefined) {
        return undefined;
      }
      const inspections = await readInspections(this.db, assetId);
      return {
        status: asset.status,
        outcomes: inspections.map((entry) => entry.outcome),
        details: inspections.map((entry) => entry.detail),
        derivatives: await readDerivatives(this.db, assetId),
      };
    });
  }

  /**
   * Inserts or recovers this lane's rows as `PENDING`, then guards each one
   * through `PENDING → PROCESSING` (§11.4-§11.6).
   *
   * Never inserted directly as `PROCESSING`: LC-06 says a derivative starts
   * `PENDING`, and collapsing the two steps would also collapse the guard that
   * makes a concurrent second attempt lose instead of both proceeding.
   *
   * The Session lane owns no derivative, so this loop runs zero times and the
   * transaction prepares nothing but the decision to proceed. That is the
   * correct preparation for a lane whose inspection writes no object:
   * `requiresCleanup` stays false because no earlier attempt of this lane can
   * have written bytes under the asset's derivative prefix (`APP3-S06`).
   */
  private async prepareDerivatives(
    asset: AssetRow,
    lane: AssetInspectionLane,
    at: Date,
  ): Promise<PreparedWork> {
    const existing = await lockLiveDerivatives(this.db, asset.id);
    let requiresCleanup = false;

    for (const kind of laneDerivativeKinds(lane)) {
      const row = existing.find((entry) => entry.kind === kind);

      if (row !== undefined) {
        // Some earlier attempt reached this asset, so bytes may already exist
        // under its derivative prefix.
        requiresCleanup = true;
        if (row.isWatermarked) {
          throw contradiction('an existing catalog derivative is marked watermarked');
        }
        if (row.status === 'READY') {
          throw contradiction('an INSPECTING asset already has a READY derivative');
        }
        if (row.status === 'PROCESSING') {
          // Retry/replay state. It is already where this attempt needs it, and
          // moving it backwards would erase the fact that bytes may exist.
          continue;
        }
      } else {
        await executeRaw(
          this.db,
          sql`
            insert into asset_derivatives (id, asset_id, kind, status, is_watermarked)
            values (${newId()}, ${asset.id}, ${kind}, 'PENDING', false)
          `,
        );
      }

      const guarded = await executeRaw<{ id: string }>(
        this.db,
        sql`
          update asset_derivatives
             set status = 'PROCESSING', updated_at = ${at}
           where asset_id = ${asset.id} and kind = ${kind} and status = 'PENDING'
           returning id
        `,
      );
      if (guarded.length !== 1) {
        throw contradiction('a prepared derivative could not be moved to PROCESSING');
      }
    }

    // No inspection is appended here (§11.8): an inspection is terminal
    // evidence, and this transaction has decided nothing yet.
    return { kind: 'PROCESS', source: toSourceFacts(asset), lane, requiresCleanup };
  }

  private async appendInspection(
    assetId: string,
    outcome: 'ACCEPTED' | 'REJECTED',
    detail: string,
    at: Date,
  ): Promise<void> {
    await executeRaw(
      this.db,
      sql`
        insert into asset_inspections (asset_id, outcome, detail, inspected_at)
        values (${assetId}, ${outcome}, ${detail}, ${at})
      `,
    );
  }

  private async transitionAsset(
    assetId: string,
    to: 'ACCEPTED' | 'REJECTED',
    at: Date,
  ): Promise<void> {
    const moved = await executeRaw<{ id: string }>(
      this.db,
      sql`
        update assets set status = ${to}, updated_at = ${at}
         where id = ${assetId} and status = 'INSPECTING'
         returning id
      `,
    );
    if (moved.length !== 1) {
      throw contradiction(`asset could not be transitioned to ${to}`);
    }
  }
}
