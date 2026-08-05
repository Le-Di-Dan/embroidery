/**
 * The normalization lifecycle (`APP3-W01A`).
 *
 * The order is the contract (`IMP-D046`, directive §10):
 *
 *   1. prove the association still authorizes this work;
 *   2. refuse media this profile may not process, before any expensive read;
 *   3. verify integrity and apply the decoded limits;
 *   4. claim the durable `PROCESSING` row;
 *   5. produce the bytes and measure what was actually written;
 *   6. persist storage identity, `READY` and the whole quartet in one statement;
 *   7. clean anything the attempt left behind.
 *
 * Context comes first because it is the cheapest and the most likely to have
 * moved: a retired Product Side should cost one statement, not a 10 MiB download
 * followed by a rejection. And **no object-storage call happens inside a
 * transaction** — steps 3 and 5 are outside the boundaries that 4 and 6 open,
 * because holding a connection across a network round trip turns a provider
 * stall into a database incident.
 *
 * The one thing this file refuses to do is treat an existing result as an
 * answer. `REPLAY_READY` means bytes exist; it does not mean *this* request was
 * authorized, so the association is validated first and a stale one is rejected
 * even when a perfectly good derivative is sitting there (PO-08).
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import type { AssetNormalizationPayload } from '../domain/asset-normalization.payload';
import {
  isNormalizationRejection,
  rejectionDetail,
  type NormalizationOutcomeCode,
} from '../domain/normalization-outcome';
import {
  ASSET_NORMALIZATION_REPOSITORY,
  type AssetNormalizationRepository,
} from '../domain/repositories/asset-normalization.repository';
import { AssociationResolutionService } from './association-resolution.service';
import { NormalizedDerivativeService } from './normalized-derivative.service';
import { TemplateSvgNormalizationService } from './template-svg-normalization.service';

/** What one attempt concluded. Recorded by the caller; never thrown at the runtime. */
export type NormalizationResult =
  | { readonly outcome: 'NORMALIZED'; readonly storageKey: string }
  | { readonly outcome: 'ALREADY_NORMALIZED'; readonly storageKey: string }
  | {
      readonly outcome: 'REJECTED';
      readonly code: NormalizationOutcomeCode;
      readonly detail: string;
    };

@Injectable()
export class AssetNormalizationUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(ASSET_NORMALIZATION_REPOSITORY)
    private readonly repository: AssetNormalizationRepository,
    private readonly associations: AssociationResolutionService,
    private readonly derivatives: NormalizedDerivativeService,
    private readonly templateSvg: TemplateSvgNormalizationService,
  ) {}

  async normalize(
    payload: AssetNormalizationPayload,
    signal: AbortSignal,
  ): Promise<NormalizationResult> {
    try {
      return await this.run(payload, signal);
    } catch (error: unknown) {
      if (isNormalizationRejection(error)) {
        // A verdict about the request, not a failure of the attempt. The job
        // completes; the runtime's retry policy — which knows nothing about
        // associations — never sees it.
        await this.releaseClaim(payload.assetId);
        return { outcome: 'REJECTED', code: error.code, detail: rejectionDetail(error.code) };
      }
      await this.releaseClaim(payload.assetId);
      throw error;
    }
  }

  private async run(
    payload: AssetNormalizationPayload,
    signal: AbortSignal,
  ): Promise<NormalizationResult> {
    const { profile, source } = await this.associations.resolve(
      payload.assetId,
      payload.associationRef,
    );
    const lane = this.derivatives.assertProcessableSource(profile, source);
    if (lane.lane === 'TEMPLATE_SVG') {
      // Before the claim and before any read: a job asking for sanitization
      // rules this build does not implement must not take the row (PO-14).
      this.templateSvg.assertPolicyVersion(payload.normalizationPolicyVersion);
    }

    const key =
      lane.lane === 'TEMPLATE_SVG'
        ? this.templateSvg.derivativeKey(payload.assetId)
        : this.derivatives.derivativeKey(payload.assetId);
    const prepared = await this.transactions.runInTransaction(() =>
      this.repository.prepareOrRecover({
        assetId: payload.assetId,
        expectedKey: key,
        at: new Date(),
      }),
    );

    if (prepared.kind === 'REPLAY_READY') {
      // Reached only after the association was proven above, which is the whole
      // point: an existing result satisfies a *validated* request and nothing
      // else.
      return { outcome: 'ALREADY_NORMALIZED', storageKey: prepared.storageKey };
    }

    // The raster lane verifies and then decodes in two reads; the Template SVG
    // lane proves integrity on the single read that feeds its parser, so its
    // verification lives inside `produce`.
    if (lane.lane === 'RASTER') {
      await this.derivatives.verifySource(lane.mediaType, prepared.source, signal);
    }

    if (prepared.requiresCleanup) {
      // An earlier attempt may have written bytes at this deterministic key.
      // Removing them first means the object that ends up there is this
      // attempt's, not a half-written predecessor's.
      await this.derivatives.discardObject(key, signal);
    }

    const output =
      lane.lane === 'TEMPLATE_SVG'
        ? await this.templateSvg.produce(prepared.source, signal)
        : await this.derivatives.produce(prepared.source, signal);

    try {
      await this.transactions.runInTransaction(() =>
        this.repository.finalizeReady({
          assetId: payload.assetId,
          storageKey: output.storageKey,
          checksum: output.checksum,
          widthPx: output.widthPx,
          heightPx: output.heightPx,
          mediaType: output.mediaType,
          byteSize: output.byteSize,
          at: new Date(),
        }),
      );
    } catch (error: unknown) {
      // Two attempts write the *same* deterministic key, so "my finalize
      // failed" does not mean "my object is orphaned". If another attempt won
      // the claim and finalized, the object at that key is now **its** result:
      // deleting it here would have one worker destroy another's bytes while
      // the row still pointed at them. The live concurrency case caught exactly
      // that, and it is invisible to any single-worker test.
      const existing = await this.repository.findNormalized(payload.assetId);
      if (existing?.status === 'READY' && existing.storageKey === output.storageKey) {
        return { outcome: 'ALREADY_NORMALIZED', storageKey: output.storageKey };
      }
      // Otherwise the object really is orphaned: no row points at it. Removing
      // it is the existing reconciliation behaviour — no orphan table, no
      // cleanup scheduler — and the attempt still fails so the runtime can
      // retry from a clean state.
      await this.derivatives.discardObject(output.storageKey, signal);
      throw error;
    }

    return { outcome: 'NORMALIZED', storageKey: output.storageKey };
  }

  /**
   * Releases this attempt's `PROCESSING` claim.
   *
   * Without it a terminal rejection would leave a `PROCESSING` row holding the
   * partial unique index, and every later attempt for that Asset would take it
   * over rather than start clean. Guarded on `status = 'PROCESSING'`, so a row
   * another attempt already finalized is untouched.
   */
  private async releaseClaim(assetId: string): Promise<void> {
    try {
      await this.transactions.runInTransaction(() =>
        this.repository.failClaim(assetId, new Date()),
      );
    } catch {
      // The claim release is housekeeping. Failing the attempt over it would
      // replace a precise verdict with an infrastructure error.
    }
  }
}
