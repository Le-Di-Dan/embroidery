/**
 * The ephemeral network key (`IMP-D043` PO-07, `APP3-B06A`).
 *
 * Rate limiting needs to tell requests apart without creating an identity.
 * `IMP-D043` rules that the key is an HMAC of normalized source network data
 * under a **rotating runtime salt**, that a raw IP is never persisted in Design
 * Session tables, and that the key is neither ownership nor customer identity.
 *
 * The salt is 32 CSPRNG bytes generated at construction and never written
 * anywhere. A process restart therefore invalidates every key, which is the
 * intended property: the value cannot be correlated across deployments, and
 * nothing durable ever holds it. Keys live only in the in-memory limiter.
 *
 * The address is normalized before hashing so that `::ffff:203.0.113.4` and
 * `203.0.113.4` are one key rather than two, and a port never varies it.
 *
 * Trust boundary: `X-Forwarded-For` is honoured only because the gateway is the
 * sole ingress (`CP0.3`). The gateway **appends** with
 * `$proxy_add_x_forwarded_for`, so the entry it wrote is the **last** one — and
 * that is the only entry in the header a client cannot choose. Taking it is what
 * stops a caller minting fresh keys to escape a limit; see `sourceAddressOf`
 * for the measurement that made this a correction rather than a preference.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';

/** Structural request shape: avoids importing an HTTP-server type. */
interface NetworkReadableRequest {
  readonly headers: Record<string, unknown>;
  readonly socket?: { readonly remoteAddress?: string | undefined } | undefined;
}

const UNKNOWN_SOURCE = 'unknown';

@Injectable()
export class EphemeralNetworkKeyService {
  private readonly salt: Buffer;

  // `@Optional()` is required, not decorative: without it Nest reads the
  // parameter's design-time type and tries to resolve `Buffer` as a provider.
  constructor(@Optional() salt: Buffer = randomBytes(32)) {
    this.salt = salt;
  }

  /** An opaque, non-reversible key for one source. Never logged or persisted. */
  keyFor(request: NetworkReadableRequest): string {
    const source = normalizeAddress(sourceAddressOf(request));
    return createHmac('sha256', this.salt).update(source, 'utf8').digest('base64');
  }
}

/**
 * The source this request really came from (`APP3-E01`).
 *
 * ## Why the **right-most** entry, and not the left-most
 *
 * This read used to take the left-most entry, on the stated assumption that the
 * gateway "rewrites" `X-Forwarded-For`. It does not: `CP0.3` sets the header
 * with nginx's `$proxy_add_x_forwarded_for`, which **appends** the connection's
 * address to whatever the client already sent. So a client that sends
 * `X-Forwarded-For: 1.2.3.4` produced `1.2.3.4, <realClient>` — and the
 * left-most read handed the limiter a value the attacker chose.
 *
 * `APP3-E01` measured it end to end: with the burst exhausted the same caller
 * was refused `429`, and one further request carrying its own
 * `X-Forwarded-For: 198.51.100.99` was allowed `201`. Every network-keyed
 * `IMP-D043` PO-07 control — 5 Session creations an hour, the 2-a-minute burst,
 * and the 60-a-minute read limit — was bypassable with one header. Both
 * components were correct in isolation; only the pair was wrong, which is what
 * a cross-layer checkpoint is for.
 *
 * The **last** entry is the one the trusted hop appended itself, so it is the
 * only value in the header a client cannot choose. It is also correct when the
 * client sends no header at all, when it sends an empty one, and when it sends
 * a list — which is why this is the fix rather than trusting the gateway to
 * start replacing.
 */
function sourceAddressOf(request: NetworkReadableRequest): string {
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
export function normalizeAddress(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') return UNKNOWN_SOURCE;
  const withoutZone = trimmed.split('%')[0] ?? trimmed;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(withoutZone);
  return mapped?.[1] ?? withoutZone;
}
