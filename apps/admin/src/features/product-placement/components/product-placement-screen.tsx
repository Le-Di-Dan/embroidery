'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  adminProductDetailRoute,
  ADMIN_PRODUCTS_ROUTE,
  useProductDetailQuery,
} from '../../products';
import { toReplaceBody } from '../model/placement-body';
import { PLACEMENT_COPY } from '../model/placement-copy';
import { backgroundMatchesServer, isDirty, type SideDraft } from '../model/placement-draft';
import { isNotFound } from '../model/placement-failure';
import { validateDraft } from '../model/placement-validation';
import { selectedSideKey, type PlacementSelection } from '../model/placement-selection';
import { usePlacementDraft } from '../hooks/use-placement-draft';
import { usePlacementMutation } from '../hooks/use-placement-mutation';
import { usePlacementQuery } from '../hooks/use-placement-query';
import { useSideBackground, type SideBackground } from '../hooks/use-side-background';
import { useViewportMode } from '../hooks/use-viewport-mode';
import { PlacementBackgroundDialog } from './placement-background-dialog';
import { PlacementConflictDialog } from './placement-conflict-dialog';
import { PlacementHierarchyPanel } from './placement-hierarchy-panel';
import { PlacementInspector } from './placement-inspector';
import { PlacementMobileNotice } from './placement-mobile-notice';
import { PlacementPreview, type BackgroundState } from './placement-preview';
import { PlacementSaveBar } from './placement-save-bar';

interface ProductPlacementScreenProps {
  readonly productId: string;
}

/**
 * `/products/[productId]/placement` — Admin placement authoring (`596:7`,
 * `618:74`).
 *
 * The load boundary and the one place the three columns are composed. Every
 * state is derived from the query and the draft rather than from a local flag:
 * loading, not found, unavailable, and the editable model.
 *
 * Mobile renders the approved read-only notice *instead of* the editor, not
 * beside it — see `useViewportMode`.
 */
export function ProductPlacementScreen({ productId }: ProductPlacementScreenProps) {
  const query = usePlacementQuery(productId);
  const mutation = usePlacementMutation();
  const session = usePlacementDraft(query.data);
  const viewport = useViewportMode();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Display only. Placement authoring never waits on it and never fails because
  // of it: if the record is unavailable the tree falls back to a neutral label
  // rather than blocking an edit the placement contract fully supports.
  const product = useProductDetailQuery(productId);
  const productName = product.data?.name ?? PLACEMENT_COPY.hierarchy.productLabel;

  const validation = useMemo(
    () => validateDraft(session.draft, PLACEMENT_COPY.validation),
    [session.draft],
  );

  const model = query.data;
  const dirty = model === undefined ? false : isDirty(session.draft, model);

  // Read once into a local so the union narrows across the lookups below.
  const selection = session.selection;
  const sideKey = selectedSideKey(selection);
  const side = session.draft.sides.find((row) => row.key === sideKey) ?? null;
  const area =
    selection.kind === 'area'
      ? (side?.areas.find((row) => row.key === selection.areaKey) ?? null)
      : null;

  // The Side's authorized background (`APP3-B02A`). Fetched only when the draft
  // still names the background the server has persisted for this Side —
  // otherwise the route would answer with the bytes of the background being
  // replaced, and drawing those would present an unsaved choice as applied.
  const backgroundIsServerTruth =
    side !== null && model !== undefined && backgroundMatchesServer(side, model);
  const background = useSideBackground({
    productId,
    sideId: backgroundIsServerTruth ? side.id : null,
    enabled: backgroundIsServerTruth,
  });

  if (query.isPending) {
    return (
      <section className="placement">
        <p className="placement__status" role="status">
          {PLACEMENT_COPY.states.loading}
        </p>
      </section>
    );
  }

  if (query.isError || model === undefined) {
    const notFound = isNotFound(query.error);
    return (
      <section className="placement">
        <div className="placement__failure" role="alert">
          <p className="placement__failure-title">
            {notFound
              ? PLACEMENT_COPY.states.notFoundTitle
              : PLACEMENT_COPY.states.unavailableTitle}
          </p>
          <p className="placement__failure-body">
            {notFound ? PLACEMENT_COPY.states.notFoundBody : PLACEMENT_COPY.states.unavailableBody}
          </p>
          {notFound ? (
            <Link className="placement__secondary" href={ADMIN_PRODUCTS_ROUTE}>
              {PLACEMENT_COPY.states.backToList}
            </Link>
          ) : (
            <button
              type="button"
              className="placement__secondary"
              onClick={() => {
                void query.refetch();
              }}
            >
              {PLACEMENT_COPY.states.retry}
            </button>
          )}
        </div>
      </section>
    );
  }

  if (viewport === 'mobile') {
    return (
      <section className="placement">
        <PlacementHeader productId={productId} />
        <PlacementMobileNotice model={model} />
      </section>
    );
  }

  const save = () => {
    session.beginSave();
    mutation.mutate(
      { productId, body: toReplaceBody(session.draft) },
      {
        onSuccess: () => {
          session.recordSaved();
        },
        onError: (error: unknown) => {
          session.recordFailure(error);
        },
      },
    );
  };

  const reloadLatest = () => {
    void query.refetch().then((result) => {
      if (result.data !== undefined) {
        session.acceptServerTruth(result.data);
      }
    });
  };

  return (
    <section className="placement">
      <PlacementHeader productId={productId} />

      <PlacementSaveBar
        dirty={dirty}
        invalid={validation.invalid}
        saving={mutation.isPending}
        saved={session.saved}
        conflicted={session.conflicted}
        failure={session.failure}
        onSave={save}
        onDiscard={() => {
          session.discard(model);
        }}
      />

      <div className="placement__columns">
        <PlacementHierarchyPanel
          draft={session.draft}
          productName={productName}
          selection={selection}
          invalidSideKeys={new Set(Object.keys(validation.sides))}
          invalidAreaKeys={new Set(Object.keys(validation.areas))}
          onSelect={(next: PlacementSelection) => {
            session.select(next);
          }}
          onAddSide={() => {
            session.dispatch({ type: 'add-side' });
          }}
          onAddArea={(key) => {
            session.dispatch({ type: 'add-area', sideKey: key });
          }}
          onToggleSideRemoved={(key) => {
            session.dispatch({ type: 'toggle-side-removed', sideKey: key });
          }}
          onToggleAreaRemoved={(key, areaKey) => {
            session.dispatch({ type: 'toggle-area-removed', sideKey: key, areaKey });
          }}
        />

        <PlacementPreview
          side={side}
          selectedAreaKey={selection.kind === 'area' ? selection.areaKey : null}
          background={resolveBackgroundState(side, backgroundIsServerTruth, background)}
          onSelectArea={(areaKey) => {
            if (side !== null) {
              session.select({ kind: 'area', sideKey: side.key, areaKey });
            }
          }}
        />

        <PlacementInspector
          selection={selection}
          side={side}
          area={area}
          validation={validation}
          onPatchSide={(patch) => {
            if (side !== null) {
              session.dispatch({ type: 'patch-side', sideKey: side.key, patch });
            }
          }}
          onPatchArea={(patch) => {
            if (side !== null && area !== null) {
              session.dispatch({
                type: 'patch-area',
                sideKey: side.key,
                areaKey: area.key,
                patch,
              });
            }
          }}
          onChooseBackground={() => {
            setPickerOpen(true);
          }}
        />
      </div>

      {session.conflictDialogOpen ? (
        <PlacementConflictDialog
          reloading={query.isFetching}
          onReload={reloadLatest}
          onKeepDraft={session.keepDraft}
        />
      ) : null}

      {pickerOpen && side !== null ? (
        <PlacementBackgroundDialog
          selectedAssetId={side.backgroundAssetId}
          onClose={() => {
            setPickerOpen(false);
          }}
          onConfirm={(assetId) => {
            session.dispatch({
              type: 'patch-side',
              sideKey: side.key,
              patch: { backgroundAssetId: assetId },
            });
            setPickerOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * Turns the fetch outcome into what the stage should say.
 *
 * The two "not fetched" cases are separated on purpose. An unsaved **Side** has
 * no address at all; a saved Side whose draft names a **different** background
 * has an address that would answer with the old bytes. Collapsing them into one
 * message would tell an operator mid-replacement that their Side is unsaved.
 */
function resolveBackgroundState(
  side: SideDraft | null,
  isServerTruth: boolean,
  background: SideBackground,
): BackgroundState {
  if (side === null) return { kind: 'loading' };
  if (!isServerTruth) {
    return side.id === null ? { kind: 'unsaved-side' } : { kind: 'pending' };
  }
  if (background.failure !== null) {
    return { kind: 'failed', failure: background.failure, onRetry: background.retry };
  }
  if (background.objectUrl !== null) return { kind: 'ready', objectUrl: background.objectUrl };
  return { kind: 'loading' };
}

function PlacementHeader({ productId }: { readonly productId: string }) {
  return (
    <header className="placement__header">
      <div>
        <h1 className="placement__title">{PLACEMENT_COPY.screen.title}</h1>
        <p className="placement__subtitle">{PLACEMENT_COPY.screen.subtitle}</p>
      </div>
      <Link className="placement__back" href={adminProductDetailRoute(productId)}>
        {PLACEMENT_COPY.screen.backToProduct}
      </Link>
    </header>
  );
}
