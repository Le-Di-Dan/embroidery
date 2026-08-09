'use client';

/**
 * Everything the initial scope assignment needs, as one seam (`APP3-A03-C1`).
 *
 * Extracted from the screen rather than inlined there: the editor already
 * orchestrates a document, a save and a conflict, and folding a second
 * multi-step flow into the same component is how a missing branch hides. The
 * screen keeps the *placement* query — the editor needs it too, and sharing one
 * query is what makes the transition after assignment a cache hit rather than a
 * second request.
 *
 * `candidateProductId` is deliberately not called a scope. It is the Product the
 * operator is considering; a scope exists only once the server says so.
 */
import { useState } from 'react';
import type { AdminDesignTemplateDetailResponse } from '@embroidery/api-client';

import type { AssignScopeFailure } from '../model/editor-failure';
import { useAssignTemplateScope } from './use-assign-template-scope';
import { useScopeProductOptions } from './use-scope-product-options';

export interface ScopeAssignment {
  /** The Product being considered, or `null` — never a scope. */
  readonly candidateProductId: string | null;
  readonly onProductChange: (productId: string | null) => void;
  readonly products: ReturnType<typeof useScopeProductOptions>;
  readonly assigning: boolean;
  readonly failure: AssignScopeFailure | null;
  readonly assign: (triple: {
    readonly productId: string;
    readonly productSideId: string;
    readonly embroideryAreaId: string;
  }) => void;
}

export interface UseScopeAssignmentInput {
  readonly templateId: string;
  /** True only for an unscoped, versionless DRAFT on a large enough viewport. */
  readonly enabled: boolean;
  /** An awaited re-read, used once to resolve a lost race. */
  readonly reloadDetail: () => Promise<AdminDesignTemplateDetailResponse | undefined>;
}

export function useScopeAssignment({
  templateId,
  enabled,
  reloadDetail,
}: UseScopeAssignmentInput): ScopeAssignment {
  const [candidateProductId, setCandidateProductId] = useState<string | null>(null);
  const [failure, setFailure] = useState<AssignScopeFailure | null>(null);

  const products = useScopeProductOptions(enabled);

  const mutation = useAssignTemplateScope({
    templateId,
    // The mutation already wrote the server's answer into the detail cache, so
    // the next render derives a scoped, versionless DRAFT and the editor simply
    // appears. There is nothing to navigate to and no second read to issue.
    onAssigned: () => {
      setFailure(null);
    },
    onFailed: (assignFailure) => {
      if (assignFailure !== 'not-assignable') {
        setFailure(assignFailure);
        return;
      }
      // A `409` means someone else assigned first, or the Template stopped being
      // assignable. `APP3-B03B` does not say which — deliberately — so the
      // server is asked **once**. If a scope now exists it is the winner's and
      // the editor continues from it; forcing the local triple would be a
      // rescope, and no such operation exists.
      void (async () => {
        const fresh = await reloadDetail();
        setFailure(fresh?.scope === undefined ? 'not-assignable' : null);
      })();
    },
  });

  return {
    candidateProductId,
    onProductChange: setCandidateProductId,
    products,
    assigning: mutation.isAssigning,
    failure,
    assign: (triple) => {
      setFailure(null);
      mutation.assign({ templateId, ...triple });
    },
  };
}
