/**
 * The three Admin category write operations (`APP12-C02`).
 *
 * This is the seam that makes the taxonomy operator-managed. Before it, adding
 * a category meant an INSERT run by hand against production, or a migration and
 * a deployment. After it, an operator creates a draft, edits it, publishes it,
 * and the Storefront serves it on the next read — with no source edit, no
 * contract edit, no build and no restart.
 *
 * The service owns orchestration and every lifecycle decision; the repository
 * owns persistence and opens no transaction of its own. Each operation is one
 * transaction, and nothing inside it touches object storage or the network.
 *
 * Two rules shape all three, both inherited from `ProductDraftService`:
 *
 * - **Guarded writes only.** Identity, the allowed source state and the exact
 *   `updated_at` the caller read all travel into the same UPDATE.
 * - **The client never names a derived value.** `status` and `archivedAt` are
 *   server-owned; a create is always a `DRAFT`, and the lifecycle moves only
 *   through {@link AdminCategoryService.transition}.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError, newId } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { adminCategoryError } from '../domain/admin-category.errors';
import {
  CATEGORY_ARCHIVED_STATE,
  CATEGORY_INITIAL_STATE,
  CATEGORY_TRANSITIONS,
  isSlugMutable,
  type CategoryTransitionAction,
} from '../domain/admin-category.policy';
import {
  ADMIN_CATEGORY_REPOSITORY,
  type AdminCategory,
  type AdminCategoryRepository,
  type UpdateCategoryFields,
} from '../domain/repositories/admin-category.repository';
import type { CategoryId } from '../domain/repositories/product.repository';
import { AdminCategoryRecorder } from './admin-category.recorder';
import { toAdminCategoryView, type AdminCategoryView } from './admin-category.projection';

/** The persistence code `uq_categories__slug` is mapped to by the constraint catalog. */
const DUPLICATE_SLUG_CODE = 'DUPLICATE_SLUG';

export interface CreateCategoryCommand {
  readonly slug: string;
  readonly name: string;
  readonly isIndexable: boolean;
  readonly displayOrder: number;
}

export interface UpdateCategoryCommand {
  readonly categoryId: string;
  readonly expectedUpdatedAt: Date;
  readonly slug?: string | undefined;
  readonly name?: string | undefined;
  readonly isIndexable?: boolean | undefined;
  readonly displayOrder?: number | undefined;
}

export interface TransitionCategoryCommand {
  readonly categoryId: string;
  readonly expectedUpdatedAt: Date;
  readonly action: CategoryTransitionAction;
}

@Injectable()
export class AdminCategoryService {
  constructor(
    @Inject(ADMIN_CATEGORY_REPOSITORY) private readonly categories: AdminCategoryRepository,
    private readonly recorder: AdminCategoryRecorder,
    private readonly transactions: TransactionManager,
  ) {}

  /**
   * Creates the canonical `DRAFT`.
   *
   * The client supplies the four operator-authored facts and nothing else: the
   * state is `DRAFT` by construction, `archivedAt` is null, and there is no
   * "create and publish" shortcut. Publishing is a separate, guarded decision
   * because it is the moment a URL becomes public.
   *
   * Slug uniqueness is pre-checked *and* enforced by the arbiter. The pre-check
   * exists so the caller gets `CATEGORY_SLUG_CONFLICT` without aborting the
   * transaction; the arbiter is what makes it true under concurrency, and its
   * rejection maps to the same code.
   */
  async create(command: CreateCategoryCommand): Promise<AdminCategoryView> {
    return this.transactions.runInTransaction(async () => {
      if (await this.categories.slugTakenByOther(command.slug, undefined)) {
        throw adminCategoryError('CATEGORY_SLUG_CONFLICT');
      }

      const created = await this.mapSlugConflict(() =>
        this.categories.create({
          id: newId() as CategoryId,
          slug: command.slug,
          name: command.name,
          isIndexable: command.isIndexable,
          displayOrder: command.displayOrder,
        }),
      );

      await this.recorder.record({
        mutation: 'CREATED',
        categoryId: created.id,
        slug: created.slug,
        fromStatus: CATEGORY_INITIAL_STATE,
        toStatus: created.status,
      });

      return toAdminCategoryView(created);
    });
  }

  /**
   * Edits the operator-authored fields. Never the lifecycle.
   *
   * `slug` is accepted only while the category is still `DRAFT`. A published
   * slug is a public URL key the Storefront filters on and the sitemap
   * advertises, and this checkpoint delivers no redirect and no alias — so the
   * honest answer to "rename the address of a live category" is a refusal, not
   * a silent 404 for everyone holding the old link. `name` stays editable in
   * every non-archived state, which is the whole point: relabelling a category
   * is a data change.
   */
  async update(command: UpdateCategoryCommand): Promise<AdminCategoryView> {
    return this.transactions.runInTransaction(async () => {
      const current = await this.lock(command.categoryId);
      this.requireToken(current, command.expectedUpdatedAt);

      if (command.slug !== undefined && command.slug !== current.slug) {
        if (!isSlugMutable(current.status)) {
          throw adminCategoryError('CATEGORY_SLUG_IMMUTABLE');
        }
        if (await this.categories.slugTakenByOther(command.slug, current.id)) {
          throw adminCategoryError('CATEGORY_SLUG_CONFLICT');
        }
      }

      // An archived category is read-only. There is no screen that edits one and
      // no rule that would need it: the row exists to keep its Products' history
      // addressable, not to be curated. Reported as `CATEGORY_INVALID_TRANSITION`
      // — the closed vocabulary's "not possible from this state" — and checked
      // *after* the slug rule, so an archived slug edit still gets the specific
      // `CATEGORY_SLUG_IMMUTABLE` a client can explain to an operator.
      if (current.status === CATEGORY_ARCHIVED_STATE) {
        throw adminCategoryError('CATEGORY_INVALID_TRANSITION');
      }

      const fields = this.changedFields(current, command);
      const written = await this.mapSlugConflict(() =>
        this.categories.updateGuarded({
          id: current.id,
          expectedUpdatedAt: command.expectedUpdatedAt,
          fields,
        }),
      );
      if (written === undefined) {
        // The row is locked and its token was compared a moment ago, so the only
        // way the guard can miss is a token that moved — which cannot happen
        // under the lock — or a row that vanished. Both are reported as the
        // conflict the caller can act on.
        throw adminCategoryError('CATEGORY_VERSION_CONFLICT');
      }

      await this.recorder.record({
        mutation: 'UPDATED',
        categoryId: written.id,
        slug: written.slug,
        fromStatus: current.status,
        toStatus: written.status,
        changedFields: Object.keys(fields),
      });

      return toAdminCategoryView(written);
    });
  }

  /**
   * `PUBLISH` (`DRAFT → PUBLISHED`) and `ARCHIVE` (`PUBLISHED → ARCHIVED`).
   *
   * ## The archive guard is an invariant, not a check
   *
   * `lockById` takes `FOR UPDATE` on the category row **before** the dependent
   * Products are counted. The Product publication path already locks that same
   * row `FOR SHARE` inside its own transaction and re-reads the category's state
   * under that lock, so the two are mutually exclusive:
   *
   * - archive first — the publish waits, then re-reads an `ARCHIVED` category
   *   and refuses its own transition on readiness;
   * - publish first — the archive waits, then counts the newly published Product
   *   and refuses.
   *
   * Either way the committed state is never "category archived **and** a Product
   * published under it". No advisory locks and no new subsystem: the seam
   * already existed, and this is the first caller that needed the exclusive side
   * of it.
   *
   * Nothing is auto-reassigned, auto-unpublished or moved to a fallback
   * category. There is no fallback category, and inventing one would silently
   * relabel a customer-visible product.
   */
  async transition(command: TransitionCategoryCommand): Promise<AdminCategoryView> {
    return this.transactions.runInTransaction(async () => {
      const move = CATEGORY_TRANSITIONS[command.action];
      const current = await this.lock(command.categoryId);
      this.requireToken(current, command.expectedUpdatedAt);

      if (current.status !== move.from) {
        throw adminCategoryError('CATEGORY_INVALID_TRANSITION');
      }

      if (
        command.action === 'ARCHIVE' &&
        (await this.categories.countPublishedProducts(current.id)) > 0
      ) {
        throw adminCategoryError('CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS');
      }

      const written = await this.categories.transitionGuarded({
        id: current.id,
        expectedUpdatedAt: command.expectedUpdatedAt,
        fromState: move.from,
        toState: move.to,
        // Stamped only by an archive. A publish leaves the column exactly as it
        // was rather than clearing an archive fact it did not create.
        archivedAt: command.action === 'ARCHIVE' ? new Date() : undefined,
      });
      if (written === undefined) {
        throw adminCategoryError('CATEGORY_VERSION_CONFLICT');
      }

      await this.recorder.record({
        mutation: command.action === 'PUBLISH' ? 'PUBLISHED' : 'ARCHIVED',
        categoryId: written.id,
        slug: written.slug,
        fromStatus: current.status,
        toStatus: written.status,
      });

      return toAdminCategoryView(written);
    });
  }

  /** The locked row, or `CATEGORY_NOT_FOUND`. @requiresTransaction */
  private async lock(categoryId: string): Promise<AdminCategory> {
    const current = await this.categories.lockById(categoryId as CategoryId);
    if (current === undefined) {
      throw adminCategoryError('CATEGORY_NOT_FOUND');
    }
    return current;
  }

  /**
   * The token comparison, made against the locked row rather than the request.
   *
   * Compared at millisecond precision because that is the precision the
   * published token carries; the guarded UPDATE re-checks the same thing, so
   * this is a fast, well-classified refusal rather than the safety mechanism.
   */
  private requireToken(category: AdminCategory, expectedUpdatedAt: Date): void {
    if (category.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw adminCategoryError('CATEGORY_VERSION_CONFLICT');
    }
  }

  /**
   * The patch, reduced to the fields that actually differ.
   *
   * A no-op field is dropped rather than written: it keeps the audit summary
   * honest — `fields` names what changed, not what was sent.
   */
  private changedFields(
    current: AdminCategory,
    command: UpdateCategoryCommand,
  ): UpdateCategoryFields {
    return {
      ...(command.slug === undefined || command.slug === current.slug
        ? {}
        : { slug: command.slug }),
      ...(command.name === undefined || command.name === current.name
        ? {}
        : { name: command.name }),
      ...(command.isIndexable === undefined || command.isIndexable === current.isIndexable
        ? {}
        : { isIndexable: command.isIndexable }),
      ...(command.displayOrder === undefined || command.displayOrder === current.displayOrder
        ? {}
        : { displayOrder: command.displayOrder }),
    };
  }

  /**
   * Turns the `uq_categories__slug` rejection into this feature's own code.
   *
   * The constraint catalog already classifies that arbiter as `DUPLICATE_SLUG`
   * with a client-safe message, so nothing raw is being re-read here — the
   * mapping simply gives the caller the category-specific code its contract
   * documents. Any other persistence failure propagates untouched and is
   * redacted by the platform filter.
   */
  private async mapSlugConflict<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      if (isPersistenceError(error) && error.code === DUPLICATE_SLUG_CODE) {
        throw adminCategoryError('CATEGORY_SLUG_CONFLICT');
      }
      throw error;
    }
  }
}
