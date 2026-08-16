/**
 * The `APP5-S01` flow as one explicit state model.
 *
 * ## Subject XOR is structural, not validated
 *
 * `APP5-G01` §3 requires exactly one subject. Rather than allowing both branches
 * to hold data and refusing the combination at submit, choosing a branch
 * **clears the other one** (the warning drawn on `651:3`), and `subject` is a
 * single optional value. There is no state in which both branches carry data,
 * so `SUBMISSION_SUBJECT_INVALID` is unreachable through this screen — which is
 * why it never appears as customer copy.
 *
 * ## Why the verified challenge id lives here
 *
 * `APP4`'s `verificationReducer` drops the challenge on `VERIFIED` on purpose:
 * nothing downstream may answer it again, and its id has no place on the success
 * frame. But `APP5-B02` scopes uploads by challenge and `APP5-B01` uses it as
 * both authorization and idempotency scope, so S01 keeps its own copy
 * (`APP5-S01` §1.3). It is held here — in the flow reducer, alongside the rest
 * of this screen's interaction state — which means it dies with the screen. It
 * is not a session: no storage, no cookie, no persistence across a reload, and
 * `FLOW_RESET` clears it along with everything else.
 *
 * A reducer rather than Zustand for the same reason `APP4-S01` gave: this is one
 * screen's interaction state, and `CLAUDE.md` §5 forbids duplicating server
 * state into a store. The uploads and the variant list stay in TanStack Query;
 * only the customer's own choices are here.
 */
import { emptyCustomerOwnedDraft, type CustomerOwnedDraft } from './customer-owned-draft';
import { emptyQuantityLine, type QuantityDraftLine } from './quantity-breakdown';

/** The two subjects a request may have. Never both, never neither. */
export type RequestSubject = 'CATALOG' | 'CUSTOMER_OWNED';

/** The three steps the approved rail draws. */
export type FlowStep = 'SUBJECT' | 'VERIFY' | 'ATTACH';

export const REVIEW_NOTE_MAX = 2000;

export interface CustomRequestFlowState {
  readonly subject: RequestSubject | undefined;
  readonly step: FlowStep;
  /**
   * The challenge `APP4` verified, retained for `APP5-B02` and `APP5-B01`.
   *
   * `undefined` until verification succeeds; the two steps it gates read it
   * directly, so an unverified flow cannot upload or submit by construction
   * rather than by a check someone could forget.
   */
  readonly verifiedChallengeId: string | undefined;
  /** The one variant the customer explicitly chose. Never defaulted. */
  readonly selectedVariantId: string | undefined;
  /** Set when a refetch shows the chosen variant is no longer selectable. */
  readonly variantWithdrawn: boolean;
  readonly quantityLines: readonly QuantityDraftLine[];
  readonly customerOwned: CustomerOwnedDraft;
  readonly customerNote: string;
  /** Field errors appear after the customer first tries to move on. */
  readonly showValidation: boolean;
  /** Monotonic source of stable quantity-row keys. */
  readonly nextLineKey: number;
}

export const initialFlowState: CustomRequestFlowState = {
  subject: undefined,
  step: 'SUBJECT',
  verifiedChallengeId: undefined,
  selectedVariantId: undefined,
  variantWithdrawn: false,
  quantityLines: [emptyQuantityLine('line-0')],
  customerOwned: emptyCustomerOwnedDraft,
  customerNote: '',
  showValidation: false,
  nextLineKey: 1,
};

export type CustomRequestFlowAction =
  | { type: 'SUBJECT_CHOSEN'; subject: RequestSubject }
  | { type: 'VARIANT_SELECTED'; productVariantId: string }
  | { type: 'VARIANT_WITHDRAWN' }
  | { type: 'QUANTITY_CHANGED'; key: string; field: 'sizeLabel' | 'quantity'; value: string }
  | { type: 'QUANTITY_LINE_ADDED' }
  | { type: 'QUANTITY_LINE_REMOVED'; key: string }
  | { type: 'CUSTOMER_OWNED_CHANGED'; field: keyof CustomerOwnedDraft; value: string }
  | { type: 'NOTE_CHANGED'; value: string }
  | { type: 'VALIDATION_REQUESTED' }
  | { type: 'STEP_CHANGED'; step: FlowStep }
  | { type: 'VERIFIED'; challengeId: string }
  | { type: 'VERIFICATION_RESET' }
  | { type: 'FLOW_RESET' };

export function customRequestFlowReducer(
  state: CustomRequestFlowState,
  action: CustomRequestFlowAction,
): CustomRequestFlowState {
  switch (action.type) {
    case 'SUBJECT_CHOSEN': {
      if (state.subject === action.subject) return state;
      // Switching branch clears the branch-specific data of both, which is what
      // `651:3` warns about. The verified contact and the quantity breakdown
      // survive: neither belongs to a branch.
      return {
        ...state,
        subject: action.subject,
        selectedVariantId: undefined,
        variantWithdrawn: false,
        customerOwned: emptyCustomerOwnedDraft,
        showValidation: false,
      };
    }

    case 'VARIANT_SELECTED':
      return {
        ...state,
        selectedVariantId: action.productVariantId,
        variantWithdrawn: false,
      };

    case 'VARIANT_WITHDRAWN':
      // The selection is cleared and flagged, and the flow returns to the step
      // where a variant is chosen — a reselection is required, and leaving the
      // customer on a later step would ask for it where the control is not.
      // Nothing else is touched: `APP5-S01` §6.3 requires the rest of the form,
      // including the verified challenge, to survive.
      return { ...state, selectedVariantId: undefined, variantWithdrawn: true, step: 'SUBJECT' };

    case 'QUANTITY_CHANGED':
      return {
        ...state,
        quantityLines: state.quantityLines.map((line) =>
          line.key === action.key ? { ...line, [action.field]: action.value } : line,
        ),
      };

    case 'QUANTITY_LINE_ADDED':
      return {
        ...state,
        quantityLines: [...state.quantityLines, emptyQuantityLine(`line-${state.nextLineKey}`)],
        nextLineKey: state.nextLineKey + 1,
      };

    case 'QUANTITY_LINE_REMOVED': {
      const remaining = state.quantityLines.filter((line) => line.key !== action.key);
      // The table never empties: removing the last row leaves a blank one, so
      // there is always somewhere to type.
      return {
        ...state,
        quantityLines:
          remaining.length === 0 ? [emptyQuantityLine(`line-${state.nextLineKey}`)] : remaining,
        nextLineKey: remaining.length === 0 ? state.nextLineKey + 1 : state.nextLineKey,
      };
    }

    case 'CUSTOMER_OWNED_CHANGED':
      return {
        ...state,
        customerOwned: { ...state.customerOwned, [action.field]: action.value },
      };

    case 'NOTE_CHANGED':
      return { ...state, customerNote: action.value };

    case 'VALIDATION_REQUESTED':
      return { ...state, showValidation: true };

    case 'STEP_CHANGED':
      return { ...state, step: action.step, showValidation: false };

    case 'VERIFIED':
      // The one place the challenge id enters S01 state.
      return { ...state, verifiedChallengeId: action.challengeId, step: 'ATTACH' };

    case 'VERIFICATION_RESET':
      // The verification was spent or restarted: the id must go, and with it the
      // right to upload or submit. Uploads made under it are dropped by the
      // uploads hook, which keys its own state on the same id.
      return { ...state, verifiedChallengeId: undefined, step: 'VERIFY' };

    case 'FLOW_RESET':
      return initialFlowState;

    default:
      return state;
  }
}

/** Has the customer verified a contact? The gate for steps 3 and submission. */
export function isVerified(state: CustomRequestFlowState): boolean {
  return state.verifiedChallengeId !== undefined;
}
