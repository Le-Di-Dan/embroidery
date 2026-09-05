/**
 * Every user-facing string on the `/truy-cap` request content (`APP5-S02`).
 *
 * Read from the approved `APP5-D01` frames — `661:3` (NEW), `661:67`
 * (UNDER_REVIEW), `661:131` / `661:352` (NEEDS_CLARIFICATION), `661:199`
 * (REJECTED), `661:267` (CANCELLED) — not written here; node ids sit beside
 * each entry so a copy change is traceable to the design that authorized it.
 * Centralised because `CLAUDE.md` §5 forbids hard-coded user-facing copy inside
 * components.
 *
 * ### The two rules that govern what may be said
 *
 * **Only the customer's own message.** Every `661:*` spec strip repeats it:
 * *"Chỉ hiện customer_visible_reason / cancelled_customer_reason, không bao giờ
 * hiện reason nội bộ (COL-TBL037-08/09)."* So there is exactly one field this
 * feature ever prints as a reason, it arrives already separated by `APP5-B03`,
 * and the note under it (`661:181`) tells the customer in their own words that
 * the workshop's internal notes are not on this page.
 *
 * **No action, in any state.** `661:59` is a card whose entire content is the
 * three things this page does not do, and `G01-D06` is why: APP5 publishes no
 * customer-initiated cancellation, no edit, no re-upload and no reply box. The
 * copy says so rather than leaving the customer to discover it by looking for a
 * button that is not there.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import type { ResponsiveCopy } from '../../../components/responsive-text';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/custom.json`, under `requestStatus`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const requestStatusMessage = messageView(VI_MESSAGES.custom, 'requestStatus');

export const CUSTOM_REQUEST_STATUS_COPY = {
  /** `661:6` … `661:8` desktop, `661:355` … `661:357` mobile. */
  accessBar: {
    title: requestStatusMessage.text('accessBar.title'),
    /**
     * `661:8` / `661:357`. The approved frames also print the masked contact
     * beside the title; `APP5-B03` publishes no contact of any kind, and
     * inventing or fetching one would be a second authorized read this
     * checkpoint does not have. The expiry — which B03 *does* publish as
     * `accessExpiresAt` — is kept, because it is the half of the sentence that
     * tells the customer something actionable.
     */
    expiry: {
      wide: requestStatusMessage.text('accessBar.expiry.wide'),
      narrow: requestStatusMessage.text('accessBar.expiry.narrow'),
    } satisfies ResponsiveCopy,
  },

  /** `661:9` desktop, `661:358` mobile — the page heading. */
  heading: {
    wide: requestStatusMessage.text('heading.wide'),
    narrow: '{code}',
  } satisfies ResponsiveCopy,

  /** `661:10` / `661:11` — the headline badge prefixes the state, the aside card does not. */
  headlineBadge: requestStatusMessage.text('headlineBadge'),

  /** `661:12` — beside the headline badge. */
  submittedAt: requestStatusMessage.text('submittedAt'),

  /** `661:13` … `661:26` — the three-step progress card. */
  progress: {
    title: requestStatusMessage.text('progress.title'),
    steps: {
      submitted: requestStatusMessage.text('progress.steps.submitted'),
      underReview: requestStatusMessage.text('progress.steps.underReview'),
      answered: requestStatusMessage.text('progress.steps.answered'),
    },
    note: requestStatusMessage.text('progress.note'),
  },

  /** `661:27` … `661:49` — the frozen submission. */
  subject: {
    title: requestStatusMessage.text('subject.title'),
    frozen: requestStatusMessage.text('subject.frozen'),
    rows: {
      kind: requestStatusMessage.text('subject.rows.kind'),
      catalog: requestStatusMessage.text('subject.rows.catalog'),
      customerOwned: requestStatusMessage.text('subject.rows.customerOwned'),
      productName: requestStatusMessage.text('subject.rows.productName'),
      variantColorName: requestStatusMessage.text('subject.rows.variantColorName'),
      variantSizeLabel: requestStatusMessage.text('subject.rows.variantSizeLabel'),
      itemName: requestStatusMessage.text('subject.rows.itemName'),
      itemDescription: requestStatusMessage.text('subject.rows.itemDescription'),
      dimensions: requestStatusMessage.text('subject.rows.dimensions'),
      quantity: requestStatusMessage.text('subject.rows.quantity'),
    },
    /**
     * Printed wherever `APP5-B03` reports a field as absent rather than filling
     * it in — a catalog pair that can no longer be resolved (`661:*` subject
     * contract). Naming the wrong product would be worse than naming none, and
     * a later unpublication must not make the request itself unreadable.
     */
    missingValue: requestStatusMessage.text('subject.missingValue'),
    /** `661:38` and the tile labels beneath it (`661:40`, `661:46`). */
    assetsTitle: requestStatusMessage.text('subject.assetsTitle'),
    assetRoles: {
      copImage: requestStatusMessage.text('subject.assetRoles.copImage'),
      reference: requestStatusMessage.text('subject.assetRoles.reference'),
    },
    assetsNote: requestStatusMessage.text('subject.assetsNote'),
  },

  /** `661:178` / `661:246` / `661:314` — the workshop's message to this customer. */
  reason: {
    titles: {
      needsClarification: requestStatusMessage.text('reason.titles.needsClarification'),
      rejected: requestStatusMessage.text('reason.titles.rejected'),
      cancelled: requestStatusMessage.text('reason.titles.cancelled'),
    },
    note: requestStatusMessage.text('reason.note'),
    /**
     * `B05` allows a transition to be recorded without a customer-facing
     * message. The card still renders — the state is what the customer came to
     * read — and says plainly that no message was written, rather than showing
     * an empty box that reads as a failure to load.
     */
    absent: requestStatusMessage.text('reason.absent'),
  },

  /** `661:50` … `661:54` — the aside status card. */
  currentStatus: {
    title: requestStatusMessage.text('currentStatus.title'),
  },

  /** `661:55` … `661:58` — what the customer should do, per state. */
  nextSteps: {
    title: requestStatusMessage.text('nextSteps.title'),
  },

  /** `661:59` … `661:63` — identical in every approved state. */
  readOnly: {
    title: requestStatusMessage.text('readOnly.title'),
    points: requestStatusMessage.list('readOnly.points'),
  },

  /**
   * One entry per lifecycle state the customer can land on.
   *
   * The five APP5 states are transcribed from their own approved frame. The
   * sixth, `beyondIntake`, is not a frame: `APP5-B03` publishes the **full**
   * LC-11 enum truthfully, so a request that APP6 has already quoted, accepted,
   * digitised, sent to design review or approved will arrive here. Mapping any
   * of those onto an APP5 state would tell the customer something false, and
   * crashing on them would make this page fail the moment the next phase ships.
   * So they collapse into one neutral, accurate, action-free reading — which is
   * exactly what `661:59` already promises this page is.
   */
  states: {
    /** `661:11` / `661:53` / `661:54`. */
    new: {
      badge: requestStatusMessage.text('states.new.badge'),
      description: requestStatusMessage.text('states.new.description'),
      nextSteps: requestStatusMessage.list('states.new.nextSteps'),
    },
    /** `661:75` / `661:117` / `661:118` / `661:121` / `661:122`. */
    underReview: {
      badge: requestStatusMessage.text('states.underReview.badge'),
      description: requestStatusMessage.text('states.underReview.description'),
      nextSteps: requestStatusMessage.list('states.underReview.nextSteps'),
    },
    /** `661:139` / `661:185` / `661:186` / `661:189` / `661:190`. */
    needsClarification: {
      badge: requestStatusMessage.text('states.needsClarification.badge'),
      description: requestStatusMessage.text('states.needsClarification.description'),
      nextSteps: requestStatusMessage.list('states.needsClarification.nextSteps'),
    },
    /** `661:207` / `661:253` / `661:254` / `661:257` / `661:258`. */
    rejected: {
      badge: requestStatusMessage.text('states.rejected.badge'),
      description: requestStatusMessage.text('states.rejected.description'),
      nextSteps: requestStatusMessage.list('states.rejected.nextSteps'),
    },
    /** `661:275` / `661:321` / `661:322` / `661:325` / `661:326`. */
    cancelled: {
      badge: requestStatusMessage.text('states.cancelled.badge'),
      description: requestStatusMessage.text('states.cancelled.description'),
      nextSteps: requestStatusMessage.list('states.cancelled.nextSteps'),
    },
    /** No frame — see the note above. Says what is true and offers nothing. */
    beyondIntake: {
      badge: requestStatusMessage.text('states.beyondIntake.badge'),
      description: requestStatusMessage.text('states.beyondIntake.description'),
      nextSteps: requestStatusMessage.list('states.beyondIntake.nextSteps'),
    },
  },

  /** Announced politely once the link opens and the request is on screen. */
  liveAuthorized: requestStatusMessage.text('liveAuthorized'),
} as const;

/**
 * Substitutes one placeholder in an approved string.
 *
 * The frames write their variable parts inline — `Yêu cầu REQ-…`, `hết hiệu
 * lực ngày 23/08/2026` — so the sentence, including its word order and its
 * punctuation, stays in this file where the design authorized it, rather than
 * being reassembled from fragments by a component.
 */
export function fill(template: string, token: string, value: string): string {
  return template.replace(token, value);
}

/** The same substitution across both halves of an approved responsive pair. */
export function fillResponsive(copy: ResponsiveCopy, token: string, value: string): ResponsiveCopy {
  return { wide: fill(copy.wide, token, value), narrow: fill(copy.narrow, token, value) };
}
