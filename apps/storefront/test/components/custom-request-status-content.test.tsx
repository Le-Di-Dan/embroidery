/**
 * `/truy-cap` — the request itself (`APP5-S02` §20).
 *
 * What this suite is really testing is a set of *absences*: internal moderation
 * data, identifiers, a request list, and any control at all. Each is asserted
 * against the rendered text rather than against a component's props, because
 * the failure it guards is "somebody added a field to a card", not "somebody
 * changed a type".
 */
import { publicCustomRequestStatus } from '@embroidery/api-client';
import { createTestQueryClient } from '@embroidery/frontend-testing';
import { renderWithProviders, screen } from '@embroidery/frontend-testing';

import { CustomRequestStatusScreen } from '../../src/features/custom-request-status/ui/custom-request-status-screen';
import { CUSTOM_REQUEST_STATUS_COPY as COPY } from '../../src/features/custom-request-status/model/custom-request-status-copy';
import {
  TEST_ASSET_IDS,
  TEST_PRODUCT_ID,
  TEST_PRODUCT_SLUG,
  TEST_PRODUCT_VARIANT_ID,
  TEST_REQUEST_CODE,
  TEST_REQUEST_ID,
  catalogSubject,
  customerOwnedSubject,
  makeStatusResponse,
  withReason,
} from '../support/custom-request-status-fixture';
import { TEST_TOKEN, envelopeOf, navigateToLanding } from '../support/secure-link-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicCustomRequestStatus: jest.fn(),
}));

const statusMock = publicCustomRequestStatus as jest.MockedFunction<
  typeof publicCustomRequestStatus
>;

const HEADING = COPY.heading.wide.replace('{code}', TEST_REQUEST_CODE);

beforeEach(() => {
  jest.clearAllMocks();
  navigateToLanding(`#t=${TEST_TOKEN}`);
});

async function renderStatus(response = makeStatusResponse()) {
  // Re-seeded per render: the bootstrap strips the fragment, so a second mount
  // in the same test would otherwise arrive with no credential and fall into
  // the unavailable state — which is the correct behaviour and the wrong setup.
  navigateToLanding(`#t=${TEST_TOKEN}`);
  statusMock.mockResolvedValue(envelopeOf(response));
  const view = renderWithProviders(<CustomRequestStatusScreen />, {
    queryClient: createTestQueryClient(),
  });
  await screen.findByText(HEADING);
  return view;
}

describe('APP5-S02 — the five APP5 states', () => {
  it('renders NEW', async () => {
    await renderStatus(makeStatusResponse({ status: 'NEW' }));

    expect(screen.getByText(COPY.states.new.description)).toBeInTheDocument();
    expect(screen.getAllByText(COPY.states.new.badge).length).toBeGreaterThan(0);
    // Every step, not only the first. The list is read from the message
    // repository (`APP12-V02` §5A), so its length is data rather than a literal
    // the test can index into — and asserting all of them is the stronger claim
    // the indexed version was approximating.
    for (const step of COPY.states.new.nextSteps) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    // No reason card: nothing has been decided, so nothing has been written.
    expect(screen.queryByText(COPY.reason.note)).toBeNull();
  });

  it('renders UNDER_REVIEW', async () => {
    await renderStatus(makeStatusResponse({ status: 'UNDER_REVIEW' }));

    expect(screen.getByText(COPY.states.underReview.description)).toBeInTheDocument();
    expect(screen.queryByText(COPY.reason.note)).toBeNull();
  });

  it.each([
    ['NEEDS_CLARIFICATION', COPY.reason.titles.needsClarification, 'Ảnh mặt lưng áo hơi tối.'],
    ['REJECTED', COPY.reason.titles.rejected, 'Chất liệu này xưởng không thêu được.'],
    ['CANCELLED', COPY.reason.titles.cancelled, 'Yêu cầu bị trùng với một yêu cầu khác.'],
  ] as const)('renders %s with the customer-visible reason', async (status, title, reason) => {
    await renderStatus(withReason(status, reason));

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByText(COPY.reason.note)).toBeInTheDocument();
  });

  it('says so plainly when a decided state carries no customer message', async () => {
    await renderStatus(withReason('REJECTED', null));

    expect(screen.getByText(COPY.reason.absent)).toBeInTheDocument();
  });
});

describe('APP5-S02 — reason privacy', () => {
  /**
   * The strongest form this can take in a component test: the response is the
   * *only* source, and the response has no internal field to plant. So the
   * proof is that a moderator's internal wording — supplied as the customer
   * message's neighbour would be, had one existed — cannot appear, together
   * with the absence of every moderation artefact the Admin screens do show.
   */
  it('renders the customer message and no moderation artefact', async () => {
    const customerMessage = 'Xưởng cần một ảnh chụp ban ngày.';
    const { container } = await renderStatus(withReason('NEEDS_CLARIFICATION', customerMessage));

    expect(screen.getByText(customerMessage)).toBeInTheDocument();
    // No internal reason, note, actor, transition history or audit metadata:
    // B03 returns none, and nothing on this page could display one.
    expect(container.textContent).not.toMatch(
      /internal|nội bộ(?! của xưởng không hiển thị)|moderat|chuyển trạng thái|nhân viên|audit/i,
    );
  });

  it('puts no identifier from the response on screen', async () => {
    const { container } = await renderStatus(makeStatusResponse({ subject: catalogSubject() }));

    for (const identifier of [
      TEST_REQUEST_ID,
      TEST_ASSET_IDS[0],
      TEST_ASSET_IDS[1],
      TEST_PRODUCT_ID,
      TEST_PRODUCT_VARIANT_ID,
      TEST_PRODUCT_SLUG,
    ]) {
      expect(container.textContent).not.toContain(identifier);
    }
    // The one identifier that is shown is the human code, which opens nothing.
    expect(container.textContent).toContain(TEST_REQUEST_CODE);
  });
});

describe('APP5-S02 — forward-compatible statuses', () => {
  it.each(['QUOTED', 'QUOTE_ACCEPTED', 'DIGITIZING', 'DESIGN_REVIEW', 'APPROVED'] as const)(
    'renders %s neutrally, with no APP6 action or promise',
    async (status) => {
      const { container } = await renderStatus(makeStatusResponse({ status }));

      expect(screen.getByText(COPY.states.beyondIntake.description)).toBeInTheDocument();
      // Not mapped onto an APP5 state it is not in.
      expect(container.textContent).not.toContain(COPY.states.new.description);
      expect(container.textContent).not.toContain(COPY.states.underReview.description);
      // No price, approval, payment or order is claimed or offered.
      expect(container.textContent).not.toMatch(
        /báo giá của bạn|giá tiền:|thanh toán ngay|duyệt mẫu|đặt cọc|đơn hàng #/i,
      );
      expect(container.querySelectorAll('button')).toHaveLength(0);
      expect(container.querySelectorAll('form')).toHaveLength(0);
    },
  );
});

describe('APP5-S02 — the submitted subject', () => {
  it('renders a customer-owned subject with its safe fields', async () => {
    await renderStatus(
      makeStatusResponse({
        subject: customerOwnedSubject({ description: 'Thêu tên ở túi ngực' }),
      }),
    );

    expect(screen.getByText(COPY.subject.rows.customerOwned)).toBeInTheDocument();
    expect(screen.getByText('Áo khoác denim của tôi')).toBeInTheDocument();
    expect(screen.getByText('Thêu tên ở túi ngực')).toBeInTheDocument();
    expect(screen.getByText('120 × 80 mm')).toBeInTheDocument();
  });

  it('renders a catalog subject with its safe fields', async () => {
    await renderStatus(makeStatusResponse({ subject: catalogSubject() }));

    expect(screen.getByText(COPY.subject.rows.catalog)).toBeInTheDocument();
    expect(screen.getByText('Áo thun cotton')).toBeInTheDocument();
    expect(screen.getByText('Xanh rêu')).toBeInTheDocument();
  });

  /**
   * A catalog pair the server could no longer resolve. The request stays
   * readable — an unpublished product must not take the customer's own record
   * away with it — and the page names no product rather than the wrong one.
   */
  it('reports an unresolvable catalog product as missing, not as an error', async () => {
    await renderStatus(
      makeStatusResponse({
        subject: catalogSubject({ productName: null, variantColorName: null }),
      }),
    );

    expect(screen.getAllByText(COPY.subject.missingValue).length).toBeGreaterThan(0);
    expect(screen.getByText(COPY.subject.frozen)).toBeInTheDocument();
  });

  it('renders quantity truthfully, line by line', async () => {
    await renderStatus(
      makeStatusResponse({
        quantities: [
          { quantity: 2, sizeLabel: 'M' as never },
          { quantity: 3, sizeLabel: 'L' as never },
          { quantity: 1, sizeLabel: null as never },
        ],
        totalQuantity: 6,
      }),
    );

    expect(screen.getByText('M × 2')).toBeInTheDocument();
    expect(screen.getByText('L × 3')).toBeInTheDocument();
    expect(screen.getByText('× 1')).toBeInTheDocument();
  });

  it('renders attachments as role labels only, with no delivery surface', async () => {
    const { container } = await renderStatus(
      makeStatusResponse({
        assets: [
          { assetId: 'a-1', role: 'COP_IMAGE' },
          { assetId: 'a-2', role: 'COP_IMAGE' },
          { assetId: 'a-3', role: 'REFERENCE' },
        ],
      }),
    );

    expect(screen.getAllByText(COPY.subject.assetRoles.copImage)).toHaveLength(2);
    expect(screen.getAllByText(COPY.subject.assetRoles.reference)).toHaveLength(1);
    expect(screen.getByText(COPY.subject.assetsNote)).toBeInTheDocument();
    // No image, no link, no key, no scanner state.
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/https?:|bucket|s3|object key|CLEAN|INFECTED/i);
  });

  it('stays readable when the subject is absent entirely', async () => {
    await renderStatus(makeStatusResponse({ subject: null }));

    expect(screen.getByText(COPY.subject.frozen)).toBeInTheDocument();
    expect(screen.getByText(COPY.states.new.description)).toBeInTheDocument();
  });
});

describe('APP5-S02 — no customer mutation and no list', () => {
  it('offers no control of any kind in any APP5 state', async () => {
    for (const status of [
      'NEW',
      'UNDER_REVIEW',
      'NEEDS_CLARIFICATION',
      'REJECTED',
      'CANCELLED',
    ] as const) {
      const view = await renderStatus(withReason(status, 'Nội dung xưởng gửi bạn.'));
      expect(view.container.querySelectorAll('button')).toHaveLength(0);
      expect(view.container.querySelectorAll('form')).toHaveLength(0);
      expect(view.container.querySelectorAll('input')).toHaveLength(0);
      expect(view.container.textContent).toContain(COPY.readOnly.points[0]);
      view.unmount();
    }
  });

  it('renders exactly one request and nothing resembling a list or an account', async () => {
    const { container } = await renderStatus();

    // One heading, and the code appears only inside it. It appears twice in the
    // DOM because the approved desktop and mobile wordings differ and CSS picks
    // one — two candidate strings in a single heading, never two headings.
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    const heading = container.querySelector('h1');
    expect(container.textContent?.match(/REQ-/g)).toHaveLength(2);
    expect(heading?.textContent?.match(/REQ-/g)).toHaveLength(2);
    expect(container.textContent).not.toMatch(
      /danh sách yêu cầu|tài khoản|đăng nhập|đăng xuất|hồ sơ của tôi/i,
    );
  });
});
