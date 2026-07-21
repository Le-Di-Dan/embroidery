/**
 * Dataset tier definitions for the DB9 benchmark harness (DB9-CP1).
 *
 * Row counts derive from the DB5 query shapes rather than from round
 * numbers: a tier exists to make a *plan* meaningful, and a plan only
 * becomes meaningful once a table is large enough that the planner stops
 * choosing a sequential scan for everything. `S` is the correctness smoke
 * tier (the harness proves itself against it); `M` is the representative
 * local tier every DB9 result is quoted at unless stated; `L` is the local
 * stress tier used where deep pagination, append volume or index write cost
 * only shows up at scale.
 *
 * These are *local benchmark* volumes, deliberately far above the locked
 * business scale in `DB5_QUERY_SHAPE_CATALOG.md` (20–100 products, <100
 * orders/month). Measuring at the business scale alone would prove nothing:
 * every plan is a sequential scan at 100 rows, which is correct and
 * uninformative. Measuring above it is how a plan regression becomes
 * visible before production volume arrives.
 *
 * Test-only.
 */

export type DatasetTierName = 'S' | 'M' | 'L';

export interface DatasetTier {
  readonly name: DatasetTierName;
  readonly description: string;
  /** Catalog breadth — drives Q-01/Q-02/Q-03/Q-20. */
  readonly categories: number;
  readonly products: number;
  readonly variantsPerProduct: number;
  /** Customer fanout — drives Q-09/QX-08. */
  readonly customers: number;
  /** Request/order pipeline — drives Q-15/Q-19/Q-21/Q-22. */
  readonly requests: number;
  readonly orders: number;
  readonly orderItemsPerOrder: number;
  /** Version history — drives Q-10/Q-12 deep pagination. */
  readonly designVersions: number;
  readonly quotationVersions: number;
  /** Money evidence — drives Q-16/Q-17/Q-18/Q-23. */
  readonly obligations: number;
  readonly providerEvents: number;
  /** Append-heavy tables — drive CP4 write amplification. */
  readonly auditEvents: number;
  readonly outboxEvents: number;
  readonly notificationIntents: number;
  readonly notificationAttempts: number;
  readonly ledgerEntries: number;
  /** Queue-ready subsets, expressed as a fraction of their parent table. */
  readonly readyFraction: number;
  /** Hot-SKU skew: this fraction of inventory activity targets 5% of SKUs. */
  readonly hotSkuFraction: number;
  /** Content/SEO surface — drives Q-05/Q-06/Q-07. */
  readonly contentPages: number;
  readonly redirectRules: number;
  readonly galleryEntries: number;
}

const S: DatasetTier = {
  name: 'S',
  description: 'Smoke/correctness — proves the generator and assertions, not performance',
  categories: 3,
  products: 10,
  variantsPerProduct: 2,
  customers: 20,
  requests: 20,
  orders: 10,
  orderItemsPerOrder: 2,
  designVersions: 20,
  quotationVersions: 20,
  obligations: 20,
  providerEvents: 40,
  auditEvents: 200,
  outboxEvents: 100,
  notificationIntents: 60,
  notificationAttempts: 120,
  ledgerEntries: 100,
  readyFraction: 0.2,
  hotSkuFraction: 0.6,
  contentPages: 10,
  redirectRules: 20,
  galleryEntries: 10,
};

const M: DatasetTier = {
  name: 'M',
  description: 'Representative local — the tier every DB9 result is quoted at unless stated',
  categories: 12,
  products: 200,
  variantsPerProduct: 4,
  customers: 2_000,
  requests: 3_000,
  orders: 1_500,
  orderItemsPerOrder: 3,
  designVersions: 6_000,
  quotationVersions: 6_000,
  obligations: 3_000,
  providerEvents: 8_000,
  auditEvents: 60_000,
  outboxEvents: 20_000,
  notificationIntents: 12_000,
  notificationAttempts: 30_000,
  ledgerEntries: 20_000,
  readyFraction: 0.15,
  hotSkuFraction: 0.7,
  contentPages: 200,
  redirectRules: 2_000,
  galleryEntries: 300,
};

const L: DatasetTier = {
  name: 'L',
  description: 'Stress local — deep pagination, append volume and index write cost',
  categories: 30,
  products: 1_000,
  variantsPerProduct: 6,
  customers: 10_000,
  requests: 20_000,
  orders: 10_000,
  orderItemsPerOrder: 4,
  designVersions: 40_000,
  quotationVersions: 40_000,
  obligations: 20_000,
  providerEvents: 60_000,
  auditEvents: 400_000,
  outboxEvents: 150_000,
  notificationIntents: 80_000,
  notificationAttempts: 200_000,
  ledgerEntries: 150_000,
  readyFraction: 0.1,
  hotSkuFraction: 0.75,
  contentPages: 1_000,
  redirectRules: 20_000,
  galleryEntries: 2_000,
};

export const DATASET_TIERS: Readonly<Record<DatasetTierName, DatasetTier>> = { S, M, L };

export function tier(name: DatasetTierName): DatasetTier {
  return DATASET_TIERS[name];
}
