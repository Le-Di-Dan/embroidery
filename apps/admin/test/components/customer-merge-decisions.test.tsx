/**
 * `APP10-A02` — the two decisions a REQUESTED merge case admits.
 *
 * The claims that live here:
 *
 * 1. **The confirmation restates the whole consequence**, including that frozen
 *    evidence is preserved rather than rewritten, and that there is no unmerge.
 * 2. **Execute takes the case id and no body**, so no caller can name a
 *    different pair, swap them or skip a step.
 * 3. **The rendered state is the server's.** Every settled decision re-reads,
 *    and what appears afterwards is what came back — never a local success.
 * 4. **`ALREADY_EXECUTED` is a completion.** It is the server's own field and is
 *    never presented as a failure.
 * 5. **The 409s are told apart from the re-read case**, because `APP10-B02` and
 *    `APP10-B03` publish no business code — and where the fresh record cannot
 *    separate two causes, one bounded refusal names both rather than guessing.
 *
 * Reading the case, its preview and its decided states live in
 * `customer-merge-case.test.tsx`.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import {
  adminCustomerMergeDetail,
  adminCustomerMergeExecute,
  adminCustomerMergeReject,
} from '@embroidery/api-client';

import { MergeCaseScreen } from '../../src/features/customer-merge';
import { CUSTOMER_MERGE_COPY } from '../../src/features/customer-merge/model/customer-merge-copy';
import { makeApiClientError } from '../support/api-error';
import { envelope } from '../support/customer-access-fixture';
import {
  MERGE_CASE_ID,
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

describe('executing a merge', () => {
  it('restates the pair and every consequence before confirming', async () => {
    const user = createUser();
    render();
    await loadedCase();

    await user.click(screen.getByTestId('merge-execute-open'));
    const dialog = screen.getByTestId('merge-execute-dialog');

    expect(screen.getByTestId('merge-execute-survivor')).toHaveTextContent('Nguyễn Minh An');
    expect(screen.getByTestId('merge-execute-loser')).toHaveTextContent('Nguyen Minh An');
    expect(dialog).toHaveTextContent(COPY.execute.direction);
    expect(dialog).toHaveTextContent(COPY.execute.effectOwnership);
    expect(dialog).toHaveTextContent(COPY.execute.effectGrants);
    expect(dialog).toHaveTextContent(COPY.execute.effectFrozen);
    expect(screen.getByTestId('merge-execute-irreversible')).toHaveTextContent(
      COPY.execute.irreversible,
    );
  });

  it('executes by case id with no body, then re-reads the case', async () => {
    const user = createUser();
    render();
    await loadedCase();
    const readsBefore = detailMock.mock.calls.length;

    await user.click(screen.getByTestId('merge-execute-open'));
    detailMock.mockResolvedValue(
      envelope(
        makeMergeCase({
          status: 'EXECUTED',
          decidedAt: '2026-08-29T03:00:00.000Z',
          consequencePreview: makePreview({
            contactPoints: 0,
            activeSecureAccessGrants: 0,
            customRequests: 0,
            orders: 0,
            uploadedAssets: 0,
          }),
        }),
      ),
    );
    await user.click(screen.getByTestId('merge-execute-confirm'));

    await waitFor(() => {
      expect(executeMock).toHaveBeenCalledTimes(1);
    });
    expect(executeMock.mock.calls[0]?.[0]).toBe(MERGE_CASE_ID);
    // Only the id and the request options — no body through which a caller
    // could name a different pair.
    expect(executeMock.mock.calls[0]).toHaveLength(2);

    await waitFor(() => {
      expect(detailMock.mock.calls.length).toBeGreaterThan(readsBefore);
    });
    await waitFor(() => {
      expect(screen.getByTestId('merge-execute-dialog')).toHaveTextContent(
        COPY.execute.successTitle,
      );
    });
  });

  it('treats ALREADY_EXECUTED as a safe completion, not a failure', async () => {
    executeMock.mockResolvedValue(
      envelope({ mergeCaseId: MERGE_CASE_ID, outcome: 'ALREADY_EXECUTED', status: 'EXECUTED' }),
    );
    const user = createUser();
    render();
    await loadedCase();

    await user.click(screen.getByTestId('merge-execute-open'));
    await user.click(screen.getByTestId('merge-execute-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('merge-execute-dialog')).toHaveTextContent(
        COPY.execute.alreadyTitle,
      );
    });
    expect(screen.getByTestId('merge-execute-dialog')).toHaveTextContent(COPY.execute.alreadyBody);
    expect(screen.queryByTestId('merge-execute-error')).not.toBeInTheDocument();
  });

  it('reads a business-profile refusal off the re-read case', async () => {
    executeMock.mockRejectedValue(makeApiClientError({ status: 409, code: 'CONFLICT' }));
    const user = createUser();
    render();
    await loadedCase();

    await user.click(screen.getByTestId('merge-execute-open'));
    detailMock.mockResolvedValue(envelope(makeBlockedCase()));
    await user.click(screen.getByTestId('merge-execute-confirm'));

    expect(await screen.findByTestId('merge-execute-error')).toHaveTextContent(
      COPY.executeFailure.businessProfile,
    );
  });

  it('reads a declined case off the re-read case', async () => {
    executeMock.mockRejectedValue(makeApiClientError({ status: 409, code: 'CONFLICT' }));
    const user = createUser();
    render();
    await loadedCase();

    await user.click(screen.getByTestId('merge-execute-open'));
    detailMock.mockResolvedValue(
      envelope(makeMergeCase({ status: 'REJECTED', decidedAt: '2026-08-29T03:00:00.000Z' })),
    );
    await user.click(screen.getByTestId('merge-execute-confirm'));

    expect(await screen.findByTestId('merge-execute-error')).toHaveTextContent(
      COPY.executeFailure.notExecutable,
    );
  });

  it('maps an invalidated participant or a contact collision to one bounded refusal', async () => {
    executeMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'CONFLICT',
        message: 'A contact of the merged-away Customer cannot be moved.',
      }),
    );
    const user = createUser();
    render();
    await loadedCase();

    await user.click(screen.getByTestId('merge-execute-open'));
    await user.click(screen.getByTestId('merge-execute-confirm'));

    const error = await screen.findByTestId('merge-execute-error');
    expect(error).toHaveTextContent(COPY.executeFailure.participantOrContact);
    expect(document.body.textContent).not.toContain('cannot be moved');
    // Nothing offers to deduplicate, retry blindly or force.
    expect(screen.queryByTestId('merge-force-execute')).not.toBeInTheDocument();
    expect(screen.queryByTestId('merge-auto-deduplicate')).not.toBeInTheDocument();
  });

  it('maps a vanished case to the stale refusal', async () => {
    executeMock.mockRejectedValue(makeApiClientError({ status: 404, code: 'NOT_FOUND' }));
    const user = createUser();
    render();
    await loadedCase();

    await user.click(screen.getByTestId('merge-execute-open'));
    await user.click(screen.getByTestId('merge-execute-confirm'));

    expect(await screen.findByTestId('merge-execute-error')).toHaveTextContent(
      COPY.executeFailure.stale,
    );
  });

  it('dumps no raw server object into the failure UI', async () => {
    executeMock.mockRejectedValue(
      makeApiClientError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'duplicate key value violates unique constraint',
      }),
    );
    const user = createUser();
    render();
    await loadedCase();

    await user.click(screen.getByTestId('merge-execute-open'));
    await user.click(screen.getByTestId('merge-execute-confirm'));
    await screen.findByTestId('merge-execute-error');

    const rendered = document.body.textContent ?? '';
    expect(rendered).toContain(COPY.executeFailure.generic);
    expect(rendered).not.toContain('duplicate key value');
    expect(rendered).not.toContain('requestId');
    expect(rendered).not.toContain('INTERNAL_ERROR');
  });

  it('disables the confirmation while the merge is in flight', async () => {
    let release: (() => void) | undefined;
    executeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(
              envelope({ mergeCaseId: MERGE_CASE_ID, outcome: 'EXECUTED', status: 'EXECUTED' }),
            );
          };
        }),
    );
    const user = createUser();
    render();
    await loadedCase();

    await user.click(screen.getByTestId('merge-execute-open'));
    await user.click(screen.getByTestId('merge-execute-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('merge-execute-confirm')).toBeDisabled();
    });
    expect(screen.getByTestId('merge-execute-cancel')).toBeDisabled();

    release?.();
    await waitFor(() => {
      expect(executeMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe('rejecting a merge case', () => {
  it('requires a reason before anything is sent', async () => {
    const user = createUser();
    render();
    await loadedCase();

    await user.click(screen.getByTestId('merge-reject-open'));
    await user.click(screen.getByTestId('merge-reject-confirm'));

    expect(await screen.findByTestId('merge-reject-problem')).toHaveTextContent(
      COPY.reject.reasonBlank,
    );
    expect(rejectMock).not.toHaveBeenCalled();
  });

  it('sends the trimmed reason by case id, then re-reads the case', async () => {
    const user = createUser();
    render();
    await loadedCase();
    const readsBefore = detailMock.mock.calls.length;

    await user.click(screen.getByTestId('merge-reject-open'));
    await user.type(screen.getByTestId('merge-reject-reason'), '  Không phải cùng người.  ');
    detailMock.mockResolvedValue(
      envelope(makeMergeCase({ status: 'REJECTED', decidedAt: '2026-08-29T03:00:00.000Z' })),
    );
    await user.click(screen.getByTestId('merge-reject-confirm'));

    await waitFor(() => {
      expect(rejectMock).toHaveBeenCalledTimes(1);
    });
    expect(rejectMock.mock.calls[0]?.[0]).toBe(MERGE_CASE_ID);
    expect(rejectMock.mock.calls[0]?.[1]).toEqual({ reason: 'Không phải cùng người.' });

    await waitFor(() => {
      expect(detailMock.mock.calls.length).toBeGreaterThan(readsBefore);
    });
  });

  it('maps an already-decided case to its own conflict', async () => {
    rejectMock.mockRejectedValue(makeApiClientError({ status: 409, code: 'CONFLICT' }));
    const user = createUser();
    render();
    await loadedCase();

    await user.click(screen.getByTestId('merge-reject-open'));
    await user.type(screen.getByTestId('merge-reject-reason'), 'Không phải cùng người.');
    await user.click(screen.getByTestId('merge-reject-confirm'));

    expect(await screen.findByTestId('merge-reject-error')).toHaveTextContent(
      COPY.rejectFailure.alreadyDecided,
    );
  });

  it('maps a vanished case to the stale refusal', async () => {
    rejectMock.mockRejectedValue(makeApiClientError({ status: 404, code: 'NOT_FOUND' }));
    const user = createUser();
    render();
    await loadedCase();

    await user.click(screen.getByTestId('merge-reject-open'));
    await user.type(screen.getByTestId('merge-reject-reason'), 'Không phải cùng người.');
    await user.click(screen.getByTestId('merge-reject-confirm'));

    expect(await screen.findByTestId('merge-reject-error')).toHaveTextContent(
      COPY.rejectFailure.stale,
    );
  });
});
