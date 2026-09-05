/**
 * How the design-case contracts become operator-facing text and one selected
 * version (`APP6-A02` §12, §14, §23).
 *
 * Everything here is total: every input produces a presentation, and none of
 * them echoes a raw server token. An unmapped enum member degrades to a neutral
 * label rather than putting `REVISION_REQUESTED` on the screen.
 *
 * ### The two version pointers are different things, and stay different
 *
 * `current` is `design_cases.current_version_id` — the **newest authored**
 * version, which `APP6-B09` advances. The version a customer is actually being
 * asked to decide on is the one in `SENT_FOR_REVIEW`, arbitrated by a partial
 * unique index, and the two are routinely different rows: a workshop that has
 * already started the next draft has advanced the pointer while the customer's
 * review is still open. So they are computed separately and labelled separately,
 * and the current version is never described to the operator as the one the
 * customer is looking at.
 *
 * ### The action matrix reads server facts, and invents no lifecycle
 *
 * {@link resolveVersionActions} answers from the version's own status and the
 * request's own status. It never derives a status from a review, never derives a
 * review from a status, and offers no action the server would refuse. The server
 * stays the final authority — these answers decide what to *show*, not what is
 * permitted.
 */
import type {
  AdminCustomRequestDetailResponse,
  DesignVersionResponse,
} from '@embroidery/api-client';

import { formatDisplayInstant } from '@embroidery/i18n';

import { REQUEST_DESIGN_CASE_COPY as COPY } from './request-design-case-copy';

/** The two request statuses `TR-LC08-01` allows a version to be authored in. */
const AUTHORING_STATUSES: ReadonlySet<string> = new Set(['DIGITIZING', 'DESIGN_REVIEW']);

/**
 * The status from which `APP6-B06` moves a request into digitizing.
 *
 * Named so the gate can link back to the request detail, where that command
 * lives. This screen deliberately offers no transition control of its own —
 * duplicating it would be a second authority for one move.
 */
const PRE_DIGITIZING_STATUS = 'QUOTE_ACCEPTED';

export function presentVersionStatus(status: unknown): string {
  if (typeof status !== 'string') return COPY.versionStatus.unknown;
  const labels: Readonly<Record<string, string>> = COPY.versionStatus;
  return labels[status] ?? COPY.versionStatus.unknown;
}

export function presentReviewOutcome(outcome: unknown): string {
  if (typeof outcome !== 'string') return COPY.reviewOutcome.unknown;
  const labels: Readonly<Record<string, string>> = COPY.reviewOutcome;
  return labels[outcome] ?? COPY.reviewOutcome.unknown;
}

/** An instant as an operator reads it, or an em dash when there is none. */
export function presentInstant(instant: string | null | undefined): string {
  if (instant === null || instant === undefined || instant === '') {
    return '—';
  }
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  // One instant format across both applications (`V01-UX-021`, `APP12-V02` §30):
  // the shared `dd/MM/yyyy · HH:mm` in `@embroidery/i18n`, in the workshop's
  // zone, rather than a per-feature `Intl` call with its own field styles.
  return formatDisplayInstant(parsed) ?? '—';
}

/** The two subject branches, read from the discriminator and never sniffed. */
export type SubjectKind = 'CATALOG' | 'CUSTOMER_OWNED' | 'UNKNOWN';

export function subjectKindOf(detail: AdminCustomRequestDetailResponse): SubjectKind {
  const subject = detail.subject;
  if (subject === undefined || subject === null) return 'UNKNOWN';
  const kind = (subject as { readonly kind?: unknown }).kind;
  if (kind === 'CATALOG') return 'CATALOG';
  if (kind === 'CUSTOMER_OWNED') return 'CUSTOMER_OWNED';
  return 'UNKNOWN';
}

/**
 * Whether the request is in a state that permits authoring a version.
 *
 * The same two statuses `APP6-B08` enforces. The screen gates on this so it does
 * not offer a control that merely waits for a `409` — but the server remains the
 * arbiter, and a refusal that arrives anyway is reconciled rather than argued
 * with.
 */
export function allowsAuthoring(requestStatus: unknown): boolean {
  return typeof requestStatus === 'string' && AUTHORING_STATUSES.has(requestStatus);
}

/** Whether the gate should point the operator at `APP6-B06`'s own control. */
export function awaitsDigitizingTransition(requestStatus: unknown): boolean {
  return requestStatus === PRE_DIGITIZING_STATUS;
}

/**
 * The version awaiting a customer decision, if any.
 *
 * Found by status, which mirrors the partial unique index that makes at most one
 * qualify — not by "the newest", not by "the current one", and not by reading a
 * review. There is no ordering here on purpose: an ordering would be a way to
 * *choose*, and `GRD-004` already made the choice.
 */
export function findVersionInReview(
  versions: readonly DesignVersionResponse[],
): DesignVersionResponse | undefined {
  return versions.find((version) => version.status === 'SENT_FOR_REVIEW');
}

/** The design case's own current-version pointer, as a row. */
export function findCurrentVersion(
  versions: readonly DesignVersionResponse[],
): DesignVersionResponse | undefined {
  return versions.find((version) => version.current);
}

/**
 * Which version the screen shows when the operator has not chosen one.
 *
 * The current version if the case names one, else the last row the server
 * returned. Both come from the server's own ordering; nothing here sorts by
 * version number, because the list is already the history authority and
 * re-sorting it would be a second opinion about its order.
 *
 * A held selection survives a refetch as long as the version is still in the
 * list. When it is not — the history changed under the operator — the fallback
 * applies rather than a blank card.
 */
export function resolveSelectedVersion(
  versions: readonly DesignVersionResponse[],
  selectedId: string | null,
): DesignVersionResponse | undefined {
  if (selectedId !== null) {
    const held = versions.find((version) => version.versionId === selectedId);
    if (held !== undefined) return held;
  }
  return findCurrentVersion(versions) ?? versions[versions.length - 1];
}

/**
 * What an operator may do with one version (§23).
 *
 * Every field is a fact about the *server's* state, not a permission this screen
 * grants. Note what has no field at all: there is no `approve`, no
 * `requestRevision`, no `setRequestStatus` and no `edit` — the first two are the
 * customer's decisions through `APP6-B11`, the third is a server projection, and
 * the fourth does not exist because history is append-only.
 */
export interface VersionActions {
  /** Open the in-browser authoring surface on this version's document. */
  readonly canAuthor: boolean;
  /** Send this exact DRAFT for review. */
  readonly canSend: boolean;
  /** Start a new DRAFT that continues this version. */
  readonly canCreateFrom: boolean;
  /** Whether this version is history and must be rendered read-only. */
  readonly readOnly: boolean;
}

const NO_ACTIONS: VersionActions = {
  canAuthor: false,
  canSend: false,
  canCreateFrom: false,
  readOnly: true,
};

export function resolveVersionActions(
  version: DesignVersionResponse | undefined,
  requestStatus: unknown,
): VersionActions {
  if (version === undefined) return NO_ACTIONS;
  const authoringAllowed = allowsAuthoring(requestStatus);

  switch (version.status) {
    case 'DRAFT':
      return {
        canAuthor: authoringAllowed,
        canSend: authoringAllowed,
        canCreateFrom: false,
        readOnly: !authoringAllowed,
      };
    case 'REVISION_REQUESTED':
      // The revision-requested row itself is never edited: it is the historical
      // record of what the customer saw. The only move forward is a new DRAFT
      // that continues it.
      return { canAuthor: false, canSend: false, canCreateFrom: authoringAllowed, readOnly: true };
    case 'SENT_FOR_REVIEW':
    case 'APPROVED':
    case 'SUPERSEDED':
    case 'VOID':
    default:
      return NO_ACTIONS;
  }
}

/**
 * The one-line state note the selected-version card shows, by version status.
 *
 * Returns `null` for a plain DRAFT, which needs no explanation — the controls
 * beside it say what can be done.
 */
export interface VersionNote {
  readonly title: string;
  readonly body: string;
  readonly tone: 'awaiting' | 'revision' | 'approved' | 'historical';
}

export function resolveVersionNote(version: DesignVersionResponse | undefined): VersionNote | null {
  if (version === undefined) return null;
  switch (version.status) {
    case 'SENT_FOR_REVIEW':
      return {
        title: COPY.selected.awaitingTitle,
        body: COPY.selected.awaitingBody,
        tone: 'awaiting',
      };
    case 'REVISION_REQUESTED':
      return {
        title: COPY.selected.revisionTitle,
        body: COPY.selected.revisionBody,
        tone: 'revision',
      };
    case 'APPROVED':
      return {
        title: COPY.selected.approvedTitle,
        body: COPY.selected.approvedBody,
        tone: 'approved',
      };
    case 'SUPERSEDED':
    case 'VOID':
      return {
        title: COPY.selected.immutableTitle,
        body: COPY.selected.immutableBody,
        tone: 'historical',
      };
    default:
      return null;
  }
}

/**
 * The placement, as one line, honest on both branches.
 *
 * The Catalog branch has no labels to show — its identity is four foreign keys
 * the operator has no use for — so it names the branch instead. Rendering the
 * raw ids would be putting a database identifier on an operator's screen.
 */
export function presentPlacement(version: DesignVersionResponse): string {
  if (version.branch === 'CUSTOMER_OWNED') {
    const side = version.placementSideLabel ?? '';
    const area = version.placementAreaLabel ?? '';
    const parts = [side, area].filter((part) => part !== '');
    return parts.length === 0 ? COPY.context.unknown : parts.join(' · ');
  }
  return COPY.context.branchCatalog;
}
