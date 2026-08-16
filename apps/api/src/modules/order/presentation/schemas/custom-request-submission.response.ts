/**
 * What a successful submission returns (`APP5-G01` §4, §5).
 *
 * Three fields, and the list is the contract. It is deliberately identical to
 * the **stored idempotency result**, so a first submission and a replay of it
 * are indistinguishable to a client — which is what makes a safe retry actually
 * safe.
 *
 * What is absent is the point: no raw `REQUEST_ACCESS` grant token, no secure
 * link, no grant id, no customer id, no contact value, no challenge id, no
 * session id or secret, no storage key, no asset id, no design document and no
 * APP6 field (no quotation, no price, no design version). The customer's link
 * arrives through the APP4 notification path, never in this body.
 *
 * `code` is the human request code. It is safe here and it is **never an
 * authorization input** (CST-026): grant-scoped access is the mechanism, and
 * `APP5-B03` will accept a grant, never a code.
 */
import { ApiProperty } from '@nestjs/swagger';

export class CustomRequestSubmissionResponse {
  @ApiProperty({
    format: 'uuid',
    example: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071',
    description: 'The created custom request.',
  })
  requestId!: string;

  @ApiProperty({
    example: 'REQ-7KMPQ3XZ4A',
    description: 'Human request code. Quotable to support; never a credential.',
  })
  code!: string;

  @ApiProperty({
    example: 'NEW',
    description: 'LC-11 state. A submission always lands at NEW.',
  })
  status!: string;
}
