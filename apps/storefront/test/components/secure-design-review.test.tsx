/**
 * `/truy-cap/duyet-thiet-ke` — bootstrap ordering, the access states, the
 * preview, the agreement gate and the approval flow (`APP6-S02` §6, §9, §10,
 * §11, §13, §14, §15, §16, §17, §20).
 *
 * The assertion that matters most is not "the right card rendered" but **when
 * the request left** and **what it carried**: every test that expects a POST
 * proves the address bar was already clean at the moment it was issued, and
 * every approval proves it named the exact version, the exact stored hash and
 * exactly the agreements the customer ticked. Both are captured from the mock
 * at call time rather than inspected afterwards, when they would be true for
 * the wrong reason.
 *
 * `publicSecureLinkResolve` is mocked alongside the three real calls purely so
 * the suite can assert it is never reached: chaining B06 in front of B10 would
 * authorize the same credential twice.
 */
import {
  publicDesignReviewApprove,
  publicDesignReviewCurrent,
  publicDesignReviewRequestRevision,
  publicSecureLinkResolve,
} from '@embroidery/api-client';
import {
  createTestQueryClient,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { act } from 'react';

import { SECURE_LINK_COPY } from '../../src/features/secure-link-access/model/secure-link-copy';
import { DESIGN_REVIEW_COPY as COPY } from '../../src/features/secure-design-review/model/design-review-copy';
import { SecureDesignReviewScreen } from '../../src/features/secure-design-review/ui/secure-design-review-screen';
import {
  OUT_OF_ALPHABET_TOKEN,
  SHORT_TOKEN,
  TEST_TOKEN,
  apiFailure,
  envelopeOf,
  networkFailure,
} from '../support/secure-link-fixture';
import {
  DOCUMENT_HASH,
  NEWER_DOCUMENT_HASH,
  NEWER_VERSION_ID,
  PAYMENT_AGREEMENT_ID,
  PAYMENT_CONTENT_HASH,
  REPUBLISHED_CONTENT_HASH,
  RETURN_AGREEMENT_ID,
  RETURN_CONTENT_HASH,
  VERSION_ID,
  asTransport,
  catalogDocument,
  copDocument,
  imageElement,
  makeApproved,
  makeReview,
  navigateToDesignReview,
  paymentAgreement,
  textElement,
} from '../support/secure-design-review-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicDesignReviewCurrent: jest.fn(),
  publicDesignReviewApprove: jest.fn(),
  publicDesignReviewRequestRevision: jest.fn(),
  publicSecureLinkResolve: jest.fn(),
}));

const currentMock = publicDesignReviewCurrent as jest.MockedFunction<
  typeof publicDesignReviewCurrent
>;
const approveMock = publicDesignReviewApprove as jest.MockedFunction<
  typeof publicDesignReviewApprove
>;
const reviseMock = publicDesignReviewRequestRevision as jest.MockedFunction<
  typeof publicDesignReviewRequestRevision
>;
const resolveMock = publicSecureLinkResolve as jest.MockedFunction<typeof publicSecureLinkResolve>;

/** What `location`/`history` looked like each time the API was called. */
interface CallSite {
  readonly hash: string;
  readonly href: string;
  readonly historyState: unknown;
  readonly body: Record<string, unknown>;
}

const callSites: CallSite[] = [];

function record(body: unknown): void {
  callSites.push({
    hash: window.location.hash,
    href: window.location.href,
    historyState: window.history.state,
    body: body as Record<string, unknown>,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  callSites.length = 0;
  navigateToDesignReview('');
});

function renderScreen() {
  return renderWithProviders(<SecureDesignReviewScreen />, {
    queryClient: createTestQueryClient(),
  });
}

function resolvesTo(review = makeReview()) {
  currentMock.mockImplementation((body) => {
    record(body);
    return Promise.resolve(envelopeOf(review));
  });
}

async function openReview(review = makeReview()) {
  resolvesTo(review);
  navigateToDesignReview(`#t=${TEST_TOKEN}`);
  const rendered = renderScreen();
  await screen.findByRole('heading', { level: 1, name: COPY.titles.review });
  return rendered;
}

function acceptAllTerms() {
  for (const box of screen.getAllByRole('checkbox')) {
    fireEvent.click(box);
  }
}

function approveButton(): HTMLElement {
  return screen.getByTestId('design-review-approve');
}

// ---------------------------------------------------------------- bootstrap

describe('APP6-S02 — fragment bootstrap', () => {
  it('captures the fragment, strips it, and only then calls B10', async () => {
    await openReview();

    expect(callSites).toHaveLength(1);
    const [call] = callSites;
    expect(call?.body.token).toBe(TEST_TOKEN);
    // The address bar was already clean when the request was issued.
    expect(call?.hash).toBe('');
    expect(call?.href).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(call?.historyState ?? null)).not.toContain(TEST_TOKEN);
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/truy-cap/duyet-thiet-ke');
  });

  it('sends the token in a body and nothing else with it', async () => {
    await openReview();
    expect(Object.keys(callSites[0]?.body ?? {})).toEqual(['token']);
  });

  it('never chains the secure-link resolve operation in front of the read', async () => {
    await openReview();
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no fragment', ''],
    ['a fragment that is not the key', '#other=value'],
    ['a token one character short', `#t=${SHORT_TOKEN}`],
    ['a token outside the alphabet', `#t=${OUT_OF_ALPHABET_TOKEN}`],
  ])('makes no request at all for %s, and still strips', async (_label, fragment) => {
    navigateToDesignReview(fragment);
    renderScreen();

    expect(await screen.findByText(SECURE_LINK_COPY.unavailable.title)).toBeInTheDocument();
    expect(currentMock).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('reloading after the strip is unrecoverable and sends nothing credentialed', async () => {
    await openReview();
    currentMock.mockClear();

    // A reload is a fresh mount at the already-clean URL.
    renderScreen();
    expect(await screen.findAllByText(SECURE_LINK_COPY.unavailable.title)).not.toHaveLength(0);
    expect(currentMock).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------- access states

describe('APP6-S02 — access states', () => {
  it('renders the one indistinguishable unavailable card for a refused link', async () => {
    currentMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));
    navigateToDesignReview(`#t=${TEST_TOKEN}`);
    renderScreen();

    expect(await screen.findByText(SECURE_LINK_COPY.unavailable.title)).toBeInTheDocument();
    // No diagnostic second request to tell the causes apart.
    expect(currentMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a transport failure distinct, retries only when asked, and once', async () => {
    currentMock.mockRejectedValueOnce(networkFailure());
    navigateToDesignReview(`#t=${TEST_TOKEN}`);
    renderScreen();

    expect(await screen.findByText(SECURE_LINK_COPY.transientError.title)).toBeInTheDocument();
    expect(currentMock).toHaveBeenCalledTimes(1);
    // The fragment is never restored to make a retry possible.
    expect(window.location.hash).toBe('');

    resolvesTo();
    fireEvent.click(screen.getByRole('button', { name: SECURE_LINK_COPY.transientError.retry }));
    expect(await screen.findByText(COPY.titles.review)).toBeInTheDocument();
    expect(currentMock).toHaveBeenCalledTimes(2);
  });
});

// ------------------------------------------------------------------ preview

describe('APP6-S02 — the exact design', () => {
  it('renders the exact version, schema version and stored hash B10 returned', async () => {
    await openReview();

    expect(screen.getByTestId('design-review-document-hash')).toHaveTextContent(DOCUMENT_HASH);
    expect(screen.getByText(COPY.exactVersion.version(2))).toBeInTheDocument();
    expect(screen.getByText(COPY.exactVersion.schema(1))).toBeInTheDocument();
  });

  it('draws the Catalog v1 document as native SVG', async () => {
    await openReview();

    const svg = screen.getByTestId('design-review-preview-svg');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 1000 800');
    expect(screen.getByTestId('design-review-element-el-text')).toBeInTheDocument();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('draws the customer-owned-product v2 document without converting it', async () => {
    await openReview(
      makeReview({ document: asTransport(copDocument()), documentSchemaVersion: 2, version: 3 }),
    );

    expect(screen.getByTestId('design-review-preview-svg')).toBeInTheDocument();
    expect(screen.getByTestId('design-review-element-el-cop-text')).toBeInTheDocument();
    expect(screen.getByText(COPY.exactVersion.schema(2))).toBeInTheDocument();
  });

  it('draws an image element as an honest frame, never as a borrowed picture', async () => {
    await openReview(makeReview({ document: asTransport(catalogDocument([imageElement('i1')])) }));

    expect(screen.getByTestId('design-review-image-placeholder')).toBeInTheDocument();
    expect(document.querySelector('image')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });

  it('renders document text as an SVG text node, never as markup', async () => {
    await openReview(
      makeReview({
        document: asTransport(
          catalogDocument([textElement('t1', { text: '<script>alert(1)</script>' })]),
        ),
      }),
    );

    const node = screen.getByTestId('design-review-element-t1');
    expect(node.querySelector('text')?.textContent).toBe('<script>alert(1)</script>');
    expect(node.querySelector('script')).toBeNull();
    expect(node.querySelector('foreignObject')).toBeNull();
  });

  it('offers no approval over a design it could not draw', async () => {
    await openReview(makeReview({ document: { broken: true } as never }));

    expect(screen.getByTestId('design-review-preview-failed')).toBeInTheDocument();
    expect(screen.queryByTestId('design-review-preview-svg')).toBeNull();
    acceptAllTerms();
    expect(approveButton()).toBeDisabled();
  });
});

// ---------------------------------------------------------------- watermark

describe('APP6-S02 — watermark and no export', () => {
  it('always marks the preview, in every state', async () => {
    await openReview();
    expect(screen.getByTestId('design-review-watermark')).toBeInTheDocument();
    expect(screen.getByTestId('design-review-watermark-policy')).toBeInTheDocument();
  });

  it('offers no control that could remove it', async () => {
    await openReview();
    const labels = screen
      .getAllByRole('button')
      .map((button) => button.textContent ?? '')
      .join(' ');
    for (const forbidden of ['chìm', 'watermark', 'Ẩn', 'Tắt']) {
      expect(labels).not.toContain(forbidden);
    }
  });

  it('offers nothing to download or export', async () => {
    await openReview();
    expect(document.querySelector('a[download]')).toBeNull();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('Tải về');
    expect(text).not.toContain('Xuất file');
    // And it makes no claim it cannot keep.
    expect(text).not.toContain('chụp màn hình');
  });
});

// --------------------------------------------------------------- agreements

describe('APP6-S02 — the effective agreement set', () => {
  it('renders exactly the array B10 returned, with its published text', async () => {
    await openReview();

    expect(screen.getByTestId('design-review-agreement-content-PAYMENT_POLICY')).toHaveTextContent(
      'Khách hàng đặt cọc theo tỉ lệ ghi trên báo giá.',
    );
    expect(screen.getByTestId('design-review-agreement-content-RETURN_POLICY')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('renders whatever types the policy publishes, with no hard-coded set', async () => {
    await openReview(
      makeReview({ agreements: [paymentAgreement({ agreementType: 'WORKSHOP_TERMS' })] }),
    );

    expect(screen.getByTestId('design-review-agreement-WORKSHOP_TERMS')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('DESIGN_APPROVAL_TERMS');
  });

  it('renders agreement content as text, never as executable markup', async () => {
    await openReview(
      makeReview({
        agreements: [paymentAgreement({ content: 'Điều <b>một</b>\n\n<img src=x onerror=1>' })],
      }),
    );

    const block = screen.getByTestId('design-review-agreement-content-PAYMENT_POLICY');
    expect(block.textContent).toContain('<b>một</b>');
    expect(block.querySelector('b')).toBeNull();
    expect(block.querySelector('img')).toBeNull();
  });

  it('keeps approval unavailable until every agreement is explicitly accepted', async () => {
    await openReview();

    expect(approveButton()).toBeDisabled();
    expect(screen.getByText(COPY.agreements.outstanding(2))).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(approveButton()).toBeDisabled();
    expect(screen.getByText(COPY.agreements.outstanding(1))).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('checkbox')[1]!);
    expect(approveButton()).toBeEnabled();
  });

  it('attaches the reason to the disabled control programmatically', async () => {
    await openReview();

    const described = approveButton().getAttribute('aria-describedby');
    expect(described).not.toBeNull();
    expect(document.getElementById(described!)?.textContent).toBe(COPY.agreements.outstanding(2));
  });
});

// ------------------------------------------------------------------ approve

describe('APP6-S02 — approval binds the exact decision', () => {
  function approvesWith(outcome = makeApproved()) {
    approveMock.mockImplementation((body) => {
      record(body);
      return Promise.resolve(envelopeOf(outcome));
    });
  }

  async function reachConfirmation(review = makeReview()) {
    await openReview(review);
    acceptAllTerms();
    fireEvent.click(approveButton());
    await screen.findByTestId('design-review-approve-confirm');
  }

  it('requires an explicit confirmation before anything leaves the browser', async () => {
    approvesWith();
    await openReview();
    acceptAllTerms();
    fireEvent.click(approveButton());

    expect(await screen.findByTestId('design-review-approve-confirm')).toBeInTheDocument();
    expect(approveMock).not.toHaveBeenCalled();
  });

  it('submits the exact version, the stored hash and the exact ticked set', async () => {
    approvesWith();
    await reachConfirmation();
    fireEvent.click(screen.getByTestId('design-review-approve-confirm'));

    await waitFor(() => {
      expect(approveMock).toHaveBeenCalledTimes(1);
    });
    const body = callSites.at(-1)?.body;
    expect(body?.token).toBe(TEST_TOKEN);
    expect(body?.versionId).toBe(VERSION_ID);
    expect(body?.documentHash).toBe(DOCUMENT_HASH);
    expect(body?.acceptedAgreements).toEqual([
      { agreementVersionId: PAYMENT_AGREEMENT_ID, contentHash: PAYMENT_CONTENT_HASH },
      { agreementVersionId: RETURN_AGREEMENT_ID, contentHash: RETURN_CONTENT_HASH },
    ]);
    expect(Object.keys(body ?? {}).sort()).toEqual([
      'acceptedAgreements',
      'documentHash',
      'token',
      'versionId',
    ]);
  });

  /*
   * Both activations happen inside **one** `act`, and that is the whole point.
   *
   * Two separate `fireEvent.click` calls each flush a render between them, so
   * the second one already sees `isPending === true` — which means such a test
   * passes against a guard written on `isPending` and proves nothing about the
   * window this guard exists to close. Batched into a single act, neither click
   * has seen a re-render, both read the pre-update value, and only a ref written
   * synchronously before `mutate()` can stop the second.
   */
  it('sends one request when the confirmation is activated twice in the same tick', async () => {
    approvesWith();
    await reachConfirmation();

    const confirm = screen.getByTestId('design-review-approve-confirm');
    act(() => {
      confirm.click();
      confirm.click();
    });

    await waitFor(() => {
      expect(approveMock).toHaveBeenCalledTimes(1);
    });
  });

  it('renders the committed outcome and claims nothing beyond it', async () => {
    approvesWith();
    await reachConfirmation();
    fireEvent.click(screen.getByTestId('design-review-approve-confirm'));

    expect(await screen.findByTestId('design-review-approved')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: COPY.titles.approved }),
    ).toBeInTheDocument();

    // Scoped to the outcome card, and to the outcome card only. The agreement
    // blocks above it legitimately talk about deposits and payment — that is
    // B10's published policy text, rendered verbatim — so a page-wide ban would
    // forbid the very thing §9 requires. What must claim nothing is the card
    // reporting what just happened.
    const outcome = screen.getByTestId('design-review-approved').textContent ?? '';
    expect(outcome).toContain(COPY.approved.scope);
    // The scope sentence *denies* all four, so it is removed before the words
    // are banned — otherwise the denial would fail the test requiring it.
    const claims = outcome.split(COPY.approved.scope).join(' ');
    for (const forbidden of ['đơn hàng', 'thanh toán', 'giữ hàng', 'sản xuất', 'đặt cọc']) {
      expect(claims).not.toContain(forbidden);
    }
    // The server's own request-status projection is not shown to a customer.
    expect(document.body.textContent ?? '').not.toContain('APPROVED');
  });

  it('reports a replayed approval as the committed success it is', async () => {
    approvesWith(makeApproved({ replayed: true }));
    await reachConfirmation();
    fireEvent.click(screen.getByTestId('design-review-approve-confirm'));

    expect(await screen.findByTestId('design-review-approved')).toBeInTheDocument();
    expect(screen.getByText(COPY.approved.replayed)).toBeInTheDocument();
  });
});

// -------------------------------------------------------------------- races

describe('APP6-S02 — reconciliation is bounded and never auto-approves', () => {
  async function refuseApprovalWith(status: number, code: string, review = makeReview()) {
    approveMock.mockRejectedValue(apiFailure(status, code));
    await openReview(review);
    acceptAllTerms();
    fireEvent.click(approveButton());
    fireEvent.click(await screen.findByTestId('design-review-approve-confirm'));
  }

  it('re-reads exactly once on APPROVAL_VERSION_MISMATCH and asks for a new decision', async () => {
    await refuseApprovalWith(409, 'APPROVAL_VERSION_MISMATCH');

    resolvesTo(
      makeReview({
        designVersionId: NEWER_VERSION_ID,
        documentHash: NEWER_DOCUMENT_HASH,
        version: 3,
      }),
    );
    expect(await screen.findByText(COPY.mismatch.title)).toBeInTheDocument();

    expect(currentMock).toHaveBeenCalledTimes(2);
    expect(approveMock).toHaveBeenCalledTimes(1);
    // Consent died with the intent: the new terms are untouched.
    fireEvent.click(screen.getByRole('button', { name: COPY.actions.reviewLatest }));
    expect(approveButton()).toBeDisabled();
  });

  it('re-reads exactly once on TERMS_NOT_ACCEPTED and calls it a terms change', async () => {
    await refuseApprovalWith(409, 'TERMS_NOT_ACCEPTED');

    resolvesTo(
      makeReview({
        agreements: [
          paymentAgreement({ contentHash: REPUBLISHED_CONTENT_HASH, content: 'Nội dung mới.' }),
        ],
      }),
    );
    expect(await screen.findByText(COPY.termsChanged.title)).toBeInTheDocument();
    expect(screen.queryByText(COPY.mismatch.title)).toBeNull();

    expect(currentMock).toHaveBeenCalledTimes(2);
    expect(approveMock).toHaveBeenCalledTimes(1);
    expect(approveButton()).toBeDisabled();
  });

  it('bounds DUPLICATE_OPERATION without re-reading or polling', async () => {
    await refuseApprovalWith(409, 'DUPLICATE_OPERATION');

    expect(await screen.findByText(COPY.notices.DUPLICATE_OPERATION.title)).toBeInTheDocument();
    expect(currentMock).toHaveBeenCalledTimes(1);
    expect(approveMock).toHaveBeenCalledTimes(1);
  });

  it('fabricates no success on IDEMPOTENCY_CONFLICT and reconciles once', async () => {
    await refuseApprovalWith(409, 'IDEMPOTENCY_CONFLICT');

    resolvesTo();
    expect(await screen.findByText(COPY.notices.IDEMPOTENCY_CONFLICT.title)).toBeInTheDocument();
    expect(screen.queryByTestId('design-review-approved')).toBeNull();
    expect(currentMock).toHaveBeenCalledTimes(2);
  });

  it('reports an unpublished policy as a service fault, not as a terms failure', async () => {
    await refuseApprovalWith(503, '');

    expect(await screen.findByText(COPY.notices.POLICY_UNAVAILABLE.title)).toBeInTheDocument();
    expect(screen.queryByText(COPY.termsChanged.title)).toBeNull();
    expect(currentMock).toHaveBeenCalledTimes(1);
  });

  it('ends the session into the same unavailable card when the grant dies mid-decision', async () => {
    await refuseApprovalWith(404, 'SECURE_LINK_UNAVAILABLE');

    expect(await screen.findByText(SECURE_LINK_COPY.unavailable.title)).toBeInTheDocument();
    expect(currentMock).toHaveBeenCalledTimes(1);
  });

  it('never navigates away from the route for a step-up', async () => {
    await refuseApprovalWith(403, 'REVERIFICATION_REQUIRED');

    expect(await screen.findByText(COPY.stepUp.title)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/truy-cap/duyet-thiet-ke');
    expect(reviseMock).not.toHaveBeenCalled();
  });
});
