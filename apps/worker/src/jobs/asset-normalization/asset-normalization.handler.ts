/**
 * The second production job handler (`APP3-W01A`).
 *
 * Thin, exactly as `AssetInspectionHandler` is: a handler's contract with the
 * I02 runtime is what it consumes, how to validate a payload and the identity of
 * the effect it produces, and everything else belongs to the use case.
 *
 * It reuses the **same** runtime — same registry, same `ASSET_PROCESSING` job
 * kind, same claim, lease, heartbeat, retry and dead-letter behaviour. Adding it
 * required no change to any runtime file, which is what `IMP-D046` PO-01 means
 * by "a new event type, not a second queue": the registry's claim filter is
 * exactly the registered types, so this deployment now claims two and an
 * unregistered type stays unclaimed.
 *
 * A terminal rejection is a **return value**, not a throw. The use case has
 * already decided that a stale association or an unusable file is a verdict
 * about the request; throwing it here would hand that verdict to a retry policy
 * that knows nothing about associations.
 */
import { Injectable } from '@nestjs/common';
import type { BackgroundJobKind } from '@embroidery/persistence';

import type {
  JobExecutionContext,
  JobHandler,
  PayloadValidationResult,
} from '../../runtime/registry/job-handler';
import { AssetNormalizationUseCase } from './application/asset-normalization.usecase';
import {
  ASSET_NORMALIZATION_EVENT_TYPE,
  ASSET_NORMALIZATION_PAYLOAD_VERSION,
  deriveAssetNormalizationEffectKey,
  parseAssetNormalizationPayload,
  type AssetNormalizationPayload,
} from './domain/asset-normalization.payload';
import { NORMALIZATION_POLICY_VERSION } from './domain/normalization-policy';

/** The same domain kind the inspection handler files its evidence under. */
const ASSET_PROCESSING: BackgroundJobKind = 'ASSET_PROCESSING';

@Injectable()
export class AssetNormalizationHandler implements JobHandler<AssetNormalizationPayload> {
  readonly eventType = ASSET_NORMALIZATION_EVENT_TYPE;
  readonly jobKind = ASSET_PROCESSING;
  readonly payloadSchemaVersion = ASSET_NORMALIZATION_PAYLOAD_VERSION;

  constructor(private readonly useCase: AssetNormalizationUseCase) {}

  /**
   * Shape first, then the policy version this build actually implements.
   *
   * A payload asking for `normalizationPolicyVersion = 2` is well formed and
   * still unrunnable: the producer is ahead of this deployment, which is exactly
   * what `JOB_SCHEMA_UNSUPPORTED` means and why it is terminal. Silently running
   * v1 rules for a v2 request would produce bytes nobody asked for and record
   * them as authoritative.
   */
  validatePayload(
    payload: unknown,
    payloadSchemaVersion: number,
  ): PayloadValidationResult<AssetNormalizationPayload> {
    const parsed = parseAssetNormalizationPayload(payload, payloadSchemaVersion);
    if (
      parsed.valid &&
      parsed.payload.normalizationPolicyVersion !== NORMALIZATION_POLICY_VERSION
    ) {
      return { valid: false, errorClass: 'JOB_SCHEMA_UNSUPPORTED' };
    }
    return parsed;
  }

  deriveEffectKey(payload: AssetNormalizationPayload): string {
    return deriveAssetNormalizationEffectKey(payload);
  }

  async execute(
    payload: AssetNormalizationPayload,
    _context: JobExecutionContext,
    abortSignal: AbortSignal,
  ): Promise<void> {
    await this.useCase.normalize(payload, abortSignal);
  }
}
