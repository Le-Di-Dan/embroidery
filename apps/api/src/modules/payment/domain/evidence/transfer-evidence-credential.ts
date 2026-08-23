/**
 * The two values the multipart body carries before the file (`APP7-B05` §4,
 * §5).
 *
 * Separate from the intake service because it is a *shape* rule with no
 * dependencies: it decides whether the two fields the parser collected could
 * possibly address a deposit, and nothing else. The parser proves the body's
 * structure, this proves the fields' form, and the authorizer proves the facts —
 * three steps, in cost order, so the cheapest refusal happens first.
 *
 * ### Both refusals are the non-enumerating one
 *
 * A malformed token and a malformed attempt id both mean "this request opens no
 * deposit", which is exactly what an unknown token means. Answering differently
 * would tell a prober which half of its guess was wrong, and the whole customer
 * surface is built so that no refusal distinguishes "does not exist" from "is
 * not yours".
 *
 * ### Neither pattern is a security control
 *
 * They are the published wire contracts, restated. A well-formed token still
 * resolves for nobody unless it digests to a live grant, and a well-formed
 * attempt id still fails the chain unless the grant reaches that exact row.
 */
import { secureLinkUnavailable } from '../../../customer/domain/grant/secure-link.errors';

/** `ADR-APP4-001` §5.2 — 32 CSPRNG bytes as unpadded base64url. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The `uuid7` shape every application id has. Shape only; never authority. */
const ATTEMPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the caller sent, once the parser has proved the body's shape. */
export interface TransferEvidenceCredential {
  readonly token: string;
  readonly attemptId: string;
}

/**
 * Narrows the two collected fields, or refuses indistinguishably.
 *
 * Missing fields cannot reach here — the parser refuses a body that arrives at
 * the file part without every declared credential — but the empty-string
 * fallback keeps that a checked fact rather than an assumption, because a `!`
 * here would be the one place a parser change became a `TypeError` on a
 * customer's payment screen.
 */
export function readTransferEvidenceCredential(
  fields: Readonly<Record<string, string>>,
  tokenField: string,
  attemptField: string,
): TransferEvidenceCredential {
  const token = fields[tokenField] ?? '';
  const attemptId = fields[attemptField] ?? '';
  if (!TOKEN_PATTERN.test(token) || !ATTEMPT_ID_PATTERN.test(attemptId)) {
    throw secureLinkUnavailable();
  }
  return { token, attemptId };
}
