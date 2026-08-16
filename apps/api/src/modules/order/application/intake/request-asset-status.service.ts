/**
 * How far one of this challenge's uploads has got (`APP5-B02` §4, §10).
 *
 * ### Why a second endpoint exists at all
 *
 * Inspection is asynchronous and `APP5-B01` binds only `ACCEPTED` assets.
 * Without this read the customer's client has no way to learn whether the file
 * it just uploaded is bindable, and its only options would be to submit and be
 * refused, or to guess. The upload response cannot answer it either: it is
 * necessarily written before the inspector has run.
 *
 * ### The ownership proof is conjunctive
 *
 * Both facts must hold: the asset was uploaded by the customer this challenge
 * resolves to, **and** it was uploaded under this exact challenge. Either alone
 * would be weaker than it looks — a customer-only check would let a spent
 * challenge read a later one's uploads, and a challenge-only check would trust
 * a column the parent's TTL deletion can legitimately null out.
 *
 * That last point is why a cleared `uploaded_via_challenge_id` is a miss rather
 * than a pass: after the challenge row is gone this route can prove nothing, and
 * the cleanup sweep works from `intake_expires_at` precisely so it never needs
 * to. A caller in that position has an expired window, which is exactly what the
 * refusal says.
 *
 * Unknown asset, another customer's asset, another challenge's asset and a
 * tombstoned asset are one answer. Distinguishing them would turn the address
 * into an existence oracle for private uploads.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  ASSET_REPOSITORY,
  type AssetId,
  type AssetRepository,
} from '../../../asset/domain/repositories/asset.repository';
import type { ChallengeId } from '../../../customer/domain/repositories/verification-challenge.repository';
import { requestIntakeError } from '../../domain/intake/request-intake.errors';
import {
  REQUEST_INTAKE_ASSET_KIND,
  REQUEST_INTAKE_CLASSIFICATION,
} from '../../domain/intake/request-intake.policy';
import { ChallengeIntakeAuthorizer } from './challenge-intake.authorizer';

/** The four LC-06 states a customer is entitled to distinguish. */
export type RequestIntakeAssetState = 'UPLOADED' | 'INSPECTING' | 'ACCEPTED' | 'REJECTED';

export interface RequestIntakeStatusView {
  readonly assetId: string;
  readonly state: RequestIntakeAssetState;
  /** True exactly when `APP5-B01` would accept this id in a submission. */
  readonly bindable: boolean;
}

/**
 * `DELETION_PENDING` and `DELETED` are deliberately absent from the public
 * vocabulary: an asset in either state is being removed, and a customer has
 * nothing to do with that distinction. Both are reported as `REJECTED` — not
 * as a euphemism, but because the only decision the answer drives is "may I
 * submit this?", and for both the answer is no, permanently.
 */
const PUBLIC_STATE: Record<string, RequestIntakeAssetState> = {
  UPLOADED: 'UPLOADED',
  INSPECTING: 'INSPECTING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  DELETION_PENDING: 'REJECTED',
  DELETED: 'REJECTED',
};

@Injectable()
export class RequestAssetStatusService {
  constructor(
    private readonly authorizer: ChallengeIntakeAuthorizer,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
  ) {}

  async read(
    challengeId: ChallengeId,
    assetId: AssetId,
    now: Date,
  ): Promise<RequestIntakeStatusView> {
    // The same authorization the upload requires, including the spent-challenge
    // check: a challenge that has produced a request has closed its window, and
    // status for it belongs to `APP5-B03`, not here.
    const authorized = await this.authorizer.authorize(challengeId, now);

    // Scoped read, so an id outside the customer-upload lane is simply absent
    // and cannot be probed for through this route.
    const [asset] = await this.assets.findScopedByIds([assetId], {
      kind: REQUEST_INTAKE_ASSET_KIND,
      classification: REQUEST_INTAKE_CLASSIFICATION,
    });

    if (
      asset === undefined ||
      asset.uploadedByCustomerId !== authorized.customerId ||
      asset.uploadedViaChallengeId !== challengeId
    ) {
      throw requestIntakeError('REQUEST_INTAKE_ASSET_NOT_FOUND');
    }

    const state = PUBLIC_STATE[asset.status] ?? 'REJECTED';
    return {
      assetId: asset.id,
      state,
      // Mirrors `RequestAssetBinder`'s own eligibility rule rather than
      // restating it loosely: a tombstoned `ACCEPTED` row would still be
      // refused at binding, so reporting it as bindable would be a promise this
      // service cannot keep.
      bindable: state === 'ACCEPTED' && asset.deletedAt === undefined,
    };
  }
}
