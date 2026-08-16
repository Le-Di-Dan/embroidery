'use client';

/**
 * `/yeu-cau/moi` — the `APP5-S01` orchestrator.
 *
 * It owns the composition and nothing else: the branches, the steps and the
 * hand-off. Every rule it appears to enforce actually lives in a model or a hook
 * — readiness in `step-readiness`, subject XOR in the flow reducer, bindability
 * in `APP5-B02`'s own flag, submit-once in the submission hook — which is what
 * keeps this file a screen rather than a second copy of the business rules.
 *
 * The catalog context is resolved in an effect, not during render: it reads the
 * Studio's `localStorage` handle, which does not exist on the server and would
 * make the first client render disagree with the server's HTML.
 */
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

import type { CustomRequestSubmissionResponse } from '@embroidery/api-client';

import { useContactVerification } from '../../contact-verification';
import { useCatalogVariants } from '../hooks/use-catalog-variants';
import { useRequestSubmission } from '../hooks/use-request-submission';
import { useRequestUploads } from '../hooks/use-request-uploads';
import { useVerifiedChallenge } from '../hooks/use-verified-challenge';
import { resolveCatalogEntry, type CatalogEntryContext } from '../model/catalog-entry-context';
import { CUSTOM_REQUEST_COPY } from '../model/custom-request-copy';
import {
  customRequestFlowReducer,
  initialFlowState,
  type FlowStep,
} from '../model/custom-request-flow';
import type { CustomerOwnedDraft } from '../model/customer-owned-draft';
import { toQuantityLines } from '../model/quantity-breakdown';
import { toAssetBindings } from '../model/request-asset-slot';
import { submissionReady, subjectReady } from '../model/step-readiness';
import { buildCatalogSubmission, buildCustomerOwnedSubmission } from '../model/submission-payload';
import { variantLabel } from '../model/variant-option';
import { CatalogSubjectSection } from './catalog-subject-section';
import { CustomerOwnedSection } from './customer-owned-section';
import { QuantityBreakdownSection } from './quantity-breakdown-section';
import { ReviewSection } from './review-section';
import { StepRail } from './step-rail';
import { SubjectChooser } from './subject-chooser';
import { SubmitPanel } from './submit-panel';
import { UploadRolePanel } from './upload-role-panel';
import { VerificationStep } from './verification-step';

/** `APP5-S02` owns everything after this point; S01 only arrives there. */
const CONFIRMATION_PATH = '/yeu-cau/da-gui';
const CONFIRMATION_CODE_PARAM = 'ma';

export function CustomRequestScreen() {
  const router = useRouter();
  const [flow, dispatch] = useReducer(customRequestFlowReducer, initialFlowState);
  const [entry, setEntry] = useState<CatalogEntryContext>({ kind: 'ABSENT' });

  // Client-only: the Studio handle lives in `localStorage`.
  useEffect(() => {
    setEntry(resolveCatalogEntry(new URLSearchParams(globalThis.location.search)));
  }, []);

  const verification = useContactVerification();

  const onVerified = useCallback((challengeId: string) => {
    dispatch({ type: 'VERIFIED', challengeId });
  }, []);
  const onVerificationReset = useCallback(() => {
    dispatch({ type: 'VERIFICATION_RESET' });
  }, []);
  useVerifiedChallenge({
    verification,
    verifiedChallengeId: flow.verifiedChallengeId,
    onVerified,
    onVerificationReset,
  });

  const onSelectionWithdrawn = useCallback(() => {
    dispatch({ type: 'VARIANT_WITHDRAWN' });
  }, []);
  // The slug is present in both placement-bearing outcomes, so the variant list
  // still loads when the Design Session is the thing that is missing: the two
  // gates are independent (`APP5-S01` §6.4) and the customer sees both answers.
  const productSlug = entry.kind === 'ABSENT' ? undefined : entry.scope.productSlug;
  const variants = useCatalogVariants({
    productSlug: flow.subject === 'CATALOG' ? productSlug : undefined,
    selectedVariantId: flow.selectedVariantId,
    onSelectionWithdrawn,
  });

  const uploads = useRequestUploads(flow.verifiedChallengeId);

  const onSubmitted = useCallback(
    (result: CustomRequestSubmissionResponse) => {
      // The minimum the confirmation needs. The code is display-only and opens
      // nothing (`APP5-G01` §5); no grant token, request id or challenge id
      // travels here, and S01 renders no confirmation content of its own.
      const params = new URLSearchParams({ [CONFIRMATION_CODE_PARAM]: result.code });
      dispatch({ type: 'FLOW_RESET' });
      router.push(`${CONFIRMATION_PATH}?${params.toString()}`);
    },
    [router],
  );
  const submission = useRequestSubmission({ onSubmitted });

  const designSessionId = entry.kind === 'READY' ? entry.designSessionId : undefined;
  const readinessInput = useMemo(
    () => ({
      state: flow,
      designSessionId,
      variantsSelectable: variants.status === 'READY',
    }),
    [flow, designSessionId, variants.status],
  );
  const step1Ready = subjectReady(readinessInput);
  const canSubmit = submissionReady(readinessInput, uploads.slots);

  return (
    <section className="custom-request">
      <h1 className="custom-request__heading">{CUSTOM_REQUEST_COPY.pageTitle}</h1>
      <p className="custom-request__intro">{CUSTOM_REQUEST_COPY.pageIntro}</p>

      <StepRail
        current={flow.step}
        subjectReady={step1Ready}
        verified={flow.verifiedChallengeId !== undefined}
        onNavigate={(step: FlowStep) => {
          dispatch({ type: 'STEP_CHANGED', step });
        }}
      />

      {flow.step === 'SUBJECT' ? renderSubjectStep() : null}
      {flow.step === 'VERIFY' ? (
        <VerificationStep
          verification={verification}
          verified={flow.verifiedChallengeId !== undefined}
        />
      ) : null}
      {flow.step === 'ATTACH' ? renderAttachStep() : null}
    </section>
  );

  function renderSubjectStep() {
    return (
      <>
        <SubjectChooser
          subject={flow.subject}
          onChoose={(subject) => {
            dispatch({ type: 'SUBJECT_CHOSEN', subject });
          }}
        />

        {flow.subject === 'CATALOG' ? renderCatalogBranch() : null}
        {flow.subject === 'CUSTOMER_OWNED' ? renderCustomerOwnedBranch() : null}

        {flow.subject === undefined ? null : (
          <button
            type="button"
            className="custom-request__button custom-request__button--primary"
            onClick={() => {
              // Validation appears on the first attempt to move on, not while
              // the customer is still filling the first field in.
              if (!step1Ready) {
                dispatch({ type: 'VALIDATION_REQUESTED' });
                return;
              }
              // Re-read the variant list on the way out of step 1. Publication
              // is re-checked server-side on every request and a delisting can
              // land between choosing and submitting; catching it here turns a
              // 422 at submit into a reselection while the customer is still
              // looking at the selector.
              if (flow.subject === 'CATALOG') variants.refetch();
              dispatch({ type: 'STEP_CHANGED', step: 'VERIFY' });
            }}
          >
            {CUSTOM_REQUEST_COPY.steps.continueToVerify}
          </button>
        )}
      </>
    );
  }

  function renderCatalogBranch() {
    return (
      <>
        <CatalogSubjectSection
          variants={variants}
          // The one fact that draws `650:187`. An empty variant list is a
          // different state and is handled inside the section (§17.A vs §17.C).
          sessionUnusable={entry.kind !== 'READY'}
          selectedVariantId={flow.selectedVariantId}
          variantWithdrawn={flow.variantWithdrawn}
          showValidation={flow.showValidation}
          onSelect={(productVariantId) => {
            dispatch({ type: 'VARIANT_SELECTED', productVariantId });
          }}
        />
        <QuantityBreakdownSection
          lines={flow.quantityLines}
          required
          // Scoped beneath the selected variant, literally: until one is chosen
          // there is nothing for a quantity to belong to.
          disabled={flow.selectedVariantId === undefined}
          hint={
            flow.selectedVariantId === undefined
              ? CUSTOM_REQUEST_COPY.quantity.catalogHintNoVariant
              : CUSTOM_REQUEST_COPY.quantity.catalogHint
          }
          showValidation={flow.showValidation}
          onChange={quantityChanged}
          onAdd={() => {
            dispatch({ type: 'QUANTITY_LINE_ADDED' });
          }}
          onRemove={(key) => {
            dispatch({ type: 'QUANTITY_LINE_REMOVED', key });
          }}
        />
      </>
    );
  }

  function renderCustomerOwnedBranch() {
    return (
      <>
        <CustomerOwnedSection
          draft={flow.customerOwned}
          showValidation={flow.showValidation}
          onChange={(field: keyof CustomerOwnedDraft, value: string) => {
            dispatch({ type: 'CUSTOMER_OWNED_CHANGED', field, value });
          }}
        />
        <QuantityBreakdownSection
          lines={flow.quantityLines}
          required={false}
          disabled={false}
          hint={CUSTOM_REQUEST_COPY.quantity.customerOwnedHint}
          showValidation={flow.showValidation}
          onChange={quantityChanged}
          onAdd={() => {
            dispatch({ type: 'QUANTITY_LINE_ADDED' });
          }}
          onRemove={(key) => {
            dispatch({ type: 'QUANTITY_LINE_REMOVED', key });
          }}
        />
      </>
    );
  }

  function renderAttachStep() {
    if (flow.verifiedChallengeId === undefined) {
      return <p className="custom-request__error">{CUSTOM_REQUEST_COPY.verification.required}</p>;
    }

    return (
      <>
        {flow.subject === 'CUSTOMER_OWNED' ? (
          <UploadRolePanel
            role="COP_IMAGE"
            heading={CUSTOM_REQUEST_COPY.upload.copHeading}
            hint={CUSTOM_REQUEST_COPY.upload.copHint}
            chooseLabel={CUSTOM_REQUEST_COPY.upload.chooseCopImage}
            slots={uploads.slots}
            capReached={uploads.capReachedFor('COP_IMAGE')}
            quotaReached={uploads.quotaReached}
            missing={flow.showValidation && !canSubmit}
            onAdd={uploads.addFiles}
            onRetry={uploads.retry}
            onRemove={uploads.remove}
          />
        ) : null}

        <UploadRolePanel
          role="REFERENCE"
          heading={CUSTOM_REQUEST_COPY.upload.referenceHeading}
          hint={CUSTOM_REQUEST_COPY.upload.referenceHint}
          chooseLabel={CUSTOM_REQUEST_COPY.upload.chooseReference}
          slots={uploads.slots}
          capReached={uploads.capReachedFor('REFERENCE')}
          quotaReached={uploads.quotaReached}
          missing={false}
          onAdd={uploads.addFiles}
          onRetry={uploads.retry}
          onRemove={uploads.remove}
        />

        {flow.subject === undefined ? null : (
          <ReviewSection
            subject={flow.subject}
            variantLabel={selectedVariantLabel()}
            customerOwned={flow.customerOwned}
            quantityLines={flow.quantityLines}
            slots={uploads.slots}
            recipientMasked={verification.state.recipientMasked}
            customerNote={flow.customerNote}
            onNoteChange={(value) => {
              dispatch({ type: 'NOTE_CHANGED', value });
            }}
          />
        )}

        {uploads.hasPending ? (
          <p className="custom-request__hint" role="status">
            {CUSTOM_REQUEST_COPY.upload.pending}
          </p>
        ) : null}

        <SubmitPanel
          ready={canSubmit}
          isSubmitting={submission.isSubmitting}
          outcome={submission.outcome}
          onSubmit={submit}
          onRestartVerification={() => {
            verification.restart();
            dispatch({ type: 'VERIFICATION_RESET' });
          }}
        />
      </>
    );
  }

  function quantityChanged(key: string, field: 'sizeLabel' | 'quantity', value: string) {
    dispatch({ type: 'QUANTITY_CHANGED', key, field, value });
  }

  function selectedVariantLabel(): string | undefined {
    const selected = variants.variants.find(
      (variant) => variant.productVariantId === flow.selectedVariantId,
    );
    return selected === undefined ? undefined : variantLabel(selected);
  }

  function submit() {
    const challengeId = flow.verifiedChallengeId;
    if (challengeId === undefined || !canSubmit) {
      dispatch({ type: 'VALIDATION_REQUESTED' });
      return;
    }

    const shared = {
      challengeId,
      breakdown: toQuantityLines(flow.quantityLines),
      // Only ids `APP5-B02` calls bindable; the filter lives in the model.
      assets: toAssetBindings(uploads.slots),
      customerNote: flow.customerNote,
    };

    if (flow.subject === 'CATALOG') {
      // Narrowed by `canSubmit`, which requires all three; stated rather than
      // asserted away, so a future change to readiness cannot silently send a
      // catalog body with a missing variant.
      if (
        variants.productId === undefined ||
        flow.selectedVariantId === undefined ||
        designSessionId === undefined
      ) {
        return;
      }
      submission.submit(
        buildCatalogSubmission({
          ...shared,
          productId: variants.productId,
          productVariantId: flow.selectedVariantId,
          designSessionId,
        }),
      );
      return;
    }

    submission.submit(buildCustomerOwnedSubmission({ ...shared, draft: flow.customerOwned }));
  }
}
