'use client';

import { CUSTOM_REQUEST_QUEUE_COPY } from '../model/custom-request-queue-copy';
import {
  isAnyQueueFilterActive,
  QUEUE_STATUS_FILTER_OPTIONS,
  QUEUE_SUBJECT_FILTER_OPTIONS,
  type CustomRequestQueueFilters,
  type QueueStatusFilter,
  type QueueSubjectFilter,
} from '../model/custom-request-queue-filters';

interface CustomRequestQueueFilterBarProps {
  readonly filters: CustomRequestQueueFilters;
  readonly onStatusChange: (status: QueueStatusFilter) => void;
  readonly onSubjectKindChange: (subjectKind: QueueSubjectFilter) => void;
  readonly onReset: () => void;
}

/**
 * The two approved queue filters (`662:3`), reusing the labelled-select filter
 * bar `APP2-D03` established for Admin lists.
 *
 * Native `<select>` on purpose: keyboard- and screen-reader-correct without a
 * line of interaction code, and the approved control is a labelled select, not a
 * custom listbox. The label is permanently visible — a placeholder that
 * disappears on selection leaves the operator no way to re-read what the control
 * means.
 *
 * The status control's first option is the *default triage scope*, not "tất
 * cả": choosing it sends no `status` at all, and `APP5-B04` answers with the
 * triage set it names in `appliedStatuses`. An option labelled "all" would
 * promise a whole-table view this queue never shows.
 *
 * The reset control appears only when something is actually filtered, so the
 * operator is never offered a control that would do nothing.
 *
 * The controls stay mounted and enabled while a page is loading, so the operator
 * can always see and change what they asked for.
 */
export function CustomRequestQueueFilterBar({
  filters,
  onStatusChange,
  onSubjectKindChange,
  onReset,
}: CustomRequestQueueFilterBarProps) {
  return (
    <div className="custom-request-filters">
      <div className="custom-request-filter">
        <label className="custom-request-filter__label" htmlFor="request-filter-status">
          {CUSTOM_REQUEST_QUEUE_COPY.filters.statusLabel}
        </label>
        <select
          id="request-filter-status"
          className="custom-request-filter__control"
          value={filters.status}
          onChange={(event) => onStatusChange(event.target.value as QueueStatusFilter)}
        >
          {QUEUE_STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="custom-request-filter">
        <label className="custom-request-filter__label" htmlFor="request-filter-subject">
          {CUSTOM_REQUEST_QUEUE_COPY.filters.subjectLabel}
        </label>
        <select
          id="request-filter-subject"
          className="custom-request-filter__control"
          value={filters.subjectKind}
          onChange={(event) => onSubjectKindChange(event.target.value as QueueSubjectFilter)}
        >
          {QUEUE_SUBJECT_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {isAnyQueueFilterActive(filters) ? (
        <button
          type="button"
          className="custom-request-filters__reset"
          data-testid="request-queue-reset"
          onClick={onReset}
        >
          {CUSTOM_REQUEST_QUEUE_COPY.filters.reset}
        </button>
      ) : null}
    </div>
  );
}
