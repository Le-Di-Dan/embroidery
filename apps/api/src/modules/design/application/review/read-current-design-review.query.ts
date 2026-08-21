/**
 * The customer's read of the design version awaiting their decision
 * (`APP6-B10`).
 *
 * ```text
 * secure link token
 *   → AuthorizeSecureLink                 (APP4-B06: policy, abuse budget, digest)
 *   → ResolvedSecureLink.customRequestId  (the grant row, never the caller)
 *   → custom_requests.current_design_case_id      (APP6-B08 set it)
 *   → that case, proving it names the request back
 *   → the case's one SENT_FOR_REVIEW version      (GRD-004's arbiter)
 *   → its persisted document + the hash APP6-B09 stored
 *   + the effective agreement set an approval will bind
 * ```
 *
 * ### Nothing about the target is accepted
 *
 * {@link ReadCurrentDesignReviewCommand} carries a token and nothing else. There
 * is no `requestId`, no `designCaseId`, no `versionId`, no `customerId`, no
 * `grantId` and no scope kind — not because this class declines to read them,
 * but because the command type has nowhere to put one. "Grant A cannot read
 * request B's design" is therefore not a comparison that could be removed:
 * there is no second identifier for it to disagree with.
 *
 * ### The active review is not the current-version pointer
 *
 * This is the load-bearing distinction `APP6-B09` established.
 * `design_cases.current_version_id` means *newest authored / current draft*; the
 * version under review is the one `uq_design_versions__case__sent_for_review`
 * arbitrates. A workshop that has started the next draft has already advanced
 * the pointer while the customer's review is still open, so following it would
 * show that customer an unsent DRAFT — a design nobody has decided to show them
 * — and would let them approve it.
 *
 * So the pointer is not read here, and {@link DesignReviewPort} offers no way to
 * read it. Neither is `max(version)`, the newest `created_at`, the latest DRAFT,
 * a caller-supplied version id or a guess from review history: the port takes a
 * case id and returns the row the partial unique index already decided on.
 *
 * The `custom_requests.current_design_case_id` pointer *is* followed, because
 * that one is the canonical case pointer with no competing arbiter — the same
 * pointer `APP6-B08` and `APP6-B09` follow, and the same reasoning `APP6-B04`
 * applies to `current_quotation_id`.
 *
 * ### Both containment invariants are proved, not assumed
 *
 * `findReviewCase` and `findVersionInReview` address their tables globally, and
 * a pointer that named a foreign row would resolve perfectly well:
 *
 * ```text
 * designCase.customRequestId    === request id from the grant   (G-DB7-09)
 * reviewVersion.designCaseId    === designCase.id               (G-DB7-02 side)
 * ```
 *
 * ### One answer for every definitive absence
 *
 * A missing request row, an unset case pointer, a case that resolves but belongs
 * to another request, no version in review, a version in review that belongs to
 * another case, a sent version with no stored hash — all leave here as the same
 * `SECURE_LINK_UNAVAILABLE` a bad token produces. No `DESIGN_CASE_UNRESOLVED`,
 * no `DESIGN_VERSION_NOT_FOUND` and no `REVIEW_ALREADY_ACTIVE` reaches this
 * surface: publishing any of them would let a caller learn that a grant is live
 * but not yet designed for, which is a fact about the workshop's progress on
 * someone's order. There is no diagnostic follow-up read anywhere below — that
 * read is the oracle.
 *
 * An incomplete **agreement set** is deliberately not one of those cases. It
 * means the deployment cannot state what the customer would be agreeing to, and
 * answering `404` would tell a customer with a live link that it is dead. That
 * is a bounded `503` from {@link EffectiveAgreementsReader}, and the two
 * vocabularies never mix.
 *
 * ### Reading changes nothing
 *
 * No transaction, no lock, no write. The grant is not consumed (ADR-DB3-004 r2
 * keeps a link multi-use within its validity, so a customer re-opening the page
 * must not burn it), no version is transitioned, no pointer is advanced, no
 * transition, audit or outbox row is appended, no notification intent is created,
 * no Approval Snapshot is touched and no agreement acceptance is recorded. No
 * step-up challenge is required or consumed either: a valid grant reads, and
 * step-up authorises the `APP6-B11` **approval**, not the sight of it. The only
 * row APP4's admission writes is its own grant-resolution audit — the same
 * evidence `APP5-B03` and `APP6-B04` produce, written because a token was
 * resolved and not because a design was read.
 *
 * The composing module holds no `TransactionManager`, so none of that is
 * reachable rather than merely unwritten.
 *
 * ### The document crosses unchanged
 *
 * The persisted `design_document` is passed straight through — no migration, no
 * quantization, no re-canonicalisation and no re-hash. A Catalog v1 document and
 * a COP v2 document are both simply the JSON their row holds, and the returned
 * hash is the `sha256:` value `APP6-B09` computed over those exact bytes and
 * stored. Recomputing one here would create a second authority that could
 * disagree with the value `GRD-007` binds the approval to.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  AuthorizeSecureLink,
  type SecureLinkAdmission,
} from '../../../customer/application/authorize-secure-link.service';
import { secureLinkUnavailable } from '../../../customer/domain/grant/secure-link.errors';
import type { NetworkReadableRequest } from '../../../customer/infrastructure/rate-limit/public-network-key.service';
import {
  CUSTOM_REQUEST_DESIGN_CONTEXT_PORT,
  type CustomRequestDesignContextPort,
} from '../../../order/domain/repositories/custom-request-design-context.port';
import type { CustomRequestId } from '../../../order/domain/repositories/custom-request.repository';
import type { DesignCaseId } from '../../domain/repositories/design-case.repository';
import {
  DESIGN_REVIEW_PORT,
  type DesignReviewPort,
  type DesignReviewVersion,
} from '../../domain/repositories/design-review.port';
import type { CustomerDesignReviewView } from './customer-design-review.view';
import { EffectiveAgreementsReader } from './effective-agreements.reader';

/** The whole input. One credential, by design — see the header. */
export interface ReadCurrentDesignReviewCommand {
  readonly token: string;
}

/** Either the view, or the rate-limit refusal the controller turns into a 429. */
export type CurrentDesignReviewOutcome =
  | { readonly outcome: 'READ'; readonly view: CustomerDesignReviewView }
  | { readonly outcome: 'RATE_LIMITED'; readonly retryAfterSeconds: number };

@Injectable()
export class ReadCurrentDesignReview {
  constructor(
    private readonly links: AuthorizeSecureLink,
    @Inject(CUSTOM_REQUEST_DESIGN_CONTEXT_PORT)
    private readonly requests: CustomRequestDesignContextPort,
    @Inject(DESIGN_REVIEW_PORT) private readonly designs: DesignReviewPort,
    private readonly agreements: EffectiveAgreementsReader,
  ) {}

  async read(
    request: NetworkReadableRequest,
    command: ReadCurrentDesignReviewCommand,
  ): Promise<CurrentDesignReviewOutcome> {
    const admission: SecureLinkAdmission = await this.links.authorize(request, command.token);
    if (admission.outcome === 'RATE_LIMITED') {
      return { outcome: 'RATE_LIMITED', retryAfterSeconds: admission.retryAfterSeconds };
    }

    const reviewVersion = await this.resolveReview(admission.link.customRequestId);

    // The agreement set is resolved only after the review target is, so an
    // unconfigured deployment cannot answer `503` to a token that would have got
    // `404` anyway — which would make the 503 an existence oracle for grants.
    const agreements = await this.agreements.requireEffectiveSet();

    return {
      outcome: 'READ',
      view: {
        designVersionId: reviewVersion.id,
        version: reviewVersion.version,
        documentSchemaVersion: reviewVersion.documentSchemaVersion,
        // Non-null by `requireSendEvidence` below.
        documentHash: reviewVersion.documentHash as string,
        sentAt: reviewVersion.sentAt as Date,
        document: reviewVersion.designDocument,
        agreements,
        accessExpiresAt: admission.link.expiresAt,
      },
    };
  }

  /**
   * Grant → request → case → the exact version in review.
   *
   * Every failure below is the same refusal, and the method returns only when
   * all five facts hold: the request row exists, it points at a case, that case
   * names this request back, the case has a version in review, and that version
   * belongs to this case.
   */
  private async resolveReview(customRequestId: string): Promise<DesignReviewVersion> {
    const requestId = customRequestId as CustomRequestId;

    // Unlocked: `findDesignContext` is the read-only half of the port for exactly
    // this reason, and taking `FOR UPDATE` on a public GET-equivalent would
    // serialise a customer's page against every concurrent write to their
    // request. The request's LC-11 **status** is deliberately not read as a
    // guard: the send is what makes a version reviewable (LC-08), the request
    // status is a projection of it (`TR-LC11-08`), and gating on the projection
    // would refuse a legitimately sent design whenever the two disagreed.
    const context = await this.requests.findDesignContext(requestId);
    if (context?.currentDesignCaseId === undefined) {
      throw secureLinkUnavailable();
    }

    const designCase = await this.designs.findReviewCase(
      context.currentDesignCaseId as DesignCaseId,
    );
    // The pointer resolved, and the row it named belongs to this request.
    // G-DB7-09 checked on the read side, where its absence would let one
    // request's dangling pointer serve another customer's artwork.
    if (designCase === undefined || designCase.customRequestId !== requestId) {
      throw secureLinkUnavailable();
    }

    const reviewVersion = await this.designs.findVersionInReview(designCase.id);
    // "No design has been sent yet" and "your link is not usable" are the same
    // answer here, on purpose: the first is a fact about the workshop's progress
    // on this customer's order and is not a stranger's to learn.
    if (reviewVersion === undefined || reviewVersion.designCaseId !== designCase.id) {
      throw secureLinkUnavailable();
    }

    return requireSendEvidence(reviewVersion);
  }
}

/**
 * A version in review must carry the evidence its send created.
 *
 * `ck_design_versions__document_hash_required_once_sent` and the `sent_at`
 * column make both unreachable for a row that reached `SENT_FOR_REVIEW` through
 * `APP6-B09`, so this is a guard against a row that arrived some other way. It
 * refuses rather than recomputing: a hash derived here would be a second
 * authority that could disagree with the one `GRD-007` binds the approval to,
 * and inventing a `sentAt` would put an instant in front of the customer that
 * nothing recorded.
 */
function requireSendEvidence(version: DesignReviewVersion): DesignReviewVersion {
  if (version.documentHash === undefined || version.sentAt === undefined) {
    throw secureLinkUnavailable();
  }
  return version;
}
