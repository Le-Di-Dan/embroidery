/**
 * `APP10-A02` — reading a merge case, its consequence preview and its decided
 * states.
 *
 * The claims that live here:
 *
 * 1. **The case id is the whole input.** The screen is rendered with nothing but
 *    a `caseId`, exactly as a direct visit or a refresh gives it, and reads the
 *    authority itself.
 * 2. **The preview is a REQUESTED-only surface.** It is computed from current
 *    rows on every read, so after a decision the same fields describe what is
 *    live now — showing them beside a decided status would relabel a fresh
 *    reading as a record of what moved.
 * 3. **The business-profile conflict fails closed.** The blocker is shown and
 *    execute is disabled — visibly, so the reason is on screen beside the
 *    control it explains — with no overwrite, merge-fields, delete-one or
 *    continue-anyway anywhere.
 * 4. **Nothing is fabricated after a decision.** No merge-event timeline, no
 *    preview counts relabelled as what moved, no historical rejection reason and
 *    no unmerge.
 *
 * The two decisions themselves live in `customer-merge-decisions.test.tsx`.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import {
  adminCustomerMergeDetail,
  adminCustomerMergeExecute,
  adminCustomerMergeReject,
} from '@embroidery/api-client';

import { MergeCaseScreen } from '../../src/features/customer-merge';
import { CUSTOMER_MERGE_COPY } from '../../src/features/customer-merge/model/customer-merge-copy';
import { makeApiClientError } from '../support/api-error';
import { FORBIDDEN, envelope } from '../support/customer-access-fixture';
import {
  LOSER_MASK,
  LOSER_PHONE_MASK,
  LOSER_CUSTOMER_ID,
  MERGE_CASE_ID,
  SURVIVOR_CUSTOMER_ID,
  SURVIVOR_MASK,
  makeLoser,
  makeSurvivor,
  withoutDisplayName,
  makeBlockedCase,
  makeMergeCase,
  makePreview,
} from '../support/customer-merge-fixture';

jest.mock(
  'next/navigation',
  () =>
    mockCreateNavigationMock('/support/customer-access/merge/019a2b3c-4d5e-7f60-8a1b-2c3d4e5f70c1')
      .module,
);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCustomerMergeDetail: jest.fn(),
  adminCustomerMergeExecute: jest.fn(),
  adminCustomerMergeReject: jest.fn(),
}));

const detailMock = adminCustomerMergeDetail as jest.MockedFunction<typeof adminCustomerMergeDetail>;
const executeMock = adminCustomerMergeExecute as jest.MockedFunction<
  typeof adminCustomerMergeExecute
>;
const rejectMock = adminCustomerMergeReject as jest.MockedFunction<typeof adminCustomerMergeReject>;

const COPY = CUSTOMER_MERGE_COPY;

const render = () => renderWithProviders(<MergeCaseScreen mergeCaseId={MERGE_CASE_ID} />);

async function loadedCase() {
  await waitFor(() => {
    expect(screen.getByTestId('merge-case-status')).toBeInTheDocument();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  detailMock.mockReset();
  detailMock.mockResolvedValue(envelope(makeMergeCase()));
  executeMock.mockReset();
  executeMock.mockResolvedValue(
    envelope({ mergeCaseId: MERGE_CASE_ID, outcome: 'EXECUTED', status: 'EXECUTED' }),
  );
  rejectMock.mockReset();
  rejectMock.mockResolvedValue(envelope(undefined));
});

describe('the case detail read', () => {
  it('fetches the authoritative case from the id alone', async () => {
    render();
    await loadedCase();

    expect(detailMock).toHaveBeenCalledTimes(1);
    expect(detailMock.mock.calls[0]?.[0]).toBe(MERGE_CASE_ID);
  });

  it('renders both masked participants, their roles and the opening reason', async () => {
    render();
    await loadedCase();

    expect(screen.getByTestId('merge-case-status')).toHaveTextContent(
      COPY.caseDetail.statusRequested,
    );
    expect(screen.getByTestId('merge-case-survivor')).toHaveTextContent(SURVIVOR_MASK);
    expect(screen.getByTestId('merge-case-loser')).toHaveTextContent(LOSER_MASK);
    expect(screen.getByTestId('merge-case-loser')).toHaveTextContent(LOSER_PHONE_MASK);
    expect(screen.getByTestId('merge-case-open-reason')).toHaveTextContent(
      'Khách gọi điện xác nhận',
    );
    expect(document.body.textContent).toContain(COPY.selection.survivorMeaning);
    expect(document.body.textContent).toContain(COPY.selection.loserMeaning);
  });

  it('reports a case that does not exist without offering a decision', async () => {
    detailMock.mockRejectedValue(makeApiClientError({ status: 404, code: 'NOT_FOUND' }));
    render();

    expect(await screen.findByTestId('merge-case-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('merge-execute-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('merge-reject-open')).not.toBeInTheDocument();
  });

  it('offers a retry when the read failed for another reason', async () => {
    detailMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL_ERROR' }));
    render();

    expect(await screen.findByTestId('merge-case-load-error')).toBeInTheDocument();
    expect(screen.getByTestId('merge-case-retry')).toBeInTheDocument();
  });

  it('offers no swap, re-selection or unmerge control on the case', async () => {
    render();
    await loadedCase();

    for (const testId of ['merge-swap', 'merge-unmerge', 'merge-change-participants']) {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    }
    expect(document.body.textContent).toContain(COPY.caseDetail.directionNote);
  });
});

describe('the consequence preview', () => {
  it('renders every published category with a domain label, and no schema name', async () => {
    render();
    await loadedCase();

    expect(screen.getByTestId('merge-preview-contact-points')).toHaveTextContent('3');
    expect(screen.getByTestId('merge-preview-active-grants')).toHaveTextContent('1');
    expect(screen.getByTestId('merge-preview-custom-requests')).toHaveTextContent('4');
    expect(screen.getByTestId('merge-preview-orders')).toHaveTextContent('2');
    expect(screen.getByTestId('merge-preview-uploaded-assets')).toHaveTextContent('7');

    const rendered = document.body.textContent ?? '';
    for (const schemaName of [
      'secure_access_grants',
      'contact_points',
      'customer_merge_cases',
      'business_profiles',
      'consequencePreview',
      'activeSecureAccessGrants',
    ]) {
      expect(rendered).not.toContain(schemaName);
    }
  });

  it('renders business-profile readiness for both sides', async () => {
    render();
    await loadedCase();

    expect(screen.getByTestId('merge-preview-loser-profile')).toHaveTextContent(COPY.preview.no);
    expect(screen.getByTestId('merge-preview-survivor-profile')).toHaveTextContent(
      COPY.preview.yes,
    );
  });

  it('says frozen evidence is preserved rather than rewritten', async () => {
    render();
    await loadedCase();

    expect(screen.getByTestId('merge-frozen-note')).toHaveTextContent(COPY.preview.frozenNote);
  });

  it('lists no individual affected record, because the API publishes counts only', async () => {
    render();
    await loadedCase();

    expect(screen.queryByTestId('merge-affected-records')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('the business-profile blocker', () => {
  it('shows the blocker and disables execute, without hiding it', async () => {
    detailMock.mockResolvedValue(envelope(makeBlockedCase()));
    render();
    await loadedCase();

    expect(screen.getByTestId('merge-business-profile-blocker')).toHaveTextContent(
      COPY.blocker.title,
    );
    const execute = screen.getByTestId('merge-execute-open');
    expect(execute).toBeInTheDocument();
    expect(execute).toBeDisabled();
    // Rejecting stays available: it is the safe exit the blocker points at.
    expect(screen.getByTestId('merge-reject-open')).toBeEnabled();
  });

  it('offers no overwrite, merge-fields, delete-one or continue-anyway', async () => {
    detailMock.mockResolvedValue(envelope(makeBlockedCase()));
    render();
    await loadedCase();

    for (const testId of [
      'merge-profile-overwrite',
      'merge-profile-combine',
      'merge-profile-delete',
      'merge-force-execute',
    ]) {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    }
  });
});

describe('the decided states', () => {
  it('renders REJECTED with no execute action and no fabricated reason', async () => {
    detailMock.mockResolvedValue(
      envelope(makeMergeCase({ status: 'REJECTED', decidedAt: '2026-08-29T03:00:00.000Z' })),
    );
    render();
    await loadedCase();

    expect(screen.getByTestId('merge-case-status')).toHaveTextContent(
      COPY.caseDetail.statusRejected,
    );
    expect(screen.getByTestId('merge-case-rejected')).toBeInTheDocument();
    expect(screen.queryByTestId('merge-execute-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('merge-reject-open')).not.toBeInTheDocument();
    // The declining reason has no column and no read, so no field is shown and
    // none is invented. The screen no longer *explains* the gap either
    // (`V01-UX-004`): an operator cannot act on an unpublished audit record,
    // and a paragraph about it is a specification note, not operator copy.
    expect(screen.queryByTestId('merge-rejection-reason')).not.toBeInTheDocument();
    // The *opening* reason is published and stays visible; it is a different field.
    expect(screen.getByTestId('merge-case-open-reason')).toBeInTheDocument();
  });

  it('renders EXECUTED bounded: no preview counts, no timeline, no unmerge', async () => {
    detailMock.mockResolvedValue(
      envelope(
        makeMergeCase({
          status: 'EXECUTED',
          decidedAt: '2026-08-29T03:00:00.000Z',
          consequencePreview: makePreview({ orders: 9, uploadedAssets: 9 }),
        }),
      ),
    );
    render();
    await loadedCase();

    expect(screen.getByTestId('merge-case-status')).toHaveTextContent(
      COPY.caseDetail.statusExecuted,
    );
    expect(screen.getByTestId('merge-case-executed')).toBeInTheDocument();
    expect(screen.getByTestId('merge-case-decided-at')).toBeInTheDocument();

    // The preview is a REQUESTED-only surface: after a decision the same fields
    // describe what is live now, and showing them here would relabel a fresh
    // reading as a record of what moved.
    expect(screen.queryByTestId('merge-preview-tiles')).not.toBeInTheDocument();
    expect(screen.getByTestId('merge-preview-withheld')).toBeInTheDocument();

    for (const testId of ['merge-event-timeline', 'merge-unmerge', 'merge-moved-counts']) {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    }
    expect(screen.getByTestId('merge-case-executed')).toHaveTextContent(COPY.executed.noUndoNote);
    // Both masked cards and a way back remain.
    expect(screen.getByTestId('merge-case-survivor')).toHaveTextContent(SURVIVOR_MASK);
    expect(screen.getByTestId('merge-back-to-support')).toHaveAttribute(
      'href',
      '/support/customer-access',
    );
  });
});

describe('a nameless participant (`V01-UX-032`, `APP12-V02` §21.4)', () => {
  it('says why the name is absent, where one can be set, and never invents one', async () => {
    // Wave-1 identity is minted from a verified contact and carries no display
    // name, so V01 found both cards reading "Chưa có" beside two masked
    // addresses: an operator confirming an irreversible merge was choosing
    // between two blanks. §21.4 forbids the tempting fill — the recipient name
    // frozen on an order is a property of that order, not the identity of a
    // person — so the correction is to explain the absence and point at the
    // screen that can end it.
    detailMock.mockResolvedValue(
      envelope(
        makeMergeCase({
          survivor: withoutDisplayName(makeSurvivor()),
          loser: withoutDisplayName(makeLoser()),
        }),
      ),
    );
    render();
    await loadedCase();

    for (const testId of ['merge-case-survivor', 'merge-case-loser']) {
      const card = within(screen.getByTestId(testId));
      expect(card.getByTestId(`${testId}-display-name`)).toHaveTextContent(
        COPY.selection.displayNameEmpty,
      );
      expect(card.getByText(COPY.selection.displayNameEmptyHint)).toBeInTheDocument();
    }
  });

  it('prints a customer reference, because two masks can be identical', async () => {
    // `maskContact` is deterministic and lossy: two addresses at one domain
    // sharing a first character mask to the same string. Without a reference the
    // two cards of a nameless case can be literally indistinguishable, which is
    // the one thing an irreversible decision may not be.
    detailMock.mockResolvedValue(
      envelope(
        makeMergeCase({
          survivor: withoutDisplayName(makeSurvivor()),
          loser: withoutDisplayName(makeLoser()),
        }),
      ),
    );
    render();
    await loadedCase();

    const survivor = screen.getByTestId('merge-case-survivor-customer-reference');
    const loser = screen.getByTestId('merge-case-loser-customer-reference');

    // Shortened for reading, whole for assistive technology and for copying —
    // and never rendered as text, which is what `V01-UX-009` removed from the
    // order queue.
    expect(survivor).toHaveAttribute('title', SURVIVOR_CUSTOMER_ID);
    expect(loser).toHaveAttribute('title', LOSER_CUSTOMER_ID);
    expect(survivor.textContent).not.toBe(SURVIVOR_CUSTOMER_ID);
    expect(survivor.textContent).not.toBe(loser.textContent);
  });

  it('prints every instant in the one shared format', async () => {
    // `V01-UX-021`: this card used `toLocaleString('vi-VN')` with no field
    // styles, which renders a two-digit year the customer's own page never
    // shows. §30 makes `dd/MM/yyyy · HH:mm` canonical for both applications.
    render();
    await loadedCase();

    expect(screen.getByTestId('merge-case-survivor')).toHaveTextContent('02/05/2026 · 16:00');
  });
});

describe('the merge privacy boundary', () => {
  it('renders masks only — never a raw contact, token or digest', async () => {
    const user = createUser();
    render();
    await loadedCase();
    await user.click(screen.getByTestId('merge-execute-open'));

    const rendered = document.body.textContent ?? '';
    for (const forbidden of [
      FORBIDDEN.rawEmail,
      FORBIDDEN.rawPhone,
      FORBIDDEN.code,
      FORBIDDEN.token,
      FORBIDDEN.digest,
      FORBIDDEN.ciphertext,
      'normalizedValue',
      'displayValue',
    ]) {
      expect(rendered).not.toContain(forbidden);
    }
    expect(rendered).toContain(SURVIVOR_MASK);
    expect(rendered).toContain(LOSER_MASK);
  });
});
