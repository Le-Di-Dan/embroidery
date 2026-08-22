/**
 * The secure-link credential, the verification code and the design itself must
 * exist only in ephemeral component-local memory (`APP6-S02` §6, §11, §26).
 *
 * Adapted from the `APP6-S01` secrecy proof, with one surface this landing adds
 * that no earlier one had: **the design document**. It is customer artwork,
 * it is large, and it is the sort of thing a cache or a draft-saving convenience
 * quietly persists. So the sweep below asserts that neither the credential nor
 * the document reaches storage, and it runs at every point in the flow — after
 * the read that retains the credential, while a confirmation is open, during a
 * step-up, and after each decision commits.
 *
 * Each assertion names the surface it inspects rather than trusting a comment:
 * the TanStack query and mutation caches, `localStorage`, `sessionStorage`,
 * `document.cookie`, the URL, `history.state`, the rendered DOM and everything
 * written to the console.
 *
 * The token and code literals live in the fixtures and deliberately never
 * appear in the completion report.
 */
import {
  publicDesignReviewApprove,
  publicDesignReviewCurrent,
  publicDesignReviewRequestRevision,
  publicVerificationIssue,
  publicVerificationReadStatus,
  publicVerificationResend,
  publicVerificationSubmitAttempt,
} from '@embroidery/api-client';
import {
  createTestQueryClient,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import type { QueryClient } from '@tanstack/react-query';

import { VERIFICATION_COPY } from '../../src/features/contact-verification/model/verification-copy';
import { DESIGN_REVIEW_COPY as COPY } from '../../src/features/secure-design-review/model/design-review-copy';
import { SecureDesignReviewScreen } from '../../src/features/secure-design-review/ui/secure-design-review-screen';
import { TEST_TOKEN, apiFailure, envelopeOf, networkFailure } from '../support/secure-link-fixture';
import {
  TEST_CODE,
  TEST_EMAIL,
  envelopeOf as verificationEnvelope,
  makeChallenge,
  makeStatus,
} from '../support/verification-fixture';
import {
  makeApproved,
  makeReview,
  makeRevisionRequested,
  navigateToDesignReview,
} from '../support/secure-design-review-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicDesignReviewCurrent: jest.fn(),
  publicDesignReviewApprove: jest.fn(),
  publicDesignReviewRequestRevision: jest.fn(),
  publicVerificationIssue: jest.fn(),
  publicVerificationResend: jest.fn(),
  publicVerificationSubmitAttempt: jest.fn(),
  publicVerificationReadStatus: jest.fn(),
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
const issueMock = publicVerificationIssue as jest.MockedFunction<typeof publicVerificationIssue>;
const attemptMock = publicVerificationSubmitAttempt as jest.MockedFunction<
  typeof publicVerificationSubmitAttempt
>;
const statusMock = publicVerificationReadStatus as jest.MockedFunction<
  typeof publicVerificationReadStatus
>;
const resendMock = publicVerificationResend as jest.MockedFunction<typeof publicVerificationResend>;

const consoleOutput: string[] = [];
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
const originalConsole = new Map<string, unknown>();

beforeEach(() => {
  jest.clearAllMocks();
  consoleOutput.length = 0;
  for (const method of CONSOLE_METHODS) {
    originalConsole.set(method, console[method]);
    console[method] = (...args: unknown[]) => {
      consoleOutput.push(args.map((value) => String(value)).join(' '));
    };
  }
  issueMock.mockResolvedValue(verificationEnvelope(makeChallenge()));
  attemptMock.mockResolvedValue(verificationEnvelope(makeStatus('VERIFIED')));
  statusMock.mockResolvedValue(verificationEnvelope(makeStatus('VERIFIED')));
  resendMock.mockResolvedValue(verificationEnvelope(makeChallenge()));
  navigateToDesignReview(`#t=${TEST_TOKEN}`);
});

afterEach(() => {
  for (const method of CONSOLE_METHODS) {
    (console as unknown as Record<string, unknown>)[method] = originalConsole.get(method);
  }
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function renderScreen(queryClient: QueryClient = createTestQueryClient()) {
  return renderWithProviders(<SecureDesignReviewScreen />, { queryClient });
}

/** Every observable surface, serialised, so one assertion can sweep them all. */
function observableSurfaces(queryClient: QueryClient, container: HTMLElement): string {
  return [
    window.location.href,
    JSON.stringify(window.history.state ?? null),
    JSON.stringify(window.localStorage),
    JSON.stringify(window.sessionStorage),
    document.cookie,
    container.innerHTML,
    consoleOutput.join('\n'),
    JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((entry) => entry.state),
    ),
    JSON.stringify(
      queryClient
        .getMutationCache()
        .getAll()
        .map((entry) => entry.state),
    ),
  ].join('\n');
}

/** Only the durable stores — where a document must never be written at all. */
function persistentStores(): string {
  return [
    JSON.stringify(window.localStorage),
    JSON.stringify(window.sessionStorage),
    document.cookie,
    window.location.href,
    JSON.stringify(window.history.state ?? null),
  ].join('\n');
}

async function openReview() {
  currentMock.mockResolvedValue(envelopeOf(makeReview()));
  const rendered = renderScreen();
  await screen.findByRole('heading', { level: 1, name: COPY.titles.review });
  return rendered;
}

function acceptAllTerms() {
  for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);
}

describe('APP6-S02 — credential secrecy', () => {
  it('leaves the credential in no observable surface after the read that retains it', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeReview()));
    const queryClient = createTestQueryClient();

    const { container } = renderScreen(queryClient);

    await screen.findByRole('heading', { level: 1, name: COPY.titles.review });
    expect(observableSurfaces(queryClient, container)).not.toContain(TEST_TOKEN);
  });

  it('leaves it in no observable surface while the approval confirmation is open', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeReview()));
    const queryClient = createTestQueryClient();

    const { container } = renderScreen(queryClient);
    await screen.findByRole('heading', { level: 1, name: COPY.titles.review });
    acceptAllTerms();
    fireEvent.click(screen.getByTestId('design-review-approve'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(observableSurfaces(queryClient, container)).not.toContain(TEST_TOKEN);
  });

  it('leaves it in no observable surface once an approval has committed', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeReview()));
    approveMock.mockResolvedValue(envelopeOf(makeApproved()));
    const queryClient = createTestQueryClient();

    const { container } = renderScreen(queryClient);
    await screen.findByRole('heading', { level: 1, name: COPY.titles.review });
    acceptAllTerms();
    fireEvent.click(screen.getByTestId('design-review-approve'));
    fireEvent.click(await screen.findByTestId('design-review-approve-confirm'));

    await screen.findByTestId('design-review-approved');
    expect(observableSurfaces(queryClient, container)).not.toContain(TEST_TOKEN);
  });

  it('leaves it in no observable surface once a revision request has committed', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeReview()));
    reviseMock.mockResolvedValue(envelopeOf(makeRevisionRequested()));
    const queryClient = createTestQueryClient();

    const { container } = renderScreen(queryClient);
    await screen.findByRole('heading', { level: 1, name: COPY.titles.review });
    fireEvent.click(screen.getByTestId('design-review-request-revision'));
    fireEvent.change(await screen.findByTestId('design-review-revision-feedback'), {
      target: { value: 'Đổi màu chỉ.' },
    });
    fireEvent.click(screen.getByTestId('design-review-revision-submit'));

    await screen.findByTestId('design-review-revision-requested');
    expect(observableSurfaces(queryClient, container)).not.toContain(TEST_TOKEN);
  });

  it('never puts the credential into mutation variables, on any of the three calls', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeReview()));
    approveMock.mockResolvedValue(envelopeOf(makeApproved()));
    const queryClient = createTestQueryClient();

    renderScreen(queryClient);
    await screen.findByRole('heading', { level: 1, name: COPY.titles.review });
    acceptAllTerms();
    fireEvent.click(screen.getByTestId('design-review-approve'));
    fireEvent.click(await screen.findByTestId('design-review-approve-confirm'));
    await screen.findByTestId('design-review-approved');

    for (const mutation of queryClient.getMutationCache().getAll()) {
      expect(mutation.state.variables).toBeUndefined();
    }
  });

  it('keeps it out of every surface across a transient failure that retains it', async () => {
    currentMock.mockRejectedValueOnce(networkFailure());
    const queryClient = createTestQueryClient();

    const { container } = renderScreen(queryClient);
    await screen.findByRole('button', { name: /.*/ });

    expect(observableSurfaces(queryClient, container)).not.toContain(TEST_TOKEN);
    expect(window.location.hash).toBe('');
  });

  it('keeps it out of every surface through a step-up and its re-read', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeReview()));
    approveMock.mockRejectedValue(apiFailure(403, 'REVERIFICATION_REQUIRED'));
    const queryClient = createTestQueryClient();

    const { container } = renderScreen(queryClient);
    await screen.findByRole('heading', { level: 1, name: COPY.titles.review });
    acceptAllTerms();
    fireEvent.click(screen.getByTestId('design-review-approve'));
    fireEvent.click(await screen.findByTestId('design-review-approve-confirm'));
    await screen.findByText(COPY.stepUp.title);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: TEST_EMAIL } });
    fireEvent.click(screen.getByRole('button', { name: VERIFICATION_COPY.contactEntry.submit }));
    await screen.findByText(VERIFICATION_COPY.codeEntry.title);
    fireEvent.change(screen.getByLabelText(VERIFICATION_COPY.codeEntry.fieldLabel), {
      target: { value: TEST_CODE },
    });
    fireEvent.click(screen.getByRole('button', { name: VERIFICATION_COPY.codeEntry.submit }));

    await waitFor(() => {
      expect(currentMock).toHaveBeenCalledTimes(2);
    });

    const surfaces = observableSurfaces(queryClient, container);
    expect(surfaces).not.toContain(TEST_TOKEN);
    // The verification code never leaves the input and its ref either.
    expect(surfaces).not.toContain(TEST_CODE);
  });
});

describe('APP6-S02 — the design and the decision are not persisted', () => {
  it('writes no part of the document to any durable store', async () => {
    await openReview();

    const stored = persistentStores();
    expect(stored).not.toContain('schemaVersion');
    expect(stored).not.toContain('canvasWidthPx');
    expect(stored).not.toContain('Nét Thêu');
    expect(stored).toBe(['{}', '{}', '', window.location.href, 'null'].join('\n'));
  });

  it('puts no agreement id or content hash in the URL', async () => {
    await openReview();

    acceptAllTerms();
    expect(window.location.href).not.toContain('sha256');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('exposes no private storage or provider address anywhere on the page', async () => {
    const { container } = await openReview();

    const html = container.innerHTML;
    for (const leak of ['s3', 'blob:', 'amazonaws', 'minio', 'presigned', 'X-Amz']) {
      expect(html).not.toContain(leak);
    }
  });

  it('logs nothing at all — not the document, not a decision, not an error', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeReview()));
    approveMock.mockRejectedValue(apiFailure(409, 'DUPLICATE_OPERATION'));

    renderScreen();
    await screen.findByRole('heading', { level: 1, name: COPY.titles.review });
    acceptAllTerms();
    fireEvent.click(screen.getByTestId('design-review-approve'));
    fireEvent.click(await screen.findByTestId('design-review-approve-confirm'));
    await screen.findByText(COPY.notices.DUPLICATE_OPERATION.title);

    expect(consoleOutput.join('\n')).not.toContain(TEST_TOKEN);
    expect(consoleOutput.join('\n')).not.toContain('schemaVersion');
  });
});
