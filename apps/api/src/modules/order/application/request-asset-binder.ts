/**
 * Binding submitted evidence to the request (`APP5-G01` §6).
 *
 * `APP5-B01` creates **no upload endpoint** — that is `APP5-B02` — but binding
 * is part of the submission transaction contract, so the ids a caller supplies
 * are validated and associated here, inside that transaction and nowhere else.
 * There is no post-submission attach operation in APP5: the rows are retained
 * evidence, and neither customer nor Admin adds, replaces or detaches one later.
 *
 * ### Why the eligibility read takes a share lock
 *
 * `lockScopedByIds` is `FOR SHARE`, which is exactly what this consumer needs: a
 * plain read at `READ COMMITTED` could see `ACCEPTED` while a concurrent
 * inspection failure commits a move out of it, and the binding would then be
 * evidence of an asset the system has since rejected. The lock holds that state
 * until this transaction ends. The scope filter is the second half: an id
 * outside `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE` is simply absent from the
 * result, so a caller cannot use this endpoint to discover that some other
 * asset exists.
 *
 * ### One refusal, again
 *
 * Unknown, wrong-kind, wrong-classification, un-inspected, rejected,
 * tombstoned, someone else's, already-bound, over-cap and wrong-branch all
 * answer `REQUEST_ASSET_NOT_BINDABLE`. Naming which would describe rows the
 * caller was never shown, including whether an id belongs to another customer.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  ASSET_REPOSITORY,
  type Asset,
  type AssetId,
  type AssetRepository,
} from '../../asset/domain/repositories/asset.repository';
import {
  APP5_REQUEST_ASSET_ROLES,
  BINDABLE_ASSET_CLASSIFICATION,
  BINDABLE_ASSET_KIND,
  BINDABLE_ASSET_STATE,
  MAX_ASSETS_PER_ROLE,
  isRoleAllowedOnBranch,
  type App5RequestAssetRole,
} from '../domain/submission/request-asset-policy';
import { RequestSubmissionError } from '../domain/submission/request-submission.errors';
import {
  CUSTOM_REQUEST_REPOSITORY,
  type CustomRequestId,
  type CustomRequestRepository,
} from '../domain/repositories/custom-request.repository';

export interface RequestAssetBinding {
  readonly assetId: string;
  readonly role: App5RequestAssetRole;
}

export interface BindRequestAssetsInput {
  readonly requestId: CustomRequestId;
  readonly customerId: string;
  readonly branch: 'CATALOG' | 'COP';
  readonly bindings: readonly RequestAssetBinding[];
}

/** The scope every bindable customer upload sits in (`G01` §6). */
const BINDABLE_SCOPE = {
  kind: BINDABLE_ASSET_KIND,
  classification: BINDABLE_ASSET_CLASSIFICATION,
} as const;

@Injectable()
export class RequestAssetBinder {
  constructor(
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    @Inject(CUSTOM_REQUEST_REPOSITORY) private readonly requests: CustomRequestRepository,
  ) {}

  /**
   * Validates the whole selection, then binds it.
   *
   * @requiresTransaction — the share lock, the reuse read and the associations
   * are one decision; validating in one transaction and writing in another would
   * make the lock decorative.
   */
  async bind(input: BindRequestAssetsInput): Promise<void> {
    this.assertShape(input);
    await this.assertEligible(input);

    for (const binding of input.bindings) {
      await this.requests.attachAsset(input.requestId, binding.assetId, binding.role);
    }
  }

  /** Everything decidable from the request alone, before a single read. */
  private assertShape(input: BindRequestAssetsInput): void {
    const seen = new Set<string>();
    const perRole = new Map<App5RequestAssetRole, number>();

    for (const binding of input.bindings) {
      if (!(APP5_REQUEST_ASSET_ROLES as readonly string[]).includes(binding.role)) {
        // `G01-D14` — `ATTACHMENT` reaches here only if the transport contract
        // is ever widened; refusing it in the application too means the rule
        // survives that edit.
        throw new RequestSubmissionError('REQUEST_ASSET_NOT_BINDABLE');
      }
      if (!isRoleAllowedOnBranch(binding.role, input.branch)) {
        throw new RequestSubmissionError('REQUEST_ASSET_NOT_BINDABLE');
      }
      if (seen.has(binding.assetId)) {
        // One image is either the garment or a reference. Listing it twice —
        // under one role or two — is the reuse rule applied inside a single
        // submission, and `uq_custom_request_assets__request_asset_role` would
        // only catch the first of those two cases.
        throw new RequestSubmissionError('REQUEST_ASSET_NOT_BINDABLE');
      }
      seen.add(binding.assetId);
      perRole.set(binding.role, (perRole.get(binding.role) ?? 0) + 1);
    }

    for (const count of perRole.values()) {
      if (count > MAX_ASSETS_PER_ROLE) {
        throw new RequestSubmissionError('REQUEST_ASSET_NOT_BINDABLE');
      }
    }

    // `G01-D10` — a customer-owned garment has no catalog media, no session and
    // no design document, so without a photograph nothing in the record
    // describes the physical object an Admin is asked to triage.
    if (input.branch === 'COP' && (perRole.get('COP_IMAGE') ?? 0) < 1) {
      throw new RequestSubmissionError('REQUEST_ASSET_NOT_BINDABLE');
    }
  }

  /** Everything that needs the database, in two statements for the whole set. */
  private async assertEligible(input: BindRequestAssetsInput): Promise<void> {
    const ids = input.bindings.map((binding) => binding.assetId);
    if (ids.length === 0) {
      return;
    }

    const eligible = new Map<string, Asset>();
    for (const asset of await this.assets.lockScopedByIds(ids as AssetId[], BINDABLE_SCOPE)) {
      eligible.set(asset.id, asset);
    }

    for (const id of ids) {
      const asset = eligible.get(id);
      if (
        asset === undefined ||
        asset.status !== BINDABLE_ASSET_STATE ||
        asset.deletedAt !== undefined ||
        asset.uploadedByCustomerId !== input.customerId
      ) {
        throw new RequestSubmissionError('REQUEST_ASSET_NOT_BINDABLE');
      }
    }

    if ((await this.requests.findBoundAssetIds(ids)).length > 0) {
      // Submitted evidence belongs to the request it was submitted with; a
      // second request pointing at the same binary would make one customer's
      // photograph another's evidence.
      throw new RequestSubmissionError('REQUEST_ASSET_NOT_BINDABLE');
    }
  }
}
