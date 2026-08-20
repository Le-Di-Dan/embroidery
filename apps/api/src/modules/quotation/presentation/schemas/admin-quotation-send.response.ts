/**
 * What the Admin send mutation returns (`APP6-B03`).
 *
 * One new component, and it is a wrapper: the quotation header, the version and
 * the line items are `APP6-B02`'s **accepted** classes, referenced rather than
 * redeclared. A second `AdminQuotationSentVersionResponse` carrying the same
 * twenty fields would be a second published answer to "what did version 3 cost",
 * and the generated client would carry two types that must be kept identical by
 * hand. Referencing them also means the operator's confirmation is the archive
 * entry — the send screen and the history screen cannot disagree.
 *
 * Every amount is therefore already a `string` in the document and every
 * nullable property already states its scalar type; `APP6-B02`'s response file
 * records why both matter, and this file inherits that instead of restating it.
 * The three fields added here are booleans and a status string, so the
 * `type: object` debt `FU-APP6-B02-NULLABLE-OBJECT-TYPE-DEBT-01` tracks is not
 * extended by any of them.
 */
import { ApiProperty } from '@nestjs/swagger';

import {
  AdminQuotationHeaderResponse,
  AdminQuotationLineItemResponse,
  AdminQuotationVersionResponse,
  type AdminQuotationHeaderPayload,
  type AdminQuotationLineItemPayload,
  type AdminQuotationVersionPayload,
} from './admin-quotation-version.response';

export class AdminQuotationSentResponse {
  @ApiProperty({
    type: AdminQuotationHeaderResponse,
    description:
      'The quotation as it stands after the send. `currentVersionId` now names the version ' +
      'below — that pointer is advanced by this transaction and by no other.',
  })
  quotation!: AdminQuotationHeaderResponse;

  @ApiProperty({
    type: AdminQuotationVersionResponse,
    description:
      'The frozen version. Its amounts are the ones it was drafted with, unchanged by the ' +
      'send; `sentAt`, `validFrom` and `validUntil` are the facts the send added.',
  })
  version!: AdminQuotationVersionResponse;

  @ApiProperty({
    type: [AdminQuotationLineItemResponse],
    description: 'The version’s own priced lines, ordered by position and untouched by the send.',
  })
  lineItems!: AdminQuotationLineItemResponse[];

  @ApiProperty({
    example: 'QUOTED',
    description:
      'The custom request’s state after the transaction. `QUOTED` once a quotation has been ' +
      'sent — reached only as a projection of this send, never as a status a client may set.',
  })
  requestStatus!: string;

  @ApiProperty({
    example: true,
    description:
      'Whether this send projected the `UNDER_REVIEW → QUOTED` transition. `false` when the ' +
      'request was already `QUOTED`: a newer version replaced the customer-current one and no ' +
      'transition was appended, because the request did not move.',
  })
  requestTransitioned!: boolean;

  @ApiProperty({
    example: false,
    description:
      'Whether this call replayed an already-sent version. A replay returns the committed ' +
      'result and writes nothing: no re-freeze, no new validity window, no pointer change, no ' +
      'transition and no second notification.',
  })
  replayed!: boolean;
}

export interface AdminQuotationSentPayload {
  readonly quotation: AdminQuotationHeaderPayload;
  readonly version: AdminQuotationVersionPayload;
  readonly lineItems: readonly AdminQuotationLineItemPayload[];
  readonly requestStatus: string;
  readonly requestTransitioned: boolean;
  readonly replayed: boolean;
}
