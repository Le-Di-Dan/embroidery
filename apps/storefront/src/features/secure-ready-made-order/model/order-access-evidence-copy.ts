/**
 * The optional transfer-evidence control on the customer's secure order page,
 * and what an uploaded file's state means.
 *
 * Split out of `order-access-copy.ts` by `APP12-V02` §41: that catalog reached
 * the 400-line source limit and this is the responsibility that comes out
 * whole. Evidence is the one part of the surface that is **not** about the
 * money — §22 keeps the two vocabularies apart, an accepted image means the
 * file is usable for reconciliation and nothing more — so it is also the part
 * a reader can hold in their head without the payment instruction beside it.
 *
 * It is re-exported into `ORDER_ACCESS_COPY` by spread, so every existing
 * `ORDER_ACCESS_COPY.evidence…` call site is unchanged.
 */
import { VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';
import { BRAND_NAME } from '@embroidery/ui';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/orders.json`, under `orderAccess`), not in this
 * file (`APP12-V02` §5A). The keys keep their original `evidence…` paths: the
 * split is a source-file boundary, not a message-repository one, and moving the
 * keys would have made a formatting change look like a copy change.
 */
const orderAccessMessage = messageView(
  hydrateMessages(VI_MESSAGES.orders, { brand: BRAND_NAME }),
  'orderAccess',
);

export const ORDER_ACCESS_EVIDENCE_COPY = {
  /** `910:331` … `910:334` — optional transfer evidence. */
  evidence: {
    title: orderAccessMessage.text('evidence.title'),
    /** `910:332` — optional, and it says so first. */
    lead: orderAccessMessage.text('evidence.lead'),
    /**
     * `910:334` renders the tile as *Chọn ảnh (tối đa 3)*.
     *
     * The count is interpolated from the delivered server quota rather than
     * transcribed, because `917:419`/`917:420` classifies payment evidence as
     * `REUSE_AS_IS` with *cùng ô tải ảnh, **cùng giới hạn*** — the same tile and
     * the same limits as APP7 — and APP7-B05 counts five per attempt under a
     * lock. The mock's literal `3` and the reuse directive disagree; the
     * directive wins, because the server is the quota authority and a tile
     * promising three would under-report a limit the customer actually has.
     * Recorded as `FU-APP12-S03-02`.
     */
    choosePrefix: orderAccessMessage.text('evidence.choosePrefix'),
    chooseSuffix: orderAccessMessage.text('evidence.chooseSuffix'),
    /**
     * The label on the control itself (`V01-UX-014`, `APP12-V02` §18).
     *
     * The tile's fine print names the quota; the control names the action. They
     * were one string before, which left the browser to supply the only verb on
     * the surface — `Choose File`, in English.
     */
    chooseAction: orderAccessMessage.text('evidence.chooseAction'),
    /** What was chosen, once something has been. */
    selectedFile: (name: string): string =>
      orderAccessMessage.text('evidence.selectedFile', { name }),
    constraint: orderAccessMessage.text('evidence.constraint'),
    uploading: orderAccessMessage.text('evidence.uploading'),
    /** Said beside the title, so *optional* is stated before the control is. */
    optionalBadge: orderAccessMessage.text('evidence.optionalBadge'),
    empty: orderAccessMessage.text('evidence.empty'),
    listLabel: orderAccessMessage.text('evidence.listLabel'),
    /**
     * The sentence that keeps the two vocabularies apart (§22). An accepted
     * image means the file is usable for reconciliation and nothing more; it is
     * rendered as part of this section rather than as an aside elsewhere.
     */
    truth: orderAccessMessage.text('evidence.truth'),
    /** Quota reached: the intake closes, the list stays as history. */
    quotaReached: orderAccessMessage.text('evidence.quotaReached'),
  },

  /**
   * An image's state is the *image's*, never the payment's (§22).
   *
   * Four stored values, three labels: `UPLOADED` and `INSPECTING` are one
   * customer fact — the file arrived and is being looked at — and a fourth
   * label for a distinction the product does not have would be invention. Each
   * note says what the state means for the **file**, and none of the four says
   * anything about the money.
   */
  evidenceStatus: {
    UPLOADED: {
      label: orderAccessMessage.text('evidenceStatus.UPLOADED.label'),
      note: orderAccessMessage.text('evidenceStatus.UPLOADED.note'),
    },
    INSPECTING: {
      label: orderAccessMessage.text('evidenceStatus.INSPECTING.label'),
      note: orderAccessMessage.text('evidenceStatus.INSPECTING.note'),
    },
    ACCEPTED: {
      label: orderAccessMessage.text('evidenceStatus.ACCEPTED.label'),
      note: orderAccessMessage.text('evidenceStatus.ACCEPTED.note'),
    },
    REJECTED: {
      label: orderAccessMessage.text('evidenceStatus.REJECTED.label'),
      note: orderAccessMessage.text('evidenceStatus.REJECTED.note'),
    },
  },

  /** The refusals a customer may see beside the evidence control. */
  evidenceFailure: {
    MEDIA_UNSUPPORTED: orderAccessMessage.text('evidenceFailure.MEDIA_UNSUPPORTED'),
    TOO_LARGE: orderAccessMessage.text('evidenceFailure.TOO_LARGE'),
    QUOTA_REACHED: orderAccessMessage.text('evidenceFailure.QUOTA_REACHED'),
    ATTEMPT_CLOSED: orderAccessMessage.text('evidenceFailure.ATTEMPT_CLOSED'),
    REVERIFICATION_REQUIRED: orderAccessMessage.text('evidenceFailure.REVERIFICATION_REQUIRED'),
    IN_PROGRESS: orderAccessMessage.text('evidenceFailure.IN_PROGRESS'),
    TRANSIENT: orderAccessMessage.text('evidenceFailure.TRANSIENT'),
    retry: orderAccessMessage.text('evidenceFailure.retry'),
  },
} as const;
