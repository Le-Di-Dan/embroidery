/**
 * The `APP12-S02` checkout screen, rendered.
 *
 * The generated operations are mocked at the `@embroidery/api-client` boundary —
 * the same seam every other Storefront component suite uses — so the real
 * feature code runs end to end: the real `APP4` verification flow, the real
 * verified-contact binding, the real submission hook and the real refusal
 * mapping. Nothing about the *rules* is stubbed; only the network is.
 *
 * What this file is for is the set of behaviours that are invisible in a pure
 * function and would otherwise only be provable in a browser:
 *
 *   §16  a changed contact invalidates a verification that already succeeded
 *   §21  repeated presses produce one logical create
 *   §24  the confirmation states what the response returned, and nothing more
 *   §27  a refusal renders approved copy, never the server's own message
 *   §31  no payment, QR or total appears anywhere on the route
 */
import {
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { renderToString } from 'react-dom/server';

import {
  publicReadyMadeOrderCreate,
  publicVerificationIssue,
  publicVerificationSubmitAttempt,
} from '@embroidery/api-client';

import { CheckoutQueryProvider } from '../../src/features/ready-made-checkout';
import { READY_MADE_CHECKOUT_COPY } from '../../src/features/ready-made-checkout';
import {
  AMBIGUOUS_SKU_IDS,
  makeCheckoutView,
  makeCreatedOrder,
} from '../support/ready-made-checkout-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicReadyMadeOrderCreate: jest.fn(),
  publicVerificationIssue: jest.fn(),
  publicVerificationSubmitAttempt: jest.fn(),
}));

const createMock = publicReadyMadeOrderCreate as jest.MockedFunction<
  typeof publicReadyMadeOrderCreate
>;
const issueMock = publicVerificationIssue as jest.MockedFunction<typeof publicVerificationIssue>;
const attemptMock = publicVerificationSubmitAttempt as jest.MockedFunction<
  typeof publicVerificationSubmitAttempt
>;

const CHALLENGE_ID = '44444444-4444-4444-8444-444444444444';
const { contact, delivery, summary, validation, success } = READY_MADE_CHECKOUT_COPY;

function envelope<T>(data: T) {
  return {
    success: true,
    code: 'OK',
    message: 'OK',
    data,
    meta: { requestId: 'test-request', timestamp: '2026-09-02T00:00:00.000Z' },
  } as never;
}

/** The `APP4` challenge shape, with a resend already available so no timer runs. */
function challenge(challengeId = CHALLENGE_ID) {
  return envelope({
    challengeId,
    expiresAt: '2100-01-01T00:00:00.000Z',
    resendAvailableAt: '2000-01-01T00:00:00.000Z',
    recipientMasked: 'b***@vidu.com',
  });
}

beforeEach(() => {
  createMock.mockReset();
  issueMock.mockReset();
  attemptMock.mockReset();
  issueMock.mockResolvedValue(challenge());
  attemptMock.mockResolvedValue(envelope({ verified: true }));
});

/** Drive the real `APP4` flow to a verified contact, as a customer would. */
async function verifyContact(user: ReturnType<typeof createUser>, value = 'khach@vidu.com') {
  await user.type(screen.getByRole('textbox', { name: 'Email' }), value);
  await user.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
  await screen.findByLabelText('Mã xác minh (6 chữ số)');
  await user.type(screen.getByLabelText('Mã xác minh (6 chữ số)'), '123456');
  await user.click(screen.getByRole('button', { name: 'Xác minh' }));
  await screen.findByText(contact.verified);
}

async function fillDelivery(user: ReturnType<typeof createUser>) {
  await user.type(screen.getByLabelText(delivery.recipientNameLabel), 'Nguyễn Minh Anh');
  await user.type(screen.getByLabelText(delivery.recipientPhoneLabel), '0901234567');
  await user.type(screen.getByLabelText(delivery.addressLineLabel), '12 Nguyễn Huệ, Quận 1');
  await user.type(screen.getByLabelText(delivery.provinceLabel), 'TP. Hồ Chí Minh');
}

/*
 * `APP12-H08` §7. The four delivery fields are contract-required and
 * `validateDelivery` refuses an empty one, but nothing in the markup said so:
 * they announced as ordinary text inputs, and a screen-reader customer learned
 * they were mandatory only by submitting and being refused.
 *
 * Asserted through the accessible property rather than the attribute that
 * produces it, so the suite would still pass if the field ever moved to a native
 * `required` — which it deliberately has not, because the native bubble would
 * pre-empt the approved field-bound message.
 */
describe('the delivery fields state what they require', () => {
  it('marks all four required, without a placeholder standing in for a label', () => {
    renderWithProviders(<CheckoutQueryProvider view={makeCheckoutView()} />);

    for (const label of [
      delivery.recipientNameLabel,
      delivery.recipientPhoneLabel,
      delivery.addressLineLabel,
      delivery.provinceLabel,
    ]) {
      const field = screen.getByLabelText(label);
      expect(field).toBeRequired();
      // The label is a real one, so the accessible name survives a browser that
      // does not expose placeholders.
      expect(field).toHaveAccessibleName(label);
      // And the native attribute stays off: the browser must not raise its own
      // validation bubble over the approved message.
      expect(field).not.toHaveAttribute('required');
    }
  });
});

describe('the checkout summary', () => {
  it('states the merchandise subtotal, and never a shipping fee or a total', () => {
    renderWithProviders(<CheckoutQueryProvider view={makeCheckoutView({ quantityHint: '2' })} />);

    // 399.000 × 2, computed exactly and labelled as merchandise.
    expect(screen.getByText('798.000 VND')).toBeInTheDocument();
    expect(screen.getByText(summary.shippingPending)).toBeInTheDocument();
    expect(screen.getByText(summary.totalPending)).toBeInTheDocument();

    // No zero fee and no fabricated payable total (`BR-027`). Asserted against
    // the two rows themselves rather than against the page text: a substring
    // search for "0 VND" matches the tail of every amount that ends in a zero.
    const rows = document.querySelectorAll('.ready-made-checkout__row');
    const values = [...rows].map((row) => row.querySelector('dd')?.textContent);
    expect(values).toEqual(['798.000 VND', summary.shippingPending, summary.totalPending]);
  });

  it('offers no payment, QR, evidence or bank surface (§31)', () => {
    renderWithProviders(<CheckoutQueryProvider view={makeCheckoutView()} />);

    expect(document.body.textContent).not.toMatch(/QR|chuyển khoản|thanh toán ngay|ngân hàng/i);
    expect(screen.queryByRole('img', { name: /QR/i })).not.toBeInTheDocument();
    // No Wave-2 path is reopened either (§50).
    expect(document.querySelectorAll('a[href*="/thiet-ke"]')).toHaveLength(0);
    expect(document.querySelectorAll('a[href^="/yeu-cau"]')).toHaveLength(0);
  });
});

describe('the selection is the server’s, and it fails closed', () => {
  it.each([
    ['a missing hint', undefined],
    ['a SKU belonging to something else', '99999999-9999-4999-8999-999999999999'],
    ['a SKU published here but sold out', 'sku-trang-l'],
    ['the first SKU of an ambiguous variant', AMBIGUOUS_SKU_IDS[0]],
    ['the second SKU of an ambiguous variant', AMBIGUOUS_SKU_IDS[1]],
  ])('refuses %s, offers no form and names no id', (_label, skuHint) => {
    renderWithProviders(
      <CheckoutQueryProvider
        view={makeCheckoutView(skuHint === undefined ? { skuHint: '' } : { skuHint })}
      />,
    );

    expect(screen.getByText(READY_MADE_CHECKOUT_COPY.invalidSelection.title)).toBeInTheDocument();
    // Nothing to submit, and the drawn way back is offered.
    expect(screen.queryByRole('button', { name: summary.submit })).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: READY_MADE_CHECKOUT_COPY.refusal.back }),
    ).toHaveAttribute('href', '/san-pham/ao-thun-theu-tay');
    // No SKU id is rendered as customer copy, whichever one the URL named.
    expect(document.body.textContent).not.toMatch(/sku-|[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});

describe('verification', () => {
  it('refuses to submit without a verified contact, and issues no request', async () => {
    const user = createUser();
    renderWithProviders(<CheckoutQueryProvider view={makeCheckoutView()} />);

    await fillDelivery(user);
    await user.click(screen.getByRole('button', { name: summary.submit }));

    expect(await screen.findByText(validation.contactUnverified)).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('invalidates a completed verification when the contact is edited (§16)', async () => {
    const user = createUser();
    renderWithProviders(<CheckoutQueryProvider view={makeCheckoutView()} />);

    await verifyContact(user, 'a@vidu.com');
    await user.click(screen.getByRole('button', { name: contact.change }));

    // Back at contact entry with the previous value kept, as `APP4` restarts.
    const field = await screen.findByRole('textbox', { name: 'Email' });
    await user.clear(field);
    await user.type(field, 'b@vidu.com');

    // The verified affordance is gone, and a submit is refused rather than
    // posting the challenge earned for the first address.
    expect(screen.queryByText(contact.verified)).not.toBeInTheDocument();
    await fillDelivery(user);
    await user.click(screen.getByRole('button', { name: summary.submit }));
    expect(await screen.findByText(validation.contactUnverified)).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('creating the order', () => {
  it('posts the SKU, the quantity, the challenge and the delivery facts — and no amount', async () => {
    const user = createUser();
    createMock.mockResolvedValue(envelope(makeCreatedOrder()));
    renderWithProviders(<CheckoutQueryProvider view={makeCheckoutView({ quantityHint: '2' })} />);

    await verifyContact(user);
    await fillDelivery(user);
    await user.click(screen.getByRole('button', { name: summary.submit }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1);
    });
    const [body] = createMock.mock.calls[0] ?? [];
    expect(body).toEqual({
      challengeId: CHALLENGE_ID,
      skuId: 'sku-trang-m',
      quantity: 2,
      delivery: {
        recipientName: 'Nguyễn Minh Anh',
        recipientPhone: '0901234567',
        addressLine: '12 Nguyễn Huệ, Quận 1',
        province: 'TP. Hồ Chí Minh',
      },
    });
    // The one thing that must never travel: an amount the browser observed.
    expect(JSON.stringify(body)).not.toContain('399000');
    expect(JSON.stringify(body)).not.toContain('798000');
  });

  it('creates one order however many times the customer presses (§21)', async () => {
    const user = createUser();
    let release: (() => void) | undefined;
    createMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(envelope(makeCreatedOrder()));
          };
        }) as never,
    );
    renderWithProviders(<CheckoutQueryProvider view={makeCheckoutView()} />);

    await verifyContact(user);
    await fillDelivery(user);

    const submit = screen.getByRole('button', { name: summary.submit });
    await user.click(submit);
    // The pending button, and three more attempts at it.
    const pending = await screen.findByRole('button', { name: summary.submitPending });
    await user.click(pending).catch(() => undefined);
    await user.click(pending).catch(() => undefined);
    await user.keyboard('{Enter}');

    expect(createMock).toHaveBeenCalledTimes(1);
    release?.();
    expect(await screen.findByText(success.title)).toBeInTheDocument();
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('renders the returned facts, and never a token or an internal id (§24)', async () => {
    const user = createUser();
    createMock.mockResolvedValue(envelope(makeCreatedOrder()));
    renderWithProviders(<CheckoutQueryProvider view={makeCheckoutView()} />);

    await verifyContact(user);
    await fillDelivery(user);
    await user.click(screen.getByRole('button', { name: summary.submit }));

    expect(await screen.findByText(success.title)).toBeInTheDocument();
    expect(screen.getByText('DH-2026-0042')).toBeInTheDocument();
    // The frozen subtotal the server wrote, not the one the summary computed.
    expect(screen.getByText('798.000 VND')).toBeInTheDocument();
    expect(screen.getByText(success.secureLinkTitle)).toBeInTheDocument();
    expect(screen.getByText(success.shippingPendingNotice)).toBeInTheDocument();

    // The form is gone, so a refresh-less resubmit is impossible.
    expect(screen.queryByRole('button', { name: summary.submit })).not.toBeInTheDocument();
    // No secure-order route is offered and no token is anywhere on the page.
    expect(document.querySelectorAll('a[href*="/truy-cap"]')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/token|ORDER_ACCESS|AWAITING_SHIPPING_FEE/i);
    // Nothing was persisted for a later screen to pick up (§19, §23).
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('withholds the delivery promise when the notification was not queued', async () => {
    const user = createUser();
    createMock.mockResolvedValue(
      envelope(
        makeCreatedOrder({
          access: {
            delivered: false,
            expiresAt: '2026-09-09T09:30:00.000Z',
            scopeKind: 'ORDER_ACCESS',
          },
        }),
      ),
    );
    renderWithProviders(<CheckoutQueryProvider view={makeCheckoutView()} />);

    await verifyContact(user);
    await fillDelivery(user);
    await user.click(screen.getByRole('button', { name: summary.submit }));

    expect(await screen.findByText(success.title)).toBeInTheDocument();
    expect(screen.queryByText(success.secureLinkTitle)).not.toBeInTheDocument();
    // The fallback advice still stands: the order exists either way.
    expect(screen.getByText(success.secureLinkFallback)).toBeInTheDocument();
  });
});

describe('refusals', () => {
  /**
   * One refused create, driven all the way through the real flow.
   *
   * The rejection is a **real error envelope** inside a real Axios-shaped error,
   * because that is what the normalizer this feature depends on actually parses:
   * a payload without `meta` fails `isApiResponseEnvelope` and would be reported
   * as a malformed response, so a looser fixture would prove the fallback rather
   * than the mapping.
   */
  async function refuseWith(code: string, message: string) {
    const user = createUser();
    createMock.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          success: false,
          code,
          message,
          meta: { requestId: 'test-request', timestamp: '2026-09-02T00:00:00.000Z' },
        },
      },
    });
    renderWithProviders(<CheckoutQueryProvider view={makeCheckoutView()} />);
    await verifyContact(user);
    await fillDelivery(user);
    await user.click(screen.getByRole('button', { name: summary.submit }));
    return user;
  }

  it('renders the approved stock refusal and the way back to the product', async () => {
    await refuseWith('INSUFFICIENT_STOCK', 'There is not enough stock for that quantity.');

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Sản phẩm vừa hết hàng/)).toBeInTheDocument();
    // The server's own English message never reaches the page.
    expect(document.body.textContent).not.toContain('There is not enough stock');
    expect(
      screen.getByRole('link', { name: READY_MADE_CHECKOUT_COPY.refusal.back }),
    ).toBeInTheDocument();
    // No success is claimed, and no auto-retry was issued.
    expect(screen.queryByText(success.title)).not.toBeInTheDocument();
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('does not resubmit by itself, and does not reduce the quantity to fit', async () => {
    const user = await refuseWith('INSUFFICIENT_STOCK', 'not enough');
    await screen.findByRole('alert');

    // The quantity the customer chose is still what the summary states.
    expect(screen.getByText(/SL 2/)).toBeInTheDocument();
    expect(createMock).toHaveBeenCalledTimes(1);

    // Only an explicit press tries again, and it is the same order.
    await user.click(screen.getByRole('button', { name: summary.submit }));
    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(2);
    });
    expect(createMock.mock.calls[1]?.[0]).toEqual(createMock.mock.calls[0]?.[0]);
  });

  it('tells an expired verification apart from a sold-out SKU', async () => {
    await refuseWith('VERIFIED_CONTACT_REQUIRED', 'That contact verification cannot be used.');

    expect(await screen.findByText(/Cần xác minh lại liên hệ/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/hết hàng/);
    // The way out is verifying again, not the product page.
    expect(
      screen.queryByRole('link', { name: READY_MADE_CHECKOUT_COPY.refusal.back }),
    ).not.toBeInTheDocument();
  });

  it('clears a refusal once the material inputs it described have changed (§20)', async () => {
    const user = await refuseWith('INSUFFICIENT_STOCK', 'not enough');
    await screen.findByRole('alert');

    await user.clear(screen.getByLabelText(delivery.addressLineLabel));
    await user.type(screen.getByLabelText(delivery.addressLineLabel), '9 Lê Lợi, Quận 3');

    await waitFor(() => {
      expect(screen.queryByText(/Sản phẩm vừa hết hàng/)).not.toBeInTheDocument();
    });
  });
});

/**
 * The correction `APP12-S02-C1` makes, asserted on the markup the **server**
 * actually sends rather than on the hydrated DOM.
 *
 * `renderToString` is the point of this block: every other test in this file
 * runs after React has taken over, which is exactly the state in which the
 * defect does not exist. The bytes on the wire are what a click before
 * hydration acts on, so they are what has to be safe.
 */
describe('the server-rendered checkout is not submittable before hydration', () => {
  /** The SSR HTML for a normal, resolvable checkout. */
  function serverHtml(): string {
    return renderToString(<CheckoutQueryProvider view={makeCheckoutView()} />);
  }

  it('emits the band as a disabled fieldset', () => {
    const html = serverHtml();
    // The guard is an attribute in the markup, not a handler that does not
    // exist yet — see `pre-hydration-guard.tsx`.
    expect(html).toMatch(/<fieldset[^>]*class="ready-made-checkout__columns"[^>]*disabled/);
    expect(html).toContain('data-interactive="false"');
  });

  it('leaves no submit-capable control outside the guard', () => {
    const parsed = new DOMParser().parseFromString(`<body>${serverHtml()}</body>`, 'text/html');
    const band = parsed.querySelector('fieldset.ready-made-checkout__columns');
    expect(band?.hasAttribute('disabled')).toBe(true);

    // React does **not** stamp `disabled` onto descendants, and it should not:
    // a disabled `<fieldset>` disables its descendant controls by the HTML
    // standard, in the browser, at no cost in markup. So the assertion that
    // matters here is containment — that nothing capable of submitting escapes
    // the guarded subtree. The behavioural half (a click and an Enter that
    // cannot navigate) is proved in a real browser by the `APP12-S02-C1`
    // Playwright case, because only a browser implements this rule.
    const controls = [...parsed.querySelectorAll('button, input, select, textarea')];
    expect(controls.length).toBeGreaterThan(0);
    const escaped = controls.filter((control) => band === null || !band.contains(control));
    expect(escaped.map((control) => control.outerHTML)).toEqual([]);
  });

  it('has no form that could carry customer data into a URL', () => {
    const parsed = new DOMParser().parseFromString(`<body>${serverHtml()}</body>`, 'text/html');

    // Neither form declares an action or a method, which is exactly why the
    // native default is a GET to the current URL — the behaviour the guard
    // prevents. Recorded here so the reason the guard exists stays visible.
    const forms = [...parsed.querySelectorAll('form')];
    expect(forms.length).toBeGreaterThan(0);
    for (const form of forms) {
      expect(form.getAttribute('action')).toBeNull();
      expect(form.getAttribute('method')).toBeNull();
    }

    // The blast radius of that default, stated exactly: the **only** named
    // control on the page is the contact-kind radio group, so a native GET
    // could only ever have written `…-kind=EMAIL` into the query. The contact
    // value, the verification code and all four delivery fields carry no
    // `name`, so none of them could reach a URL, a referrer or an access log
    // even if a submission happened. What the defect destroyed was the
    // customer's `?sku=&quantity=`, not their privacy.
    const named = [...parsed.querySelectorAll('input[name], textarea[name], select[name]')];
    expect(named.every((control) => control.getAttribute('type') === 'radio')).toBe(true);
    expect(named.every((control) => /-kind$/.test(control.getAttribute('name') ?? ''))).toBe(true);
  });

  it('becomes interactive once React takes the markup over', async () => {
    const user = createUser();
    renderWithProviders(<CheckoutQueryProvider view={makeCheckoutView()} />);

    // After hydration the same controls are usable, and the guard says so.
    const band = document.querySelector('.ready-made-checkout__columns');
    expect(band?.tagName).toBe('FIELDSET');
    expect(band?.hasAttribute('disabled')).toBe(false);
    expect(band?.getAttribute('data-interactive')).toBe('true');

    await user.type(screen.getByLabelText(delivery.recipientNameLabel), 'Nguyễn Minh Anh');
    expect(screen.getByLabelText(delivery.recipientNameLabel)).toHaveValue('Nguyễn Minh Anh');
    expect(screen.getByRole('button', { name: summary.submit })).toBeEnabled();
  });
});
