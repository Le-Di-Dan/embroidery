/**
 * The one production job handler (APP2-W01 §10).
 *
 * Thin on purpose. A handler's contract with the I02 runtime is exactly three
 * things — what it consumes, how to validate a payload, and the identity of the
 * effect it produces — and everything else belongs to the use case. Putting
 * lifecycle logic here would tie it to the runtime's shape and make it
 * unreachable from a test that does not boot a poll loop.
 */
import { Injectable } from '@nestjs/common';
import type { BackgroundJobKind } from '@embroidery/persistence';

import type {
  JobExecutionContext,
  JobHandler,
  PayloadValidationResult,
} from '../../runtime/registry/job-handler';
import { AssetInspectionUseCase } from './application/asset-inspection.usecase';
import {
  ASSET_INSPECTION_EVENT_TYPE,
  ASSET_INSPECTION_PAYLOAD_VERSION,
  deriveAssetInspectionEffectKey,
  parseAssetInspectionPayload,
  type AssetInspectionPayload,
} from './domain/asset-inspection.payload';

/**
 * The domain kind, not the transport one.
 *
 * The I02 suites all use `OUTBOX_DISPATCH` because dispatching *was* the work.
 * Here the work is processing an asset, and filing its attempt evidence under
 * the transport kind would make every operational query about image processing
 * indistinguishable from every other queued event.
 */
const ASSET_PROCESSING: BackgroundJobKind = 'ASSET_PROCESSING';

@Injectable()
export class AssetInspectionHandler implements JobHandler<AssetInspectionPayload> {
  readonly eventType = ASSET_INSPECTION_EVENT_TYPE;
  readonly jobKind = ASSET_PROCESSING;
  readonly payloadSchemaVersion = ASSET_INSPECTION_PAYLOAD_VERSION;

  constructor(private readonly useCase: AssetInspectionUseCase) {}

  validatePayload(
    payload: unknown,
    payloadSchemaVersion: number,
  ): PayloadValidationResult<AssetInspectionPayload> {
    return parseAssetInspectionPayload(payload, payloadSchemaVersion);
  }

  deriveEffectKey(payload: AssetInspectionPayload): string {
    return deriveAssetInspectionEffectKey(payload);
  }

  async execute(
    payload: AssetInspectionPayload,
    context: JobExecutionContext,
    abortSignal: AbortSignal,
  ): Promise<void> {
    await this.useCase.inspect(
      { assetId: payload.assetId, attemptNo: context.attemptNo },
      abortSignal,
    );
  }
}
