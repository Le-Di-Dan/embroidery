/**
 * The public background's canonical metadata, from SQL to the repository
 * contract (`APP3-B02` §7).
 *
 * Split from `drizzle-product-placement.repository.ts` by responsibility: that
 * file owns the statements, and this one owns the one value they project that
 * a public manifest publishes verbatim. Keeping the narrowing here also keeps
 * the guards visible — they are the difference between a Studio canvas and a
 * canvas of size zero.
 */
import { EDITOR_SAFE_DELIVERABLE_MEDIA_TYPES } from '../../domain/product-placement.policy';
import type { PublicPlacementBackgroundRow } from '../../domain/repositories/product-placement.repository';

/**
 * The approved media types as a SQL array literal.
 *
 * Built from the shared constant rather than written out, so the manifest's
 * notion of "deliverable" and `APP3-B02`'s cannot drift — a manifest that
 * advertised a background the delivery route then refused would be a Studio
 * that opens on nothing. Each member is a repository-owned literal, never
 * caller input, and is quoted defensively all the same.
 */
export function mediaTypeArrayLiteral(): string {
  const members = EDITOR_SAFE_DELIVERABLE_MEDIA_TYPES.map(
    (type) => `'${type.replaceAll("'", "''")}'`,
  );
  return `(array[${members.join(', ')}])`;
}

/** The shape the `json_build_object` subquery emits. Never trusted without narrowing. */
export interface EligibleBackgroundJson {
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly mediaType: string | null;
  readonly byteSize: string | null;
}

/**
 * Narrows the subquery's JSON into the repository contract, or refuses it.
 *
 * The predicate already excludes every NULL, so this is a narrowing rather than
 * a second rule — except for the positivity and range guards, which are real:
 * this is a public read path, and a row that somehow carried a zero dimension
 * would otherwise become a Studio canvas of size zero.
 */
export function toPublicBackground(
  value: EligibleBackgroundJson | null,
): PublicPlacementBackgroundRow | undefined {
  if (value === null) return undefined;
  const { widthPx, heightPx, mediaType, byteSize } = value;
  if (widthPx === null || heightPx === null || mediaType === null || byteSize === null) {
    return undefined;
  }
  if (widthPx <= 0 || heightPx <= 0) return undefined;

  // `byte_size` crosses as text because it is a `bigint` column: letting it
  // become a JSON number would lose precision silently above 2^53.
  const size = Number(byteSize);
  if (!Number.isSafeInteger(size) || size <= 0) return undefined;

  return { widthPx, heightPx, mediaType, byteSize: size };
}
