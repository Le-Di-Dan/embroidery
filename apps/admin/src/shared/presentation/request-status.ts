/**
 * How a custom request's status is named to an operator, for the whole Admin app.
 *
 * Extracted by `APP6-A02`, closing
 * `FU-APP6-A01-C1-REQUEST-STATUS-COPY-DUPLICATION-01`. `APP5-A02` and `APP6-A01`
 * each carried a private map of the same ten LC-11 statuses to the same ten
 * Vietnamese labels; the design-case workbench would have been the third. Three
 * copies of one vocabulary is three chances for a request to change its name as
 * the operator moves between screens — which is precisely the defect `A01-C1`
 * found and fixed by hand, one screen at a time.
 *
 * ## It is presentation, and only presentation
 *
 * There is deliberately **no** lifecycle authority here: no transition table, no
 * action matrix, no "can this move to X", no ordering and no grouping. Those are
 * server facts, and a helper that answered them would become a second lifecycle
 * authority living in the browser. What this module knows is how to spell a
 * status in Vietnamese, and nothing else.
 *
 * The backend enum is not widened either. This is a lookup over strings the
 * contract already publishes; adding a key here would not make the server accept
 * one.
 *
 * ## Total by construction
 *
 * `presentRequestStatus` accepts `unknown` and always returns a string. A status
 * the contract gains later degrades to the neutral label rather than reaching a
 * screen as a raw `NEEDS_CLARIFICATION` — the exact leak `APP6-A01-C1` found in
 * the browser, where the rail rendered `detail.status` directly and put an
 * English enum member on an otherwise Vietnamese page.
 *
 * A label is never colour alone (`CLAUDE.md` accessibility): callers render this
 * text, and any tint a stylesheet adds is a redundant cue.
 */

/**
 * The ten LC-11 statuses, with the approved copy `APP5-A02` and `APP6-A01`
 * already render.
 *
 * Kept verbatim from those two features rather than re-translated: the operator
 * moves between the request detail, the quotation workbench and the design-case
 * workbench, and a request must not change its name in transit.
 */
const REQUEST_STATUS_LABELS: Readonly<Record<string, string>> = {
  NEW: 'Mới',
  UNDER_REVIEW: 'Đang xem xét',
  NEEDS_CLARIFICATION: 'Cần làm rõ',
  QUOTED: 'Đã báo giá',
  QUOTE_ACCEPTED: 'Đã nhận báo giá',
  DIGITIZING: 'Đang số hoá',
  DESIGN_REVIEW: 'Duyệt thiết kế',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã huỷ',
};

/** The neutral fallback, for a status this build has no approved label for. */
export const UNKNOWN_REQUEST_STATUS_LABEL = 'Không xác định';

export interface RequestStatusPresentation {
  /** The stored value when this build has a label for it, else `UNKNOWN`. */
  readonly token: string;
  readonly label: string;
  readonly known: boolean;
}

/**
 * The request's status as an operator reads it.
 *
 * The full presentation, for callers that also need to know whether the value
 * was recognised — a badge that tints a known status but must not tint an
 * unrecognised one, for instance.
 */
export function presentRequestStatusDetail(status: unknown): RequestStatusPresentation {
  const label = typeof status === 'string' ? REQUEST_STATUS_LABELS[status] : undefined;
  return label === undefined
    ? { token: 'UNKNOWN', label: UNKNOWN_REQUEST_STATUS_LABEL, known: false }
    : { token: status as string, label, known: true };
}

/** The label alone, for the common case. */
export function presentRequestStatus(status: unknown): string {
  return presentRequestStatusDetail(status).label;
}
