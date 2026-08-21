/**
 * Re-establishing the freeze invariants at send, and hashing what is frozen —
 * `APP6-B09` §8/§9.
 *
 * `APP6-B08` validated the draft at authoring time. Send is the **freeze
 * boundary** under `ADR-APP6-001`: it is the moment the version becomes an
 * artifact a customer is asked to approve, and everything `APP6-B10`/`B11` later
 * bind to — the exact document, its hash, the branch, the placement, the
 * geometry — is fixed here. So the invariants are re-established rather than
 * trusted: the draft may have been authored days earlier, and a Catalog row that
 * has moved underneath it must stop the send, not travel into an approval.
 *
 * ## The persisted row is the only source
 *
 * Every input is read back from `design_versions` and from the request. No
 * caller-supplied document, hash, placement or dimension reaches this class —
 * the send operation has no body at all — so there is no path by which a client
 * could choose what gets hashed.
 *
 * ## Nothing is rewritten
 *
 * The document is validated and canonicalized to compute a hash; it is never
 * written back. A v1 Catalog document stays v1, a v2 COP document stays v2, and
 * the stored JSON is untouched by the send. `prepareDesignDocument` is
 * idempotent over an already-prepared document — which is what `APP6-B08` stored
 * — so the canonical bytes hashed here are the canonical bytes of the row.
 *
 * ## One hash implementation
 *
 * `@embroidery/design-document/server` is the only hasher, reached through
 * `hashDesignDocumentSha256`, which canonicalizes with JCS before digesting.
 * There is no `JSON.stringify` here and no second canonicalizer: two
 * implementations are two things that can disagree about a value an approval is
 * bound to.
 */
import { Injectable } from '@nestjs/common';
import {
  formatDesignDocumentHash,
  hashDesignDocumentSha256,
} from '@embroidery/design-document/server';

import { designVersionSendError } from '../../domain/design-version-send.errors';
import type { DesignVersion } from '../../domain/repositories/design-case.repository';
import type { ResolvedVersionBranch } from '../design-version-branch.resolver';
import { FormalDesignVersionAuthority } from '../formal-design-version.authority';

@Injectable()
export class DesignVersionFreezeAuthority {
  constructor(private readonly documents: FormalDesignVersionAuthority) {}

  /**
   * The canonical `sha256:<hex>` hash of this version's persisted document,
   * after proving the version may still be frozen as it stands.
   *
   * Refuses rather than repairs, in every branch. Nothing here picks another
   * variant, side, area or customer-owned product, converts a branch, adjusts a
   * dimension, or rewrites a document to make the hash computable.
   */
  hashFrozenDocument(version: DesignVersion, branch: ResolvedVersionBranch): string {
    this.assertBranchUnchanged(version, branch);
    const outcome = this.validate(version, branch);
    if (!outcome.ok) {
      throw designVersionSendError('DOCUMENT_REJECTED', outcome.rejection);
    }
    return formatDesignDocumentHash(hashDesignDocumentSha256(outcome.document));
  }

  /**
   * The persisted placement facts, still exactly what the request resolves to.
   *
   * A branch switch is refused before anything else: a version cannot become
   * Catalog→COP or COP→Catalog at send, because both halves of the row would
   * then describe different things and CST-129 would have nothing to say about
   * which one the approval meant.
   */
  private assertBranchUnchanged(version: DesignVersion, branch: ResolvedVersionBranch): void {
    const placement = version.placement;
    if (placement.branch === 'CATALOG') {
      if (branch.branch !== 'CATALOG') {
        throw designVersionSendError('PLACEMENT_FROZEN_MISMATCH');
      }
      // The complete quartet, each part compared. A partial comparison would
      // accept a row that had drifted in the field it happened not to check, and
      // the quartet is only meaningful whole.
      const same =
        placement.productId === branch.productId &&
        placement.productVariantId === branch.productVariantId &&
        placement.productSideId === branch.productSideId &&
        placement.embroideryAreaId === branch.embroideryAreaId &&
        // The Side's own frozen dimensions, as Catalog states them *now*.
        // Compared as numbers because the row stores `numeric` as a string:
        // `'400.00'` and `400` are the same measurement and a string comparison
        // would call them a mismatch.
        Number(placement.physicalWidthMm) === Number(branch.authority.side.physicalWidthMm) &&
        Number(placement.physicalHeightMm) === Number(branch.authority.side.physicalHeightMm);
      if (!same) {
        throw designVersionSendError('PLACEMENT_FROZEN_MISMATCH');
      }
      return;
    }

    if (branch.branch !== 'CUSTOMER_OWNED') {
      throw designVersionSendError('PLACEMENT_FROZEN_MISMATCH');
    }
    if (placement.customerOwnedProductId !== branch.customerOwnedProductId) {
      throw designVersionSendError('PLACEMENT_FROZEN_MISMATCH');
    }
    // CST-130 restated at the freeze boundary. The two labels are what
    // `approval_snapshots.side_name`/`area_name` and the production specification
    // downstream are NOT NULL for, and the COP branch has no FK to read them
    // through — so a blank one must stop the send rather than surface later as a
    // frozen approval nobody can fulfil.
    if (placement.sideLabel.trim() === '' || placement.areaLabel.trim() === '') {
      throw designVersionSendError('PLACEMENT_FROZEN_MISMATCH');
    }
    // The **version's** envelope, positive on both axes — never the customer
    // item's own nullable dimensions, which describe the garment.
    if (Number(placement.physicalWidthMm) <= 0 || Number(placement.physicalHeightMm) <= 0) {
      throw designVersionSendError('PLACEMENT_FROZEN_MISMATCH');
    }
  }

  /**
   * The persisted document, judged by the same authority that admitted it.
   *
   * Catalog reconciles against the **live** Side and Area the resolver just
   * read, so a placement that has moved since authoring refuses here; COP
   * reconciles against the version's own frozen envelope, which is the only
   * authority that branch has.
   */
  private validate(version: DesignVersion, branch: ResolvedVersionBranch) {
    if (branch.branch === 'CATALOG') {
      return this.documents.validateCatalog(version.designDocument, branch.authority);
    }
    return this.documents.validateCustomerOwned(version.designDocument, {
      physicalWidthMm: Number(version.placement.physicalWidthMm),
      physicalHeightMm: Number(version.placement.physicalHeightMm),
    });
  }
}
