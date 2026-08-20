/**
 * What a committed customer decision looks like to the browser that made it
 * (`APP6-B05` §21).
 *
 * Two narrow types, not one shared type with optional halves. An acceptance and
 * a rejection commit different facts — one writes evidence and moves the Custom
 * Request, the other moves only the quotation — and a single type would have to
 * make the difference optional, which is how a rejection response ends up
 * carrying an `acceptedTotalAmount` of `null` and a screen ends up rendering it.
 *
 * ### What is absent from both, and why
 *
 * **Credentials and identity.** No token, digest, `grantId`, `customerId`,
 * `stepUpChallengeId` or `customRequestId`. The response echoes back nothing
 * that was presented to obtain it, and names no identifier the caller did not
 * already hold. The step-up challenge is the sharpest of these: it is the proof
 * this decision was authorized by, it is written to TBL-053, and publishing it
 * would hand a caller the id of a verification row.
 *
 * **Audit and idempotency internals.** No audit event id, no
 * `idempotency_records` id, no correlation id, no acceptance row id.
 *
 * **The Custom Request's state, on the rejection view.** Absent, and absent
 * because `TR-LC12-06` is quotation-scoped (`APP6-B05` §13): rejecting a price
 * is not the Admin moderation outcome that `REJECTED` means on a request, and
 * the request stays in the quotation stage where a revised version can be
 * drafted and sent. A field reporting a state this transaction did not touch
 * would invite a screen to render "your request was rejected", which is exactly
 * the confusion the rule exists to prevent. The acceptance view carries
 * `requestStatus` for the opposite reason: there, the projection **is** part of
 * what committed.
 *
 * **Downstream promises.** No order, no order id, no payment obligation, no
 * payment instruction, no deposit due date, no reservation. APP6 stops before
 * all of them (`APP6-B05` §16), and a field here saying otherwise would be a
 * commitment the transaction did not make.
 *
 * ### Amounts stay strings
 *
 * `acceptedTotalAmount` is the `numeric(14,2)` written to TBL-053, which is the
 * frozen version's own total read back off the row. Nothing on this path adds,
 * rounds or parses it.
 */

export interface QuotationAcceptedView {
  /** The exact version accepted — the one the customer's decision named. */
  readonly versionId: string;
  readonly version: number;
  /** The stored LC-13 state after the move. `ACCEPTED` on both paths. */
  readonly versionStatus: string;
  /** The stored LC-12 header state after the move. */
  readonly quotationStatus: string;
  /**
   * The Custom Request's state after the same transaction — `QUOTE_ACCEPTED`.
   *
   * Returned because it is the fact that makes the acceptance meaningful to the
   * screen, and read back off the row rather than assumed: reporting what this
   * code believes it wrote is how a response starts disagreeing with the row.
   */
  readonly requestStatus: string;
  /** Exactly what TBL-053 recorded, as the string it is. */
  readonly acceptedTotalAmount: string;
  readonly currencyCode: string;
  readonly acceptedAt: Date;
  /**
   * Whether this call re-served an earlier acceptance rather than performing one
   * (`quotation.accept` idempotency).
   *
   * The screen needs it: a customer who double-submitted must see the same
   * confirmation, not a second one, and a client that retried after a dropped
   * response must be able to tell that its first attempt landed.
   */
  readonly replayed: boolean;
}

export interface QuotationRejectedView {
  readonly versionId: string;
  readonly version: number;
  /** `REJECTED` — the terminal LC-13 state that *is* the record of the decision. */
  readonly versionStatus: string;
  readonly quotationStatus: string;
  /** When the decision committed, as recorded in its audit event. */
  readonly rejectedAt: Date;
}
