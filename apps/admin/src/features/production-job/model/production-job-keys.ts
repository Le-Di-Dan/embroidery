/**
 * The query-key factory for one production job.
 *
 * The key carries the `jobId` and nothing else — that is the only address
 * `APP8-B03`'s detail operation accepts. No credential, `AbortSignal` or raw
 * error appears here: a key is serialized into the cache and would outlive the
 * request that produced it.
 *
 * ## One root, two features
 *
 * The root is the same `['admin', 'production-jobs']` the queue reads under, and
 * it is imported from the queue rather than re-spelled: `APP8-A02` published
 * `productionQueueKeys` for exactly this reason, because a transition here
 * changes which jobs belong in a status-filtered queue there. Two spellings of
 * one cache key is how an invalidation silently stops matching and an operator
 * returns to a queue still listing work they finished.
 *
 * Nothing is generalised beyond that. There is no shared key framework and no
 * cross-feature key builder — the detail needs one address and the queue keeps
 * its own filtered list keys.
 */
import { productionQueueKeys } from '../../production-queue';

export const productionJobKeys = {
  all: productionQueueKeys.all,
  /** One job's authoritative detail. */
  detail: (jobId: string) => [...productionQueueKeys.all, 'detail', jobId] as const,
  /** The queue root a committed transition must invalidate. */
  queue: () => productionQueueKeys.lists(),
} as const;
