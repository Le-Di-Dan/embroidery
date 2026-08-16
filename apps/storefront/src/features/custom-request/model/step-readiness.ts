/**
 * What each step needs before the next one opens.
 *
 * Pure functions of the flow state and the two server-owned facts the screen
 * holds (the variant list's outcome and the upload slots), so "can this be
 * submitted?" is decided in one place that a test can call directly rather than
 * inferred from which buttons happen to be enabled.
 *
 * Two rules are worth naming because they are easy to get subtly wrong:
 *
 * - **Uploads are gated on `bindable`**, never on a comparison against
 *   `ACCEPTED`. `APP5-B02` publishes the flag for exactly this decision, and
 *   re-deriving it here would be a copy of `APP5-B01`'s binding rules that could
 *   drift (`APP5-S01` §1.2).
 * - **A pending upload blocks submission** even when the branch's minimum is
 *   already met, because the customer is plainly still waiting for it and a
 *   submission would silently leave it behind.
 */
import type { CustomRequestFlowState } from './custom-request-flow';
import { customerOwnedReady } from './customer-owned-draft';
import { breakdownReady } from './quantity-breakdown';
import { bindableSlots, isPending, slotsOfRole, type AssetSlot } from './request-asset-slot';

export interface SubjectReadinessInput {
  readonly state: CustomRequestFlowState;
  /** Catalog only: a live Design Session was handed over by the Studio. */
  readonly designSessionId: string | undefined;
  /** Catalog only: the product resolved and published at least one variant. */
  readonly variantsSelectable: boolean;
}

/**
 * Step 1 — is the subject fully described?
 *
 * On the catalog branch this is four separate facts, and every one of them is
 * required: a branch, a live design session, a product that can still form a
 * request, and a variant the customer chose themselves.
 */
export function subjectReady(input: SubjectReadinessInput): boolean {
  const { state, designSessionId, variantsSelectable } = input;

  if (state.subject === 'CATALOG') {
    if (designSessionId === undefined) return false;
    if (!variantsSelectable) return false;
    if (state.selectedVariantId === undefined) return false;
    // Required on the catalog branch (`APP5-G01` §3), scoped to that one variant.
    return breakdownReady(state.quantityLines, true);
  }

  if (state.subject === 'CUSTOMER_OWNED') {
    if (!customerOwnedReady(state.customerOwned)) return false;
    // Permitted, not required — so an empty table is a valid COP request.
    return breakdownReady(state.quantityLines, false);
  }

  // Neither branch chosen. The XOR the flow reducer makes structural.
  return false;
}

/** Step 3 — are the branch's image requirements met, with nothing in flight? */
export function attachmentsReady(
  state: CustomRequestFlowState,
  slots: readonly AssetSlot[],
): boolean {
  if (slots.some(isPending)) return false;
  if (state.subject !== 'CUSTOMER_OWNED') return true;
  // `APP5-G01` §6 — at least one accepted COP_IMAGE, decided by `bindable`.
  return slotsOfRole(bindableSlots(slots), 'COP_IMAGE').length >= 1;
}

/** Everything the submit action needs, in one answer. */
export function submissionReady(
  input: SubjectReadinessInput,
  slots: readonly AssetSlot[],
): boolean {
  if (input.state.verifiedChallengeId === undefined) return false;
  if (!subjectReady(input)) return false;
  return attachmentsReady(input.state, slots);
}
