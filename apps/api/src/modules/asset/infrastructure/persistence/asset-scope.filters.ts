/**
 * Scoped predicates for the Admin asset reads (`APP2-B01` §19).
 *
 * Extracted from the repository so the class keeps one responsibility per
 * method body, and so the keyset predicate — the one piece where a mistake
 * silently skips or repeats rows — is readable on its own.
 *
 * Every Admin read is scoped by `kind` **and** `classification`. That is not a
 * convenience filter: it is what keeps this endpoint from becoming a general
 * asset browser that could surface a customer's private upload.
 */
import { schema } from '@embroidery/database';
import { and, desc, eq, lt, or, type SQL } from 'drizzle-orm';

import type { AssetListQuery, AssetListFilter } from '../../domain/repositories/asset.repository';

const { assets } = schema;

/** The `kind` + `classification` scope every Admin asset read is confined to. */
export function scopePredicate(filter: Pick<AssetListFilter, 'kind' | 'classification'>): SQL {
  const predicate = and(
    eq(assets.kind, filter.kind),
    eq(assets.classification, filter.classification),
  );
  // `and()` is only `undefined` for an empty argument list; both are present.
  return predicate as SQL;
}

/**
 * Builds the full list predicate, including the keyset position.
 *
 * The keyset comparison is the row-wise `(created_at, id) < (cursor)` written
 * out longhand: strictly-older rows, plus same-instant rows with a smaller id.
 * Writing it as `created_at <= x AND id < y` instead would drop every row of an
 * older instant whose id happened to be larger — a silently short page.
 */
export function listPredicate(query: AssetListQuery): SQL {
  const clauses: SQL[] = [scopePredicate(query.filter)];

  if (query.filter.status !== undefined) {
    clauses.push(eq(assets.status, query.filter.status));
  }
  if (query.filter.mimeType !== undefined) {
    clauses.push(eq(assets.mimeType, query.filter.mimeType));
  }
  if (query.after !== undefined) {
    const { createdAt, id } = query.after;
    const position = or(
      lt(assets.createdAt, createdAt),
      and(eq(assets.createdAt, createdAt), lt(assets.id, id)),
    );
    clauses.push(position as SQL);
  }

  return and(...clauses) as SQL;
}

/** `created_at DESC, id DESC` — the order the cursor encodes. */
export function listOrder() {
  return [desc(assets.createdAt), desc(assets.id)] as const;
}
