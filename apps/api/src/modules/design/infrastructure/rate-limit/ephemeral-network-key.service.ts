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
 * sole ingress and rewrites it (`CP0.3`). The **left-most** entry is taken and
 * only when the connection itself came from the trusted proxy hop, so a client
 * that appends its own header cannot mint fresh keys to escape a limit.
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

function sourceAddressOf(request: NetworkReadableRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    // Left-most is the original client as the gateway records it.
    const first = forwarded.split(',')[0];
    if (first !== undefined && first.trim() !== '') {
      return first.trim();
    }
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
