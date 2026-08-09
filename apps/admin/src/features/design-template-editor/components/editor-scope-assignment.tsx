'use client';

import { useReducer } from 'react';
import type {
  AdminProductPlacementResponse,
  AdminProductSummaryResponse,
} from '@embroidery/api-client';

import { DESIGN_TEMPLATE_EDITOR_COPY } from '../model/design-template-editor-copy';
import type { AssignScopeFailure } from '../model/editor-failure';
import {
  completeSelection,
  EMPTY_SCOPE_SELECTION,
  scopeSelectionReducer,
  selectableAreas,
  selectableSides,
} from '../model/scope-selection';
import { EditorNotice } from './editor-notice';

interface EditorScopeAssignmentProps {
  readonly products: readonly AdminProductSummaryResponse[];
  readonly productsLoading: boolean;
  readonly productsFailed: boolean;
  readonly onRetryProducts: () => void;
  readonly placement: AdminProductPlacementResponse | undefined;
  readonly placementLoading: boolean;
  readonly placementFailed: boolean;
  readonly onRetryPlacement: () => void;
  readonly assigning: boolean;
  readonly failure: AssignScopeFailure | null;
  /** Reports the selected Product so the screen can load its placement. */
  readonly onProductChange: (productId: string | null) => void;
  readonly onAssign: (triple: {
    readonly productId: string;
    readonly productSideId: string;
    readonly embroideryAreaId: string;
  }) => void;
}

/**
 * The one-time initial scope assignment (`APP3-A03-C1`).
 *
 * This closes the dead end human review found: `APP3-A02` creates an unscoped
 * `DRAFT`, `APP3-P01` requires a placement snapshot in every Design Document, so
 * without a scope the editor has nothing to author on. `APP3-B03B` publishes the
 * assignment; this is its only consumer.
 *
 * Three dependent choices, and the dependency is the design. A Side belongs to a
 * Product and an Area to a Side, so each selector is populated from the answer
 * above it rather than from a flat list — an Area from a sibling Side is not
 * merely filtered out, it is never reachable. `scope-selection.ts` makes the
 * cascade structural: choosing a Product cannot leave a stale Side behind.
 *
 * Rendered inline rather than in a dialog. The editor already carries two
 * hand-rolled modals (`FU-ADMIN-SHARED-DIALOG-01`), and this is not an
 * interruption to dismiss — it is the screen's own first step, and an operator
 * who cannot complete it has nothing else to do here.
 *
 * There is no Change or Clear action, now or after success. `APP3-B03B`
 * publishes no rescope and no clear-scope operation, so a control offering
 * either would be a promise the contract cannot keep.
 */
export function EditorScopeAssignment({
  products,
  productsLoading,
  productsFailed,
  onRetryProducts,
  placement,
  placementLoading,
  placementFailed,
  onRetryPlacement,
  assigning,
  failure,
  onProductChange,
  onAssign,
}: EditorScopeAssignmentProps) {
  const copy = DESIGN_TEMPLATE_EDITOR_COPY.assign;
  const [selection, dispatch] = useReducer(scopeSelectionReducer, EMPTY_SCOPE_SELECTION);

  const sides = selectableSides(placement);
  const areas = selectableAreas(placement, selection.productSideId);
  const triple = completeSelection(selection);

  return (
    <section
      className="template-editor-assign"
      aria-label={copy.title}
      data-testid="editor-scope-assign"
    >
      <h2 className="template-editor-assign__title">{copy.title}</h2>
      <p className="template-editor-assign__intro">{copy.intro}</p>

      {productsFailed ? (
        <EditorNotice
          title={copy.productFailedTitle}
          body={copy.productFailedBody}
          testId="editor-scope-products-failed"
          tone="alert"
          action={{ label: copy.retry, onClick: onRetryProducts }}
        />
      ) : (
        <ScopeSelect
          id="editor-scope-product"
          label={copy.productLabel}
          placeholder={copy.productPlaceholder}
          value={selection.productId}
          disabled={assigning || productsLoading}
          emptyMessage={productsLoading ? copy.productLoading : copy.productEmpty}
          options={products.map((product) => ({ id: product.productId, label: product.name }))}
          onChange={(productId) => {
            dispatch({ type: 'SELECT_PRODUCT', productId });
            onProductChange(productId);
          }}
        />
      )}

      {selection.productId === null ? null : placementFailed ? (
        <EditorNotice
          title={copy.sideFailedTitle}
          body={copy.sideFailedBody}
          testId="editor-scope-placement-failed"
          tone="alert"
          action={{ label: copy.retry, onClick: onRetryPlacement }}
        />
      ) : (
        <>
          <ScopeSelect
            id="editor-scope-side"
            label={copy.sideLabel}
            placeholder={copy.sidePlaceholder}
            value={selection.productSideId}
            disabled={assigning || placementLoading}
            emptyMessage={placementLoading ? copy.sideLoading : copy.sideEmpty}
            // Retired Sides are absent, not merely disabled: `IMP-D041` retires
            // without deleting so history survives, and a retired row is a valid
            // *historical* placement but never a legal new one.
            options={sides.map((side) => ({ id: side.id, label: side.name }))}
            onChange={(productSideId) => {
              dispatch({ type: 'SELECT_SIDE', productSideId });
            }}
          />

          {selection.productSideId === null ? null : (
            <ScopeSelect
              id="editor-scope-area"
              label={copy.areaLabel}
              placeholder={copy.areaPlaceholder}
              value={selection.embroideryAreaId}
              disabled={assigning}
              emptyMessage={copy.areaEmpty}
              options={areas.map((area) => ({ id: area.id, label: area.name }))}
              onChange={(embroideryAreaId) => {
                dispatch({ type: 'SELECT_AREA', embroideryAreaId });
              }}
            />
          )}
        </>
      )}

      {failure === null ? null : <AssignFailure failure={failure} />}

      <div className="template-editor-assign__actions">
        <button
          type="button"
          className="template-editor-assign__submit"
          disabled={triple === null || assigning}
          aria-describedby={triple === null ? 'editor-scope-incomplete' : undefined}
          aria-busy={assigning}
          data-testid="editor-scope-submit"
          onClick={() => {
            // Never a partial triple: the button cannot act without one, and the
            // model cannot produce one whose parts disagree.
            if (triple !== null) onAssign(triple);
          }}
        >
          {assigning ? copy.submitting : copy.submit}
        </button>
        {triple === null ? (
          <p className="template-editor-assign__hint" id="editor-scope-incomplete">
            {copy.incomplete}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function AssignFailure({ failure }: { readonly failure: AssignScopeFailure }) {
  const copy = DESIGN_TEMPLATE_EDITOR_COPY.assign;
  const { title, body } =
    failure === 'not-assignable'
      ? { title: copy.notAssignableTitle, body: copy.notAssignableBody }
      : failure === 'scope-invalid'
        ? { title: copy.invalidTitle, body: copy.invalidBody }
        : { title: copy.failedTitle, body: copy.failedBody };

  return <EditorNotice title={title} body={body} testId="editor-scope-error" tone="alert" />;
}

interface ScopeSelectProps {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string | null;
  readonly disabled: boolean;
  readonly emptyMessage: string;
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly onChange: (id: string | null) => void;
}

/**
 * One labelled `<select>`.
 *
 * A native select rather than a custom listbox: it is keyboard-operable and
 * screen-reader-announced without any of it being re-implemented, which is the
 * whole of what §20 asks for here. When there is nothing to choose the control
 * is replaced by a sentence saying why — an empty dropdown looks like a loading
 * bug.
 */
function ScopeSelect({
  id,
  label,
  placeholder,
  value,
  disabled,
  emptyMessage,
  options,
  onChange,
}: ScopeSelectProps) {
  return (
    <div className="template-editor-assign__field">
      <label className="template-editor-assign__label" htmlFor={id}>
        {label}
      </label>
      {options.length === 0 ? (
        <p className="template-editor-assign__empty" role="status" data-testid={`${id}-empty`}>
          {emptyMessage}
        </p>
      ) : (
        <select
          id={id}
          className="template-editor-assign__select"
          value={value ?? ''}
          disabled={disabled}
          data-testid={id}
          onChange={(event) => {
            onChange(event.target.value === '' ? null : event.target.value);
          }}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
