/**
 * TanStack cache keys for `APP5-S01`.
 *
 * Every key is scoped by the thing that owns the data: the variant list by
 * product slug, an asset's inspection state by the challenge **and** the asset.
 * The challenge is part of the asset key rather than an implicit ambient value
 * because `APP5-B02` answers only for an attachment uploaded by that challenge —
 * two challenges are two different worlds, and a key that omitted it could serve
 * one challenge's cached answer to another.
 *
 * No key here contains a contact, a code, a file or a secret of any kind.
 */
export const customRequestQueryKeys = {
  all: ['custom-request'] as const,
  catalogVariants: (productSlug: string) =>
    [...customRequestQueryKeys.all, 'catalog-variants', productSlug] as const,
  assetStatus: (challengeId: string, assetId: string) =>
    [...customRequestQueryKeys.all, 'asset-status', challengeId, assetId] as const,
} as const;
