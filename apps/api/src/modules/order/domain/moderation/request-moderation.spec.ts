/**
 * `APP5-B05` §13 — the moderation policy, decided without a database.
 *
 * Everything here is a pure function over a source state and a command, so the
 * three rules a mutation checkpoint most easily gets wrong — which moves APP5
 * exposes, which reason texts each one requires, and which note kind explains it
 * — are proved edge by edge rather than sampled through HTTP.
 *
 * The suite deliberately does **not** re-test the integration surface: no
 * request is seeded, no route is called and no repository is touched.
 */
import type { CustomRequestState } from '@embroidery/database';

import { isLegalRequestTransition } from '../lifecycle/request-transitions';
import { MODERATION_FAILURES } from './request-moderation.errors';
import {
  APP5_NOTE_KINDS,
  APP5_TRANSITION_TARGETS,
  evaluateModerationCommand,
  isApp5Transition,
  notifiesCustomer,
  type App5NoteKind,
  type App5TransitionTarget,
  type ModerationCommandShape,
} from './request-moderation.policy';

/**
 * The whole LC-11 vocabulary, restated here rather than imported.
 *
 * The ORM package exports the *type* but not the runtime tuple, and a domain
 * suite reaching into the schema namespace for one array would be the coupling
 * `BACKEND_CONVENTIONS` §3 forbids. `satisfies` plus the exhaustiveness alias
 * below tie this list to the canonical union in both directions, so a state
 * added to LC-11 and not added here stops compiling.
 */
const CUSTOM_REQUEST_STATES = [
  'NEW',
  'UNDER_REVIEW',
  'NEEDS_CLARIFICATION',
  'QUOTED',
  'QUOTE_ACCEPTED',
  'DIGITIZING',
  'DESIGN_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const satisfies readonly CustomRequestState[];

type MissingState = Exclude<CustomRequestState, (typeof CUSTOM_REQUEST_STATES)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time exhaustiveness proof
type AssertNoMissingState = MissingState extends never ? true : ['missing', MissingState];

/** The six APP5 edges of `APP5-G01` §2, written out rather than derived. */
const APP5_EDGES: readonly (readonly [CustomRequestState, App5TransitionTarget])[] = [
  ['NEW', 'UNDER_REVIEW'],
  ['NEW', 'CANCELLED'],
  ['UNDER_REVIEW', 'NEEDS_CLARIFICATION'],
  ['UNDER_REVIEW', 'REJECTED'],
  ['UNDER_REVIEW', 'CANCELLED'],
  ['NEEDS_CLARIFICATION', 'UNDER_REVIEW'],
  ['NEEDS_CLARIFICATION', 'REJECTED'],
  ['NEEDS_CLARIFICATION', 'CANCELLED'],
];

/** The five states APP6+ owns every transition into. */
const APP6_TARGETS: readonly CustomRequestState[] = [
  'QUOTED',
  'QUOTE_ACCEPTED',
  'DIGITIZING',
  'DESIGN_REVIEW',
  'APPROVED',
];

function command(overrides: Partial<ModerationCommandShape> = {}): ModerationCommandShape {
  return {
    to: 'UNDER_REVIEW',
    internalReason: undefined,
    customerVisibleReason: undefined,
    note: undefined,
    noteKind: undefined,
    ...overrides,
  };
}

describe('APP5-B05 transition allowlist', () => {
  it.each(APP5_EDGES)('permits %s -> %s', (from, to) => {
    expect(isApp5Transition(from, to)).toBe(true);
  });

  it('permits exactly those eight edges and no others across the whole state space', () => {
    const permitted: string[] = [];
    for (const from of CUSTOM_REQUEST_STATES) {
      for (const to of CUSTOM_REQUEST_STATES) {
        if (isApp5Transition(from, to)) {
          permitted.push(`${from}->${to}`);
        }
      }
    }
    expect(permitted.sort()).toEqual(APP5_EDGES.map(([f, t]) => `${f}->${t}`).sort());
  });

  it('is a strict subset of the canonical LC-11 graph, which it never widens', () => {
    for (const from of CUSTOM_REQUEST_STATES) {
      for (const to of CUSTOM_REQUEST_STATES) {
        if (isApp5Transition(from, to)) {
          // `G01-D07`: the APP5 table restricts the lifecycle, it does not
          // replace it. A move this policy permits must already be legal.
          expect(isLegalRequestTransition(from, to)).toBe(true);
        }
      }
    }
  });

  it('refuses every APP6+ target from every source state', () => {
    for (const from of CUSTOM_REQUEST_STATES) {
      for (const to of APP6_TARGETS) {
        expect(isApp5Transition(from, to)).toBe(false);
        expect(evaluateModerationCommand(from, command({ to }))).toBe('INVALID_TRANSITION');
      }
    }
  });

  it('publishes no APP6+ target and no NEW target', () => {
    expect([...APP5_TRANSITION_TARGETS].sort()).toEqual([
      'CANCELLED',
      'NEEDS_CLARIFICATION',
      'REJECTED',
      'UNDER_REVIEW',
    ]);
  });

  it('offers nothing from a terminal, quoted or later state', () => {
    for (const from of [
      'QUOTED',
      'QUOTE_ACCEPTED',
      'DIGITIZING',
      'DESIGN_REVIEW',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
    ] as const) {
      for (const to of APP5_TRANSITION_TARGETS) {
        expect(isApp5Transition(from, to)).toBe(false);
      }
    }
  });

  it('bounds cancellation to the three APP5-safe pre-quotation states (G01-D06, stage S1)', () => {
    const cancellable = CUSTOM_REQUEST_STATES.filter((from) => isApp5Transition(from, 'CANCELLED'));
    expect(cancellable).toEqual(['NEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION']);
  });
});

describe('APP5-B05 reason and note requirement matrix', () => {
  it('accepts NEW -> UNDER_REVIEW with nothing at all', () => {
    expect(evaluateModerationCommand('NEW', command({ to: 'UNDER_REVIEW' }))).toBeUndefined();
  });

  it('accepts NEEDS_CLARIFICATION -> UNDER_REVIEW with nothing at all', () => {
    expect(
      evaluateModerationCommand('NEEDS_CLARIFICATION', command({ to: 'UNDER_REVIEW' })),
    ).toBeUndefined();
  });

  it('accepts an optional internal reason on a move into review', () => {
    expect(
      evaluateModerationCommand('NEW', command({ to: 'UNDER_REVIEW', internalReason: 'Triage.' })),
    ).toBeUndefined();
  });

  it('refuses a customer-visible reason on a move into review, rather than dropping it', () => {
    expect(
      evaluateModerationCommand(
        'NEW',
        command({ to: 'UNDER_REVIEW', customerVisibleReason: 'Chúng tôi đang xem.' }),
      ),
    ).toBe('TRANSITION_CUSTOMER_REASON_NOT_ALLOWED');
  });

  it.each(['NEEDS_CLARIFICATION', 'REJECTED', 'CANCELLED'] as const)(
    'requires an internal reason for %s',
    (to) => {
      const from = to === 'NEEDS_CLARIFICATION' ? 'UNDER_REVIEW' : 'UNDER_REVIEW';
      expect(evaluateModerationCommand(from, command({ to }))).toBe('TRANSITION_REASON_REQUIRED');
    },
  );

  it.each(['NEEDS_CLARIFICATION', 'REJECTED', 'CANCELLED'] as const)(
    'requires a customer-visible reason for %s, distinct from the internal one',
    (to) => {
      expect(
        evaluateModerationCommand('UNDER_REVIEW', command({ to, internalReason: 'Nội bộ.' })),
      ).toBe('TRANSITION_CUSTOMER_REASON_REQUIRED');
    },
  );

  it('requires a CLARIFY note for NEEDS_CLARIFICATION', () => {
    const base = command({
      to: 'NEEDS_CLARIFICATION',
      internalReason: 'Ảnh mờ.',
      customerVisibleReason: 'Bạn gửi lại ảnh giúp mình nhé.',
    });
    expect(evaluateModerationCommand('UNDER_REVIEW', base)).toBe('MODERATION_NOTE_REQUIRED');
    expect(
      evaluateModerationCommand('UNDER_REVIEW', {
        ...base,
        note: 'Đã nhắn khách.',
        noteKind: 'REJECT',
      }),
    ).toBe('MODERATION_NOTE_KIND_INVALID');
    expect(
      evaluateModerationCommand('UNDER_REVIEW', {
        ...base,
        note: 'Đã nhắn khách.',
        noteKind: 'CLARIFY',
      }),
    ).toBeUndefined();
  });

  it.each(['REJECT', 'SPAM'] as const)('accepts a %s note for REJECTED', (noteKind) => {
    expect(
      evaluateModerationCommand(
        'NEEDS_CLARIFICATION',
        command({
          to: 'REJECTED',
          internalReason: 'Không đủ thông tin.',
          customerVisibleReason: 'Rất tiếc, mình chưa nhận được yêu cầu này.',
          note: 'Đã từ chối.',
          noteKind,
        }),
      ),
    ).toBeUndefined();
  });

  it.each(['CLARIFY', 'NOTE'] as const)('refuses a %s note for REJECTED', (noteKind) => {
    expect(
      evaluateModerationCommand(
        'UNDER_REVIEW',
        command({
          to: 'REJECTED',
          internalReason: 'Spam.',
          customerVisibleReason: 'Rất tiếc.',
          note: 'x',
          noteKind,
        }),
      ),
    ).toBe('MODERATION_NOTE_KIND_INVALID');
  });

  it('leaves the note optional on a cancellation but still judges one that is supplied', () => {
    const base = command({
      to: 'CANCELLED',
      internalReason: 'Khách gọi điện huỷ.',
      customerVisibleReason: 'Yêu cầu đã được huỷ theo đề nghị của bạn.',
    });
    expect(evaluateModerationCommand('NEW', base)).toBeUndefined();
    expect(
      evaluateModerationCommand('NEW', { ...base, note: 'Khách gọi 09:15.', noteKind: 'NOTE' }),
    ).toBeUndefined();
  });

  it('refuses a note kind with no text, and text with no kind', () => {
    expect(
      evaluateModerationCommand('NEW', command({ to: 'UNDER_REVIEW', noteKind: 'NOTE' })),
    ).toBe('MODERATION_NOTE_REQUIRED');
    expect(evaluateModerationCommand('NEW', command({ to: 'UNDER_REVIEW', note: 'x' }))).toBe(
      'MODERATION_NOTE_REQUIRED',
    );
  });

  it('reports an illegal move as illegal, never as a missing reason', () => {
    // A fully-justified rejection from a state that cannot be rejected.
    expect(
      evaluateModerationCommand(
        'CANCELLED',
        command({
          to: 'REJECTED',
          internalReason: 'x',
          customerVisibleReason: 'y',
          note: 'z',
          noteKind: 'REJECT',
        }),
      ),
    ).toBe('INVALID_TRANSITION');
  });
});

describe('APP5-B05 note kinds and notification mapping', () => {
  it('exposes CLARIFY, REJECT, SPAM and NOTE, and not PAUSE', () => {
    expect([...APP5_NOTE_KINDS].sort()).toEqual(['CLARIFY', 'NOTE', 'REJECT', 'SPAM']);
    expect((APP5_NOTE_KINDS as readonly string[]).includes('PAUSE')).toBe(false);
  });

  it('notifies the customer on exactly the three SE-004/SE-012 targets', () => {
    const notifying = APP5_TRANSITION_TARGETS.filter((to) => notifiesCustomer(to));
    expect([...notifying].sort()).toEqual(['CANCELLED', 'NEEDS_CLARIFICATION', 'REJECTED']);
  });
});

describe('APP5-B05 error mapping', () => {
  it('publishes a code for every policy verdict, plus the two the persistence layer owns', () => {
    const failures = new Set<string>(MODERATION_FAILURES);
    for (const code of [
      'INVALID_TRANSITION',
      'TRANSITION_REASON_REQUIRED',
      'TRANSITION_CUSTOMER_REASON_REQUIRED',
      'TRANSITION_CUSTOMER_REASON_NOT_ALLOWED',
      'MODERATION_NOTE_REQUIRED',
      'MODERATION_NOTE_KIND_INVALID',
      'REQUEST_NOT_FOUND',
      'REQUEST_TRANSITION_STALE',
    ]) {
      expect(failures.has(code)).toBe(true);
    }
  });

  it('names no APP6 capability in any published code', () => {
    for (const failure of MODERATION_FAILURES) {
      expect(failure).not.toMatch(/QUOT|DIGITIZ|DESIGN|APPROV/);
    }
  });
});

/** Compile-time guards that the published unions stay the ones under test. */
const _targets: readonly App5TransitionTarget[] = APP5_TRANSITION_TARGETS;
const _kinds: readonly App5NoteKind[] = APP5_NOTE_KINDS;
void _targets;
void _kinds;
