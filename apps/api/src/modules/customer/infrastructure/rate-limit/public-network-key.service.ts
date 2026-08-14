/**
 * The opaque per-source key the secure-link limiter counts against
 * (`APP4-B06` §12).
 *
 * ## The trust boundary, and the bug this inherits the fix for
 *
 * `X-Forwarded-For` is honoured **only** because the Nginx gateway is the sole
 * ingress (`CP0.3`), and only its **right-most** entry is read. The gateway sets
 * the header with `$proxy_add_x_forwarded_for`, which *appends* the connection's
 * address to whatever the client already sent — so a client sending
 * `X-Forwarded-For: 1.2.3.4` produces `1.2.3.4, <realClient>`, and the left-most
 * entry is a value the attacker chose.
 *
 * `APP3-E01` measured exactly that: with a burst exhausted, one further request
 * carrying a self-supplied `X-Forwarded-For` was allowed through, bypassing every
 * network-keyed control. The last entry is the one the trusted hop appended
 * itself, so it is the only value in the header a client cannot choose. This file
 * takes the last entry for that reason and no other.
 *
 * ## Why this is not an import
 *
 * `EphemeralNetworkKeyService` in the Design module does the same thing. It is
 * deliberately **not** imported: it is owned by `IMP-D043` PO-07, it is parsed by
 * four APP3 checkers, and making `CustomerModule` depend on `DesignModule` to
 * reach it would couple two contexts for a twelve-line function. The repository's
 * own precedent is the reverse — `LoginRateLimiter` and `DesignSessionRateLimiter`
 * each own their limiter over one shared *platform* algorithm — so the algorithm
 * is shared (`SlidingWindowRateLimiter`) and the module-local seam is not.
 *
 * The cost is that the forwarding rule now exists twice, so it is written out
 * above rather than left as folklore; the checker asserts the last entry is taken.
 *
 * ## What the key is not
 *
 * Not an identity, not ownership, and never persisted. The address is HMAC'd
 * under a 32-byte CSPRNG salt generated at construction and written nowhere, so a
 * restart invalidates every key and no raw IP is retained in memory. It is never
 * logged and never audited.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';

/** Structural request shape: avoids importing an HTTP-server type. */
export interface NetworkReadableRequest {
  readonly headers: Record<string, unknown>;
  readonly socket?: { readonly remoteAddress?: string | undefined } | undefined;
}

const UNKNOWN_SOURCE = 'unknown';

@Injectable()
export class PublicNetworkKeyService {
  private readonly salt: Buffer;

  // `@Optional()` is required, not decorative: without it Nest reads the
  // parameter's design-time type and tries to resolve `Buffer` as a provider.
  constructor(@Optional() salt: Buffer = randomBytes(32)) {
    this.salt = salt;
  }

  /** An opaque, non-reversible key for one source. Never logged or persisted. */
  keyFor(request: NetworkReadableRequest): string {
    const source = normalizePublicAddress(trustedSourceAddress(request));
    return createHmac('sha256', this.salt).update(source, 'utf8').digest('base64');
  }
}

/**
 * The address the trusted hop appended — the **last** `X-Forwarded-For` entry.
 *
 * Correct in all four shapes a request can arrive in: no header (fall back to
 * the socket), an empty header, a single entry written by the gateway, and a
 * list whose earlier entries the client forged.
 */
export function trustedSourceAddress(request: NetworkReadableRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    const hops = forwarded.split(',').filter((hop) => hop.trim() !== '');
    const nearest = hops[hops.length - 1];
    if (nearest !== undefined) return nearest.trim();
  }
  return request.socket?.remoteAddress ?? UNKNOWN_SOURCE;
}

/**
 * Lowercases, strips an IPv6 zone and unwraps an IPv4-mapped IPv6 address, so
 * one client cannot occupy several buckets by changing representation.
 */
export function normalizePublicAddress(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') return UNKNOWN_SOURCE;
  const withoutZone = trimmed.split('%')[0] ?? trimmed;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(withoutZone);
  return mapped?.[1] ?? withoutZone;
}
