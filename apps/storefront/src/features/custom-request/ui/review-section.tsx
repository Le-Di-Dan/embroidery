'use client';

/**
 * Review before submit (`656:3`, mobile `658:222`).
 *
 * ## No ids, and no promises
 *
 * Everything shown is a label the customer chose or a fact they can recognise:
 * the variant appears as its published colour and size, the design as *attached*,
 * the contact as the server's own mask. No product id, variant id, session id,
 * challenge id or asset id is rendered (`APP5-S01` §13) — none of them means
 * anything to the person reading, and one of them is an idempotency scope.
 *
 * The closing line states what submitting is **not**: no quote, no approval, no
 * payment, no order. `APP5-D01` puts that sentence on this frame precisely
 * because a "review and submit" screen otherwise reads like a checkout.
 */
import { CUSTOM_REQUEST_COPY } from '../model/custom-request-copy';
import { REVIEW_NOTE_MAX, type RequestSubject } from '../model/custom-request-flow';
import type { CustomerOwnedDraft } from '../model/customer-owned-draft';
import { quantityTotal, type QuantityDraftLine } from '../model/quantity-breakdown';
import { bindableSlots, slotsOfRole, type AssetSlot } from '../model/request-asset-slot';

export interface ReviewSectionProps {
  readonly subject: RequestSubject;
  /** Composed variant label, already resolved. Never the id. */
  readonly variantLabel: string | undefined;
  readonly customerOwned: CustomerOwnedDraft;
  readonly quantityLines: readonly QuantityDraftLine[];
  readonly slots: readonly AssetSlot[];
  /** The server's own mask, displayed as received. */
  readonly recipientMasked: string | undefined;
  readonly customerNote: string;
  readonly onNoteChange: (value: string) => void;
}

export function ReviewSection(props: ReviewSectionProps) {
  const { subject, variantLabel, customerOwned, quantityLines, slots, recipientMasked } = props;
  const bindable = bindableSlots(slots);
  const noteTooLong = props.customerNote.trim().length > REVIEW_NOTE_MAX;

  return (
    <section className="custom-request__section" aria-label={CUSTOM_REQUEST_COPY.review.heading}>
      <h2 className="custom-request__section-heading">{CUSTOM_REQUEST_COPY.review.heading}</h2>

      <dl className="custom-request__summary">
        {row(
          CUSTOM_REQUEST_COPY.review.heading,
          subject === 'CATALOG'
            ? CUSTOM_REQUEST_COPY.review.subjectCatalog
            : CUSTOM_REQUEST_COPY.review.subjectCustomerOwned,
        )}

        {subject === 'CATALOG' ? (
          <>
            {row(CUSTOM_REQUEST_COPY.review.variant, variantLabel)}
            {row(CUSTOM_REQUEST_COPY.review.design, CUSTOM_REQUEST_COPY.review.designAttached)}
          </>
        ) : (
          <>
            {row(CUSTOM_REQUEST_COPY.review.item, customerOwned.name.trim())}
            {row(CUSTOM_REQUEST_COPY.review.description, customerOwned.description.trim())}
            {row(CUSTOM_REQUEST_COPY.review.dimensions, dimensions())}
          </>
        )}

        {row(CUSTOM_REQUEST_COPY.review.quantities, String(quantityTotal(quantityLines)))}
        {row(CUSTOM_REQUEST_COPY.review.itemPhotos, String(countBindable('COP_IMAGE')))}
        {row(CUSTOM_REQUEST_COPY.review.references, String(countBindable('REFERENCE')))}
        {row(CUSTOM_REQUEST_COPY.review.contact, recipientMasked)}
      </dl>

      <div className="custom-request__field">
        <label htmlFor="review-note">{CUSTOM_REQUEST_COPY.review.note}</label>
        <textarea
          id="review-note"
          rows={3}
          maxLength={REVIEW_NOTE_MAX}
          value={props.customerNote}
          aria-invalid={noteTooLong}
          {...(noteTooLong ? { 'aria-describedby': 'review-note-error' } : {})}
          onChange={(event) => {
            props.onNoteChange(event.target.value);
          }}
        />
        {noteTooLong ? (
          <p id="review-note-error" className="custom-request__error">
            {CUSTOM_REQUEST_COPY.review.noteTooLong}
          </p>
        ) : null}
      </div>

      <p className="custom-request__hint">{CUSTOM_REQUEST_COPY.review.disclaimer}</p>
    </section>
  );

  /** Counted from `bindable`, so the number is what would actually be sent. */
  function countBindable(role: 'COP_IMAGE' | 'REFERENCE'): number {
    return slotsOfRole(bindable, role).length;
  }

  function dimensions(): string {
    const width = customerOwned.widthMm.trim();
    const height = customerOwned.heightMm.trim();
    if (width === '' && height === '') return '';
    return `${width === '' ? '—' : width} × ${height === '' ? '—' : height} mm`;
  }

  /** A row is omitted rather than shown empty: a blank value states nothing. */
  function row(term: string, value: string | undefined) {
    if (value === undefined || value === '') return null;
    return (
      <div className="custom-request__summary-row">
        <dt>{term}</dt>
        <dd>{value}</dd>
      </div>
    );
  }
}
