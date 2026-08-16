/**
 * What an APP5 intake upload tells the browser (`APP5-B02` §1, §11).
 *
 * The redaction is the whole point of this module existing separately from the
 * stored record. The completed idempotency record carries the bucket alias, the
 * object key, the checksum and the content fingerprint, because a replay needs
 * them; **none** of those reaches a client. What a customer needs is the id it
 * will hand to `APP5-B01`, the role it uploaded under, and the fact that the
 * file is being checked.
 *
 * `state` is fixed at `INSPECTING` rather than read back, and that is honest
 * rather than lazy: this view is only ever built at the end of Tx B, whose
 * whole job is to move the asset there. Re-reading would report the same value
 * and add a query that could disagree with the transaction that just committed.
 * Anything later is the status operation's answer, not this one's.
 */
import type { RequestIntakeCompleted } from '../../domain/intake/request-intake-result.codec';
import type { RequestIntakeRole } from '../../domain/intake/request-intake.policy';

export interface RequestIntakeView {
  /** The id `APP5-B01` binds once inspection accepts it. */
  readonly assetId: string;
  readonly role: RequestIntakeRole;
  readonly state: 'INSPECTING';
  readonly mediaType: string;
  readonly byteSize: number;
}

export function toRequestIntakeView(result: RequestIntakeCompleted): RequestIntakeView {
  return {
    assetId: result.assetId,
    role: result.role,
    state: 'INSPECTING',
    mediaType: result.mediaType,
    byteSize: result.byteSize,
  };
}
