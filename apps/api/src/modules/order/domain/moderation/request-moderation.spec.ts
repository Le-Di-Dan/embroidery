/**
 * `APP5-B05` §13 and `APP6-B06` §6 — the transition policy, decided without a
 * database.
 *
 * Everything here is a pure function over a source state and a command, so the
 * three rules a mutation checkpoint most easily gets wrong — which moves are
 * exposed, which reason texts each one requires, and which note kind explains it
 * — are proved edge by edge rather than sampled through HTTP.
 *
 * `APP6-B06` extends this suite rather than adding a checker beside it. The
 * whole-state-space enumeration below is already the exhaustive proof that the
 * command surface widened by exactly one edge, so the widening is stated in
 * {@link B06_EDGES} and every existing assertion re-runs against it.
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

/** The eight APP5 edges of `APP5-G01` §2, written out rather than derived. */
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

/** Everything `APP6-B06` adds: `TR-LC11-07`, and nothing else. */
const B06_EDGES: readonly (readonly [CustomRequestState, App5TransitionTarget])[] = [
  ['QUOTE_ACCEPTED', 'DIGITIZING'],
];

const COMMANDABLE_EDGES = [...APP5_EDGES, ...B06_EDGES];

/**
 * The four APP6 states no operator may command (`APP6-G01` §4.1).
 *
 * `DIGITIZING` is deliberately absent — it is the one APP6 target `APP6-B06`
 * releases. The other four stay projections of the quotation or design
 * transaction that causes them.
 */
const SYSTEM_OWNED_APP6_TARGETS: readonly CustomRequestState[] = [
  'QUOTED',
  'QUOTE_ACCEPTED',
  'DESIGN_REVIEW',
  'APPROVED',
];

/** The states GRD-005 answers for: acceptance is still ahead of them. */
const PRE_ACCEPTANCE: readonly CustomRequestState[] = [
  'NEW',
  'UNDER_REVIEW',
  'NEEDS_CLARIFICATION',
  'QUOTED',
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

describe('APP5-B05 + APP6-B06 transition allowlist', () => {
  it.each(COMMANDABLE_EDGES)('permits %s -> %s', (from, to) => {
    expect(isApp5Transition(from, to)).toBe(true);
  });

  it('permits exactly those nine edges and no others across the whole state space', () => {
    const permitted: string[] = [];
    for (const from of CUSTOM_REQUEST_STATES) {
      for (const to of CUSTOM_REQUEST_STATES) {
        if (isApp5Transition(from, to)) {
          permitted.push(`${from}->${to}`);
        }
      }
    }
    expect(permitted.sort()).toEqual(COMMANDABLE_EDGES.map(([f, t]) => `${f}->${t}`).sort());
  });

  it('leaves all eight delivered APP5 edges exactly as APP5-B05 left them', () => {
    // The B06 widening is additive or it is a regression: every APP5 edge is
    // still permitted, and the delta against the whole space is exactly
    // `B06_EDGES` — computed here rather than asserted as a count.
    for (const [from, to] of APP5_EDGES) {
      expect(isApp5Transition(from, to)).toBe(true);
    }
    const app5 = new Set(APP5_EDGES.map(([f, t]) => `${f}->${t}`));
    const added: string[] = [];
    for (const from of CUSTOM_REQUEST_STATES) {
      for (const to of CUSTOM_REQUEST_STATES) {
        if (isApp5Transition(from, to) && !app5.has(`${from}->${to}`)) {
          added.push(`${from}->${to}`);
        }
      }
    }
    expect(added).toEqual(['QUOTE_ACCEPTED->DIGITIZING']);
  });

  it('adds no backward edge and no new cancellation stage', () => {
    // TR-LC11-07 moves the workflow forward. It must not have brought a way back
    // out of the state it moves from, nor widened the `G01-D06` stage-S1 bound.
    for (const [from] of B06_EDGES) {
      expect(isApp5Transition(from, 'UNDER_REVIEW')).toBe(false);
      expect(isApp5Transition(from, 'NEEDS_CLARIFICATION')).toBe(false);
      expect(isApp5Transition(from, 'REJECTED')).toBe(false);
      expect(isApp5Transition(from, 'CANCELLED')).toBe(false);
    }
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

  it('refuses the four system-owned APP6 targets from every source state', () => {
    for (const from of CUSTOM_REQUEST_STATES) {
      for (const to of SYSTEM_OWNED_APP6_TARGETS) {
        expect(isApp5Transition(from, to)).toBe(false);
        expect(evaluateModerationCommand(from, command({ to }))).toBe('INVALID_TRANSITION');
      }
    }
  });

  it('reaches DIGITIZING from QUOTE_ACCEPTED and from no other state', () => {
    const sources = CUSTOM_REQUEST_STATES.filter((from) => isApp5Transition(from, 'DIGITIZING'));
    expect(sources).toEqual(['QUOTE_ACCEPTED']);
  });

  it('publishes the four APP5 targets plus DIGITIZING, and no NEW target', () => {
    expect([...APP5_TRANSITION_TARGETS].sort()).toEqual([
      'CANCELLED',
      'DIGITIZING',
      'NEEDS_CLARIFICATION',
      'REJECTED',
      'UNDER_REVIEW',
    ]);
    const published: readonly string[] = APP5_TRANSITION_TARGETS;
    for (const systemOwned of SYSTEM_OWNED_APP6_TARGETS) {
      expect(published).not.toContain(systemOwned);
    }
    expect(published).not.toContain('NEW');
  });

  it('offers nothing from a terminal, quoted or post-digitizing state', () => {
    for (const from of [
      'QUOTED',
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

  it('offers exactly DIGITIZING from QUOTE_ACCEPTED, and nothing else', () => {
    const offered = APP5_TRANSITION_TARGETS.filter((to) => isApp5Transition('QUOTE_ACCEPTED', to));
    expect([...offered]).toEqual(['DIGITIZING']);
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

describe('APP6-B06 GRD-005 — digitizing needs an accepted quotation', () => {
  const digitize = command({ to: 'DIGITIZING' });

  it('accepts the move from QUOTE_ACCEPTED with nothing at all', () => {
    expect(evaluateModerationCommand('QUOTE_ACCEPTED', digitize)).toBeUndefined();
  });

  it.each(PRE_ACCEPTANCE)('refuses a request still in %s with QUOTE_NOT_ACCEPTED', (from) => {
    // ADR-DB3-001 r1: no admin override. The refusal names the guard rather
    // than the generic table miss, because the operator is being stopped from
    // spending digitizing labour on a job nobody has committed to.
    expect(evaluateModerationCommand(from, digitize)).toBe('QUOTE_NOT_ACCEPTED');
  });

  it.each(['DIGITIZING', 'DESIGN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'] as const)(
    'refuses %s with the canonical INVALID_TRANSITION, not a GRD-005 synonym',
    (from) => {
      // A repeat, a later state or a terminal one. None of these can still
      // reach `QUOTE_ACCEPTED`, so "get the quotation accepted first" would be
      // advice the operator cannot act on (`APP6-G01` §4, error-mapping column).
      expect(evaluateModerationCommand(from, digitize)).toBe('INVALID_TRANSITION');
    },
  );

  it('partitions the whole state space into one accept and two named refusals', () => {
    const verdicts: Record<string, string> = {};
    for (const from of CUSTOM_REQUEST_STATES) {
      verdicts[from] = evaluateModerationCommand(from, digitize) ?? 'ACCEPTED';
    }
    expect(verdicts).toEqual({
      NEW: 'QUOTE_NOT_ACCEPTED',
      UNDER_REVIEW: 'QUOTE_NOT_ACCEPTED',
      NEEDS_CLARIFICATION: 'QUOTE_NOT_ACCEPTED',
      QUOTED: 'QUOTE_NOT_ACCEPTED',
      QUOTE_ACCEPTED: 'ACCEPTED',
      DIGITIZING: 'INVALID_TRANSITION',
      DESIGN_REVIEW: 'INVALID_TRANSITION',
      APPROVED: 'INVALID_TRANSITION',
      REJECTED: 'INVALID_TRANSITION',
      CANCELLED: 'INVALID_TRANSITION',
    });
  });

  it('reports no other target as QUOTE_NOT_ACCEPTED, from any state', () => {
    // The guard belongs to one target. A rejection refused from `QUOTED` is an
    // illegal move, not a quotation problem.
    const noteKindFor = (to: string): App5NoteKind =>
      to === 'REJECTED' ? 'REJECT' : to === 'NEEDS_CLARIFICATION' ? 'CLARIFY' : 'NOTE';
    for (const from of CUSTOM_REQUEST_STATES) {
      for (const to of APP5_TRANSITION_TARGETS) {
        if (to === 'DIGITIZING') {
          continue;
        }
        const justified = command({
          to,
          internalReason: 'x',
          customerVisibleReason: to === 'UNDER_REVIEW' ? undefined : 'y',
          note: 'z',
          noteKind: noteKindFor(to),
        });
        expect(evaluateModerationCommand(from, justified)).not.toBe('QUOTE_NOT_ACCEPTED');
      }
    }
  });
});

describe('APP6-B06 DIGITIZING reason and note semantics', () => {
  it('needs neither reason text: this is progression, not a decision to justify', () => {
    expect(
      evaluateModerationCommand('QUOTE_ACCEPTED', command({ to: 'DIGITIZING' })),
    ).toBeUndefined();
    expect(
      evaluateModerationCommand(
        'QUOTE_ACCEPTED',
        command({ to: 'DIGITIZING', internalReason: 'Bắt đầu số hoá mẫu thêu.' }),
      ),
    ).toBeUndefined();
  });

  it('refuses a customer-visible reason rather than dropping it', () => {
    // TR-LC11-07 raises no notification, so a customer-visible text here would
    // be a message with no delivery that `APP5-B03` would then show as the
    // explanation of a state the customer was never told about.
    expect(
      evaluateModerationCommand(
        'QUOTE_ACCEPTED',
        command({ to: 'DIGITIZING', customerVisibleReason: 'Chúng tôi đang số hoá mẫu.' }),
      ),
    ).toBe('TRANSITION_CUSTOMER_REASON_NOT_ALLOWED');
  });

  it('accepts an optional NOTE and inherits no moderation note kind', () => {
    expect(
      evaluateModerationCommand(
        'QUOTE_ACCEPTED',
        command({ to: 'DIGITIZING', note: 'Giao cho bạn Hà.', noteKind: 'NOTE' }),
      ),
    ).toBeUndefined();
    for (const noteKind of ['CLARIFY', 'REJECT', 'SPAM'] as const) {
      expect(
        evaluateModerationCommand(
          'QUOTE_ACCEPTED',
          command({ to: 'DIGITIZING', note: 'x', noteKind }),
        ),
      ).toBe('MODERATION_NOTE_KIND_INVALID');
    }
  });
});

describe('APP5-B05 note kinds and notification mapping', () => {
  it('exposes CLARIFY, REJECT, SPAM and NOTE, and not PAUSE', () => {
    expect([...APP5_NOTE_KINDS].sort()).toEqual(['CLARIFY', 'NOTE', 'REJECT', 'SPAM']);
    expect((APP5_NOTE_KINDS as readonly string[]).includes('PAUSE')).toBe(false);
  });

  it('notifies the customer on exactly the three SE-004/SE-012 targets', () => {
    // Unchanged by `APP6-B06`: DB3 LC-11 maps no notification to TR-LC11-07
    // and `APP6-G01` §4 records its outbox column as `none`, so widening the
    // target list must not have widened this set.
    const notifying = APP5_TRANSITION_TARGETS.filter((to) => notifiesCustomer(to));
    expect([...notifying].sort()).toEqual(['CANCELLED', 'NEEDS_CLARIFICATION', 'REJECTED']);
    expect(notifiesCustomer('DIGITIZING')).toBe(false);
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
      // `APP6-B06`: GRD-005.
      'QUOTE_NOT_ACCEPTED',
    ]) {
      expect(failures.has(code)).toBe(true);
    }
  });

  it('publishes the canonical GRD-005 code and no synonym for it', () => {
    // `DB3_TRANSITION_GUARD_CATALOG.md` names the GRD-005 public error exactly
    // once. A second code meaning the same thing is what `APP6-G01` §11 forbids,
    // so the catalogue is checked for one and only one.
    const quotationCodes = MODERATION_FAILURES.filter((failure) => failure.includes('QUOTE'));
    expect(quotationCodes).toEqual(['QUOTE_NOT_ACCEPTED']);
  });

  it('names no unreleased APP6 capability in any published code', () => {
    // `QUOTE_NOT_ACCEPTED` is the one quotation word the catalogue may carry:
    // `APP6-B06` releases the digitizing command, so its precondition has to be
    // sayable. Design versions and approvals stay unreleased and unnamed.
    for (const failure of MODERATION_FAILURES) {
      expect(failure).not.toMatch(/DIGITIZ|DESIGN|APPROV/);
      if (failure.includes('QUOT')) {
        expect(failure).toBe('QUOTE_NOT_ACCEPTED');
      }
    }
  });
});

/** Compile-time guards that the published unions stay the ones under test. */
const _targets: readonly App5TransitionTarget[] = APP5_TRANSITION_TARGETS;
const _kinds: readonly App5NoteKind[] = APP5_NOTE_KINDS;
void _targets;
void _kinds;
