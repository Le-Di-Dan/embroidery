# USER_FLOW_ARCHITECTURE.md

# User Flow Architecture — Creative Embroidery Studio

**Status:** Behavioral design baseline
**Version:** 1.0
**Author role:** Product Design Direction
**Scope:** Behavioral architecture only. No wireframes, no screens, no UI layout.

---

## 0. How to read this document

This document defines the *behavioral architecture* of the product: how attention, emotion, trust, and intent move through the platform and convert into a **Commission Request**. It sits above wireframes and below strategy. It is the contract that every future screen must satisfy.

It uses the established Information Architecture as fixed input. The five domains are not redesigned here:

| Domain | Behavioral role | Not this |
| --- | --- | --- |
| **Discover** | The inspiration engine. Endless masonry feed of works. Entry for undirected attention. | A search/results page |
| **Collections** | Curated meaning. Grouped works with a point of view (style, need, theme). | A product category grid |
| **Studio** | The maker behind the work. Story, process, materials, people, standards. | An "About Us" afterthought |
| **Commission** | The conversion surface. Request → secure flow → quote → approve → deposit. | A cart/checkout |
| **Journal** | Editorial depth. Stories, techniques, behind-the-scenes, client narratives. | A marketing blog |

Vocabulary follows `docs/11-DOMAIN-GLOSSARY.md` and `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md`: *Artwork*, *Work*, *Design Session*, *Custom Request*, *Secure Link*, *Quotation*, *Deposit (40%)*, *Remaining Payment (60%)*, *Approval Snapshot*, *Digitizing*.

---

## 1. Executive Summary

### 1.1 The core behavioral thesis

Users do not arrive wanting embroidery. They arrive wanting a *feeling* — that a personal, meaningful object could exist and be made well. The platform's job is not to sell a product; it is to **make the possibility feel real, then make the maker feel trustworthy, then make the ask feel small.**

The canonical path is therefore emotional before it is transactional:

```
Inspiration → Discovery → Appreciation → Trust → Commission
```

Every surface is measured against one question: *does this move the user one step further along this chain, or does it stall them?*

### 1.2 Four behavioral truths that shape everything

1. **Intent is manufactured, not captured.** Unlike ecommerce (where demand pre-exists and the job is efficient fulfillment), here demand is *created* on-site. The masonry feed is not a catalog; it is a desire generator. This means the funnel is wide, shallow, and slow at the top, and must never rush.

2. **Trust is the true currency, not price.** A commission is a high-uncertainty, deferred-gratification, custom purchase from a small studio. The dominant conversion blocker is not "too expensive" — it is "will they understand what I want, and will it be good?" The architecture front-loads *evidence* over *persuasion*.

3. **Commitment must be reversible until the last moment.** Nothing is a cart. The design session autosaves but never traps. The Commission entry is a *conversation opener*, not a checkout. Because commitment is reversible, users commit earlier and more often.

4. **The primary CTA is not "Buy" — it is "Start a conversation about making this."** The mental model is closer to booking a consultation with an artist than adding to cart. This reframes every conversion moment.

### 1.3 The single most important design constraint

**Never present a dead end without a lateral escape into more inspiration.** In a discovery product, the failure mode is not rejection — it is *drift and exit*. Every terminal state (a viewed artwork, an empty collection, a page a user doesn't understand, a price they can't estimate) must offer a re-entry into the feed or a lower-commitment next step. The architecture treats "return to inspiration" as the universal safety net.

### 1.4 What success looks like behaviorally

- A Type A visitor who arrived with no idea leaves having **saved** something and formed a **studio impression** — even if they don't commission today.
- A Type C visitor who arrived ready finds **enough trust evidence within 2–3 surfaces** to open a Commission Request without needing to leave for external validation.
- No user reaches the pricing question *before* they reach the emotional attachment and trust milestones. Price is always contextualized by desire and confidence.

---

## 2. User Psychology

Four user types, mapped by *directed-ness of intent* (how clear their goal is) and *trust state* (how much they already believe in the studio).

```
                 LOW trust ───────────────► HIGH trust
   NO clear      ┌───────────────┬───────────────┐
   intent        │   Type A      │               │
                 │  Inspiration  │   (drift-in)  │
                 │   -driven     │               │
                 ├───────────────┼───────────────┤
   CLEAR         │   Type B      │   Type C      │
   intent        │ Idea-driven   │ Commission-   │
                 │               │  ready        │
                 ├───────────────┴───────────────┤
   RETURNING     │           Type D              │
                 │      Returning customer       │
                 └───────────────────────────────┘
```

### 2.1 Type A — Inspiration-driven visitor

*"I don't know what I want. Show me something that makes me feel something."*

| Dimension | Detail |
| --- | --- |
| **Goals** | Be delighted; escape; browse beautiful things; maybe find "the one" idea without effort. |
| **Motivations** | Aesthetic pleasure, curiosity, self-expression fantasy ("something like this, but *mine*"), social currency (something worth saving/sharing). |
| **Concerns** | Boredom, repetition, feeling sold-to, effort. They will leave the instant it feels like work or like an ad. |
| **Trust barriers** | None yet — they haven't asked for trust because they haven't formed intent. Barrier is *attention*, not trust. |
| **Conversion triggers** | A single artwork that hits an emotional chord; the realization "wait, I could actually have this made"; low-friction save; a story that turns a pretty image into a *possibility*. |
| **Primary risk** | Infinite browse with zero attachment → pleasant exit, no memory. |
| **Design mandate** | Convert *attention* into *attachment*. Seed the "I could commission this" thought early and gently, without breaking the gallery spell. |

### 2.2 Type B — Idea-driven visitor

*"I have a rough idea. Show me you can do it — and do it well."*

| Dimension | Detail |
| --- | --- |
| **Goals** | Validate that their idea is possible; find examples close to it; gauge quality and range. |
| **Motivations** | Reducing uncertainty about feasibility; gathering references; building confidence before committing effort. |
| **Concerns** | "Can they do *my specific* thing?"; "Is my idea weird/too small/too big?"; quality consistency across works. |
| **Trust barriers** | Capability proof (range + craft), relevance (is there evidence near *my* need), and "will they take my idea seriously." |
| **Conversion triggers** | Seeing a work adjacent to their idea; a collection that names their exact need; a clear, unintimidating way to say "something like this." |
| **Primary risk** | Searching for an exact match, not finding it, concluding "they can't do it" → exit. (False negative — the studio *can*, but the feed didn't prove it.) |
| **Design mandate** | Turn *browsing* into *matching*. Let them anchor on the nearest work and express "like this but different" as the on-ramp to Commission. Discovery must feel like capability, not catalog. |

### 2.3 Type C — Commission-ready visitor

*"I want this made. Convince me you're the right studio and make it easy."*

| Dimension | Detail |
| --- | --- |
| **Goals** | Get it made, well, without risk or hassle. Start the conversation now. |
| **Motivations** | A real occasion/need (gift, milestone, personal object); emotional stakes are high; wants to feel in safe hands. |
| **Concerns** | Process opacity ("what happens after I ask?"), timeline, revisions, will it match expectation, payment safety, what if it's wrong. |
| **Trust barriers** | Process clarity, proof of finished quality, payment/deposit safety, revision safety net, human responsiveness. |
| **Conversion triggers** | A visible, simple "how it works"; deposit/approval structure that protects them; evidence of prior successful commissions; fast, human contact option (Zalo/Messenger). |
| **Primary risk** | Anxiety at the commitment threshold: opens Commission, hits uncertainty about process/price/timeline, retreats to "I'll think about it" → churn. |
| **Design mandate** | Reduce *perceived risk*, not price. Make the first step tiny and reversible. Answer "what happens next" *before* they ask. Give a human escape hatch at every hesitation. |

### 2.4 Type D — Returning customer

*"I've done this before and it was good. Let's do it again — fast."*

| Dimension | Detail |
| --- | --- |
| **Goals** | Start a new project quickly; possibly reference/repeat a past one; skip re-earning trust. |
| **Motivations** | Proven satisfaction; a new occasion; relationship with the maker. |
| **Concerns** | Friction ("do I have to explain everything again?"); being treated like a stranger. |
| **Trust barriers** | Already crossed. Barrier is now *effort* and *recognition*. |
| **Conversion triggers** | A frictionless "start another project"; continuity ("welcome back"); reference to prior work (future: project history). |
| **Primary risk** | Treated identically to a first-timer → friction insults the relationship → they use Zalo/Messenger directly and bypass the product entirely (losing structured data). |
| **Design mandate** | Collapse the funnel. Trust and appreciation are done — jump them near-directly to Commission with continuity cues. Design for this even though structured accounts are a *future* capability (see §8). |

### 2.5 Cross-type emotional arc (the universal spine)

All four types traverse the same five emotional states, but **enter at different points and move at different speeds**:

```
CURIOUS ──► INTERESTED ──► INSPIRED ──► TRUSTING ──► READY
  │             │             │             │           │
Type A enters here ───────────┘             │           │
Type B enters around here ──────────────────┘           │
Type C enters near here ────────────────────────────────┘
Type D re-enters at READY (trust pre-earned)
```

The architecture must serve *entry at any point* and *acceleration or deceleration* as the user's state demands — never force a Type C back through Type A's slow inspiration ramp, and never dump a Type A into a Commission form.

---

## 3. User Flow Maps

Notation for each flow: **Entry → Intent → Actions → Decisions ◆ → Emotional state → Trust moments 🛡 → Conversion opportunities ★ → Exits.**

Shared terminal conversion (all flows) — the **Commission Request funnel**:

```
★ Commission Request (open)
   → Provide need + reference work/design + contact
   → Verify email/phone
   → System issues Secure Link
   → [async] Admin review → Quotation (40/60)
   → Customer reviews via Secure Link
   → Design Review → Revision loop → Approval Snapshot
   → Deposit 40% → Production → Remaining 60% → Delivery → Completed
```

This document owns the flow *up to and including "Commission Request opened + Secure Link issued."* Everything after is governed by `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md`.

---

### 3.1 Flow A — Discover → Commission (Type A primary)

The longest, slowest, highest-drop, highest-magic path. Manufactures intent from nothing.

```
ENTRY: Homepage / Discover masonry feed (organic, social, direct)
INTENT: none — "show me something"
EMOTION: Curious

  ▼ Actions: scroll · dwell · scroll
  ◆ Does any artwork arrest attention?
      NO ─► keep scrolling ─► (drift risk) ─► EXIT ⚠ [Dead End D1]
      YES ▼
  EMOTION: Interested
  Actions: tap artwork → Artwork Detail
  🛡 Trust moment: craft visible in detail; materials/technique named; watermark present but not defacing
  ◆ Is there a story here?  → read caption / origin
  EMOTION: Inspired ("oh, this was *made* for someone")
  ★ Secondary conversion available: Save Inspiration · View More Works · Explore this Collection · Read the Studio story

  ◆ What does the user do with the feeling?
     ├─ Save ─────────► reservoir of intent (return later) ─► [re-entry point]
     ├─ View similar ─► back into feed, now *directed* (becomes Type B behavior)
     ├─ Read Studio ─► Trust deepens 🛡🛡 ─► returns warmer
     └─ "Commission something like this" ★★ (primary)
             ▼
  EMOTION: Trusting → Ready (if trust milestones met — see §5)
  ◆ Trust sufficient?
     NO ─► detour to Studio / Journal / "How it works" ─► rebuild ─► return
     YES ▼
  ★ COMMISSION REQUEST (pre-filled with the anchoring artwork as reference)
  → verify → Secure Link → [async lifecycle]

EXITS (healthy): Saved-and-left (intent banked) · Followed to Studio/Journal · Contacted via Zalo/Messenger
EXITS (unhealthy): Scroll-fatigue exit · Bounce with no dwell ⚠
```

**Key insight:** For Type A, the artwork detail must silently plant *"this can be made for you"* without breaking the gallery spell. The commission CTA appears **after appreciation**, never as the first thing on the artwork surface (per Design Vision §10).

---

### 3.2 Flow B — Collection → Commission (Type B primary)

Intent exists; the collection *names* it and proves capability.

```
ENTRY: Collections index, or a Collection linked from an artwork/Journal/SEO landing
INTENT: "I have a rough idea; find examples near it"
EMOTION: Interested (arrives warmer than Type A)

  Actions: browse Collection (themed set with POV)
  🛡 Trust moment: a *coherent body of work* signals reliability & range (not one lucky piece)
  ◆ Does the collection match the user's idea?
     CLOSE ▼                              FAR ─► ◆ browse adjacent collections?
                                              YES ─► lateral move ─► retry
                                              NO ─► EXIT ⚠ [Dead End D2: "not for me"]
  EMOTION: Inspired + validated ("they *do* my kind of thing")
  Actions: open specific Work → Artwork Detail
  ★ Secondaries: Save · View More in Collection · Read the making-of (Journal link)
  ◆ "Like this, but mine?"
     YES ▼
  EMOTION: Ready-leaning (feasibility fear reduced)
  🛡 Trust moment: "how it works" / revision safety visible near CTA
  ★ COMMISSION REQUEST (reference = this Work; intent = "similar to, with these changes")
  → verify → Secure Link → [async]

EXITS (healthy): Saved collection intent · Moved to Studio to vet the maker · Contacted directly
EXITS (unhealthy): No matching collection → false-negative exit ⚠
```

**Key insight:** Collections are the *capability proof engine* for Type B. The risk is a **false negative** — the studio can do the user's idea, but no collection surfaced it. Mitigation: collections must be **need-named** (occasion/style/theme), and every collection must offer a "don't see yours? describe it" bridge into Commission (an idea *does not* require a pre-existing example).

---

### 3.3 Flow C — Journal → Commission (mixed types, trust-heavy)

Editorial content pulls in via SEO/social; converts through *depth* and *humanization*.

```
ENTRY: Journal article (SEO, shared link, internal link)
INTENT: informational / curiosity ("how is this made" / "gift ideas" / a story)
EMOTION: Curious → Interested

  Actions: read article (technique, behind-the-scenes, client story, guide)
  🛡🛡 Trust moment: process transparency + craft mastery + real client narrative = high-trust content
  ◆ Did the article surface a concrete want?
     NO ─► ◆ related articles / related works?
              YES ─► lateral ─► retry
              NO  ─► EXIT (but studio impression banked, may return)
     YES ▼
  EMOTION: Inspired + Trusting (Journal builds trust faster than Discover)
  ★ In-context bridges: linked Work · linked Collection · "commission your own" · Save
  ◆ Path chosen:
     ├─ To Work/Collection ─► rejoin Flow A/B (now high-trust)
     └─ Direct "commission your own version" ★
             ▼
  EMOTION: Ready
  ★ COMMISSION REQUEST (reference = article's featured work or a fresh brief)
  → verify → Secure Link → [async]

EXITS (healthy): Subscribed-to-read-more mindset · Saved · To Collections/Works
EXITS (unhealthy): Read-and-leave with no bridge offered ⚠ [Dead End D5]
```

**Key insight:** Journal is the **trust accelerator**. A user who reads a making-of or a client story arrives at Commission with pre-built trust that Discover alone cannot supply. Every Journal piece must therefore carry *contextual* conversion bridges — never a generic footer CTA, always "commission a piece like the one in this story."

---

### 3.4 Flow D — Direct Commission (Type C primary)

User arrives ready. This is the *shortest* flow and must not be slowed by inspiration ramps.

```
ENTRY: Commission (direct nav, SEO "custom embroidery", referral, returning intent)
INTENT: "I want something made"
EMOTION: Ready-but-anxious (high intent, high perceived risk)

  ◆ Immediate question the user has: "what happens if I start this?"
  🛡🛡🛡 Trust moment (must be pre-answered, before the form):
        · How it works (steps, timeline expectation)
        · Deposit/approval structure (40% only after *you approve* the design)
        · Revision safety (no hard limit; approve-before-pay)
        · Proof (finished works, prior commissions)
        · Human channel (Zalo/Messenger) visible
  ◆ Does the user have a reference?
     ├─ Yes, an on-site Work ─► attach as reference
     ├─ Yes, own image/idea ─► upload / describe (Customer-Owned or store product path)
     └─ No, just a need ─► guided brief (product? occasion? size? where?)
  EMOTION: Reassured (risk perceived as low & reversible)
  ★ COMMISSION REQUEST
     · store product path → optional 2D Customizer (Design Session, autosave, watermark preview)
     · own product path → upload photos + dimensions + location
  ◆ Ready to submit?
     NO ─► Design Session persists (autosave) ─► can leave & return ─► [Journey J9 safety]
     YES ▼
  → verify email/phone → Secure Link issued
  EMOTION: Committed-but-safe ("I've started, but nothing's locked, nothing's paid")
  → [async: Admin review → Quotation → Design Review → Approval → Deposit ...]

ESCAPE HATCH (any hesitation): Zalo / Messenger with request code prefilled → human reassurance → return to flow
EXITS (healthy): Submitted · Session saved for later · Moved to Zalo for a question
EXITS (unhealthy): Form abandonment at commitment threshold ⚠ [Dead End D3]
```

**Key insight:** Type C's blocker is **process anxiety**, not desire. The Commission surface must answer *"what happens after I press this"* **before** presenting the ask. The 40/60 structure is a *trust feature* — surface it as protection ("you only deposit after you approve the design"), not as a payment term.

---

### 3.5 Flow E — Returning Customer (Type D primary)

Trust and appreciation are already earned. Collapse the funnel; honor the relationship.

```
ENTRY: Returning via Secure Link, saved bookmark, direct nav, or (future) account
INTENT: "start another project" / "reference my last one"
EMOTION: Confident, low-anxiety, impatient with friction

  🛡 Trust moment: recognition/continuity ("welcome back") — relationship, not transaction
  ◆ New project or continue/repeat prior?
     ├─ New ─► fast-path Commission (skip inspiration ramp; optional light browse)
     └─ Repeat/reference prior ─► (FUTURE: project history) ─► pre-fill from past commission
  EMOTION: Efficient, valued
  ★ COMMISSION REQUEST (minimal friction; reference prior work if available)
  → (identity already partly known) → Secure Link → [async]

  Note: today, without accounts, "returning" is carried by Secure Link + Zalo/Messenger relationship.
        The architecture must NOT force a returning customer through first-time trust-building.

EXITS (healthy): New request opened fast · Continued a prior conversation
EXITS (unhealthy): Treated as stranger → defects to direct Zalo/Messenger, bypassing structured request ⚠ [Dead End D6]
```

**Key insight:** The returning customer is the highest-LTV, lowest-cost conversion — and the easiest to *insult* with friction. Even before formal accounts exist (§8), the product must detect return signals (Secure Link re-entry) and offer a faster lane. Losing them to raw Zalo chat means losing structured request data and repeatability.

---

### 3.6 Flow interconnection map

Flows are not silos. Users hop between them. The architecture is a *web*, not five parallel tunnels:

```
        ┌──────────── SAVE (intent reservoir) ◄─── every surface
        │                                             │
   DISCOVER ─────► ARTWORK DETAIL ◄───── COLLECTIONS   │
     (A)               │  ▲                (B)         │
        ▲              │  │                 ▲          │
        │              ▼  │                 │          │
     JOURNAL ──────────┼──┴─────────────────┘          │
       (C)             │                               │
        │              ▼                               │
      STUDIO ────► [TRUST GATE] ────► COMMISSION ◄──────┘
      (trust)                            (D direct)
                                            ▲
                                            │
                                    RETURNING (E)
```

Rules of the web:
- **Every artwork** links to: its Collection, similar Works, and (where it exists) its Journal making-of.
- **Studio** is reachable from anywhere as the trust vault; it feeds back into Commission warmer.
- **Save** is available on every artwork/collection and forms the cross-session intent reservoir.
- **Commission** is reachable from every appreciation moment — but is *contextualized* by whatever the user was looking at (reference pre-filled).

---

## 4. Decision Architecture

### 4.1 Master decision tree (from any inspiration touch)

```
User encounters an Artwork / Work
│
◆ Emotional hit? ──NO──► continue discovery ──► (loop) ──► drift risk → offer Save prompt / Collection nudge
│ YES
▼
◆ Want to understand it? 
   ├─ YES ─► View story / materials / technique ──► trust +1
   └─ NO ─► stay visual
▼
◆ Want more like it?
   ├─ YES ─► View similar Works ─► enters directed browse (B-behavior)
   └─ Explore its Collection ─► capability proof ─► trust +1
▼
◆ Want to keep it?
   ├─ YES ─► SAVE ─► intent reservoir (async return)
   └─ NO ─► continue
▼
◆ Want the maker's credibility?
   ├─ YES ─► Read Studio story / process ─► trust +2
   └─ NO ─► continue
▼
◆ Ready to act on the feeling?
   ├─ NOT YET ─► (Save / Contact / keep browsing) ─► return later
   ├─ NEED REASSURANCE ─► "How it works" / Zalo-Messenger ─► reassured ─► loop back
   └─ YES ─► COMMISSION (reference pre-filled)
              │
              ◆ Have a reference/idea?
                 ├─ On-site Work ─► attach
                 ├─ Own image ─► upload (+ dimensions if own product)
                 └─ Just a need ─► guided brief
              ▼
              ◆ Store product or own product?
                 ├─ Store ─► optional 2D Customizer (Design Session)
                 └─ Own ─► photos + dimensions + location
              ▼
              ◆ Submit now?
                 ├─ NO ─► autosave session, leave, return (J9)
                 └─ YES ─► verify email/phone ─► Secure Link ─► async lifecycle
```

### 4.2 Decision-point catalog

Each key decision, its behavioral stakes, and the design obligation:

| # | Decision point | User is really asking | Design obligation |
| --- | --- | --- | --- |
| DP1 | Keep scrolling vs. stop on a Work | "Is anything here *for me*?" | Feed density & variety must maximize the chance of an emotional hit within the first screens. |
| DP2 | View similar vs. read story | "Do I want *more* or *deeper*?" | Offer both without forcing; neither should hijack the gallery feel. |
| DP3 | Save vs. act now | "Am I ready, or banking this?" | Make Save one-tap & guilt-free; it is a *win*, not a fallback. |
| DP4 | Explore Collection vs. stay | "Is this a fluke or a capability?" | Collection entry from any Work must be one tap; proves range. |
| DP5 | Read Studio vs. proceed | "Can I trust these people?" | Studio always reachable; never a required detour, always an available one. |
| DP6 | Commission vs. hesitate | "What happens if I start?" | Pre-answer process/timeline/deposit/revision *before* the ask. |
| DP7 | Reference type (Work / own / need) | "How do I express what I want?" | Three on-ramps; none should feel like the "wrong" door. |
| DP8 | Store vs. own product | "Do I bring my own, or start from theirs?" | Both first-class; own-product path needs dimensions + location capture. |
| DP9 | Submit vs. save session | "Am I sure enough to send?" | Autosave + return (J9) makes "not yet" safe, so "yes" comes easier. |
| DP10 | Verify identity | "Is giving my contact safe/worth it?" | Frame verification as *securing your request*, not as a signup wall. |
| DP11 | Self-serve vs. human (Zalo/Messenger) | "Can I just ask a person?" | Human channel available at every hesitation, request-code prefilled. |

### 4.3 The three gates

Between the emotional spine's states sit three *gates* the user must pass. Each gate is a bundle of decisions; failing a gate sends the user laterally (not out, ideally):

```
[ATTENTION GATE]  Curious → Interested
   pass: an artwork arrests attention.  fail: drift → Save nudge / feed variety
[APPRECIATION GATE]  Interested → Inspired
   pass: understands the work as a made, personal possibility.  fail: story/similar/collection detours
[TRUST GATE]  Inspired → Trusting → Ready
   pass: process + proof + safety perceived.  fail: Studio / Journal / How-it-works / human contact
```

The Commission funnel begins only *after* the Trust Gate. Pushing users at Commission before the Trust Gate is the single most common architectural error — it produces form abandonment (D3).

---

## 5. Trust Architecture

Trust is the product's real conversion engine. This section maps *what* users must see, *when*, and *why* — and how it advances the emotional spine.

### 5.1 The trust ladder

```
CURIOUS ──► INTERESTED ──► INSPIRED ──► TRUSTING ──► READY
   │            │             │            │           │
 [craft      [coherence]   [possibility] [safety]   [ease]
  signal]
```

| Stage | What the user needs to see | Where (domain) | Why it matters |
| --- | --- | --- | --- |
| **Curious → Interested** | Immediate, undeniable **craft quality** in the imagery. Real works, high fidelity, honest texture. Watermark present but never defacing. | Discover, Artwork Detail | First trust is *visual*: "these people can actually make beautiful things." No claim needed — show. |
| **Interested → Inspired** | **Coherence & range**: a body of work, collections with a point of view, consistency across pieces. | Collections | Distinguishes a real studio from a lucky one-off. Proves *your* idea is within reach. |
| **Inspired → Trusting** | **The maker & the process**: who makes this, how, with what materials/standards; behind-the-scenes; real client stories. | Studio, Journal | Humanizes. Converts "nice pictures" into "trustworthy people." This is the biggest single trust jump. |
| **Trusting → Ready** | **Process & safety**: how commissioning works, timeline expectation, revision safety, deposit-after-approval (40/60), payment safety, human contact. | Commission ("how it works"), global contact | Removes *perceived risk* at the commitment threshold. This is what unblocks Type C. |
| **Ready → Committed** | **Reversibility & responsiveness**: autosave, no lock-in before approval, fast human reply, request code continuity. | Commission flow, Secure Link, Zalo/Messenger | The final nudge: starting costs nothing and traps nothing. |

### 5.2 Trust evidence inventory (what must exist somewhere)

- **Craft evidence:** high-fidelity real photography of finished works; detail/macro views showing stitch quality; material honesty.
- **Range evidence:** multiple coherent collections; breadth of styles/occasions; volume of works.
- **Human evidence:** the maker's presence (Studio); process transparency; behind-the-scenes (Journal).
- **Outcome evidence:** real client stories/narratives; completed commissions; (future) reviews/testimonials.
- **Process evidence:** clear "how it works"; explicit stages; timeline expectation framing.
- **Safety evidence:** deposit-after-approval framing; approve-before-you-pay; unlimited-revision reassurance; secure link; verified payment (server-side); human channel.

### 5.3 Trust-timing principle

**Trust evidence must be available *before* the user needs it, but never forced.** The architecture pre-positions evidence one step ahead of intent:

- On Discover, *craft* is already visible (they need it now).
- On Artwork Detail, *coherence + story* is one tap away (they'll need it next).
- Near any Commission CTA, *process + safety* is inline or one tap away (they'll need it to press it).

Never make trust a required detour (that's friction); always make it an available reassurance (that's safety).

### 5.4 Trust decay & repair

Trust can drop mid-journey. Triggers and repairs:

| Trust-decay trigger | Repair path |
| --- | --- |
| Repetitive/low-variety feed → "is this all?" | Inject collection diversity; surface Studio/Journal depth. |
| Price shock without context | Re-anchor on value (craft, process, custom nature) before/with price; offer human quote conversation. |
| Process opacity at Commission | Inline "how it works"; deposit-after-approval reassurance. |
| No response fear ("small studio, will they reply?") | Visible Zalo/Messenger; expectation-setting on response; request code confirmation. |
| Fear of being locked in | Autosave + reversibility messaging; nothing paid until design approved. |

---

## 6. Conversion Architecture

### 6.1 Primary conversion

**Commission Request opened → identity verified → Secure Link issued.**

Everything downstream (quote, approval, deposit, production) is governed by lifecycle docs. The product's *conversion job* ends at a submitted, contactable, structured request. Success is defined here — not at payment — because payment is an *async, admin-mediated* outcome, not a browser event (per PRD §8: never treat client redirect as success).

### 6.2 Secondary conversions and their role

Secondary conversions are **not lesser** — they are the *staircase* to the primary one. Each advances the emotional spine and/or banks intent for later.

| Secondary conversion | Emotional spine effect | Contribution to primary | Failure if absent |
| --- | --- | --- | --- |
| **View More Works** | Curious → Interested → Inspired | Deepens attachment; converts a single hit into a pattern of desire; feeds Type-B matching. | User exits after one work; no momentum. |
| **Explore Collection** | Interested → Inspired (+ trust: coherence) | Proves capability & range; validates "they can do my kind of thing." | Type B false-negative exit (D2). |
| **Read Studio Story** | Inspired → Trusting | The biggest trust jump; humanizes; unblocks risk-averse Type C. | Trust ceiling; Commission feels risky. |
| **Save Inspiration** | Any → banked intent | Cross-session reservoir; enables return; captures not-ready-yet demand. | Not-ready users lost forever (no re-entry). |
| **Contact Studio (Zalo/Messenger)** | Any → Trusting/Ready | Human reassurance escape hatch; rescues hesitation; salvages complex/atypical needs. | Anxious users churn instead of asking (D3). |

### 6.3 The conversion staircase

```
   SAVE ──────────────┐  (banks intent; async return)
   VIEW MORE ─────┐    │
   EXPLORE COLL. ─┼──► builds desire + capability belief
   READ STUDIO ───┼──► builds trust ───────────┐
   CONTACT ───────┴──► rescues hesitation ──────┤
                                                ▼
                                    ★ COMMISSION REQUEST (primary)
                                                ▼
                              verify → Secure Link → [async lifecycle]
```

Design rule: **never present the primary CTA in isolation.** Always co-present at least one lower-commitment secondary (Save, or Contact, or a trust link). This gives the not-yet-ready user a *forward* move instead of a *backward* exit.

### 6.4 CTA placement doctrine

- On **Discover**: no hard commission CTA in the feed. The feed's job is attention; Save is the only micro-conversion. (Protects the gallery spell — Design Vision §8, §12.)
- On **Artwork Detail**: commission CTA appears **after** the work is appreciated (below story/materials), reframed as "commission something like this" — never above the fold, never "add to cart."
- On **Collection**: a "describe what you're looking for" bridge for non-matching needs, plus per-work commission entry.
- On **Studio / Journal**: *contextual* bridges tied to the content, not generic footers.
- On **Commission**: process/safety evidence *precedes* the form; human channel co-present; autosave visible.

### 6.5 Conversion measurement model (behavioral KPIs)

| Funnel stage | Behavioral signal | Health question |
| --- | --- | --- |
| Attention | dwell time, scroll depth, artwork opens | Is the feed manufacturing interest? |
| Appreciation | story reads, "view more/similar," collection opens | Are hits becoming attachment? |
| Intent banking | saves per session, return-with-save rate | Are not-ready users retained? |
| Trust | Studio/Journal reach rate, "how it works" views | Are users crossing the trust gate? |
| Commission open | commission starts / commission completions | Is the ask converting once reached? |
| Escape-hatch | Zalo/Messenger clicks with request code | Are the hesitant being rescued vs. lost? |

The most important *leading* indicator is **save-and-return rate** — in a manufactured-intent product, banked intent is future primary conversion.

---

## 7. Dead End Analysis

A "dead end" here = any state where the user's forward motion along the emotional spine stops and exit becomes the path of least resistance. In a discovery product these are the primary loss mechanism (more than price objections).

### 7.1 Dead-end catalog

| ID | Dead end | User state | Risk | Recovery path (architecture) |
| --- | --- | --- | --- | --- |
| **D1** | **Lost in the gallery** (infinite scroll, no attachment) | Type A, Curious, drifting | Pleasant exit, zero memory, no re-entry hook. Highest-volume loss. | Feed variety pacing; gentle Save nudges after N works; surface a Collection ("looking for something specific?") as a soft rail; intersperse a Studio/Journal hook to add depth. |
| **D2** | **No matching example** (Type B searches, doesn't find their idea) | Idea-driven, Interested | *False-negative* exit: "they can't do it" (when they can). | Collections named by need/occasion; universal "describe what you want — no example needed" bridge into Commission; "similar works" that broaden rather than dead-end; human contact for atypical asks. |
| **D3** | **Commitment-threshold anxiety** (opens Commission, retreats) | Commission-ready, Ready-but-anxious | Highest-value loss: intent existed, risk perception killed it. | Pre-answer process/timeline/deposit/revision *before* the form; deposit-after-approval framing; autosave + reversibility; visible Zalo/Messenger escape hatch with request code. |
| **D4** | **Price/pricing opacity** ("how much will this cost??") | Any, but esp. B/C | Uncertainty → assume expensive → exit; or expectation mismatch later. | Frame value before price; explain *why custom pricing is manual* (size/colors/stitch count) as a quality signal; offer "get a quote" as a *conversation*, not a paywall; never require price before the trust gate. |
| **D5** | **Read-and-leave** (Journal/Studio consumed, no bridge) | Any, Inspired/Trusting but idle | Trust built, then wasted — no next step offered. | Every Journal/Studio piece carries contextual bridges (linked Work/Collection/"commission your own"); related-content rail to continue the session; Save. |
| **D6** | **Returning-customer friction** (treated as stranger) | Type D, Confident but impatient | Defects to raw Zalo/Messenger → structured data lost, repeatability lost. | Detect return (Secure Link re-entry); fast-lane Commission; recognition cues; (future) project history/account. |
| **D7** | **Saved-and-forgotten** (intent banked, never returns) | Any who Saved and left | Reservoir leaks; future conversion evaporates. | (Future) opt-in reminders/email; saved-set continuity on return; make the saved set the natural landing on re-entry. |
| **D8** | **Verification wall shock** ("why do you need my contact?") | Any at Commission submit | Reads as signup/spam risk → abandons at the last step. | Frame as *securing & tracking your request* (not marketing); minimal ask (email *or* phone); clarify no-password, no-account-required; state what the Secure Link gives them. |
| **D9** | **Own-product uncertainty** ("can they embroider *my* thing?") | Type B/C with own item | Abandons feasibility question. | Clear own-product path (photos + dimensions + location); reassurance that Admin reviews feasibility manually (J3); human contact for edge cases. |
| **D10** | **Overwhelm by choice** (too many collections/options) | Type A/B early | Decision paralysis → exit. | Editorial curation (Collections have POV, not endless taxonomy); a "start here" entry; save-and-decide-later as pressure relief. |
| **D11** | **Post-story orphan on mobile** (deep in Journal, lost the path back) | Any on mobile | Context loss → exit. | Persistent lightweight return-to-feed affordance; related rails; Save persists across the jump. |
| **D12** | **Silence anxiety after submit** ("did it go through? will they reply?") | Post-Commission | Regret/anxiety → informal follow-up on Zalo, or churn. | Immediate confirmation + request code + Secure Link + expectation on response; Zalo/Messenger with code prefilled. |

### 7.2 The universal recovery principle

Every dead end resolves to one of **three lateral escapes**, never to a hard stop:

```
DEAD END ─► (1) BACK TO INSPIRATION  (feed / collection / similar)  ← default safety net
         ─► (2) BANK THE INTENT      (Save, contact with code)      ← for the not-ready
         ─► (3) HUMAN RESCUE         (Zalo / Messenger)             ← for the anxious/atypical
```

If a surface cannot offer at least one of these three, it is architecturally incomplete.

---

## 8. Future Expansion

Future flows must extend the *behavioral* architecture without altering the five-domain IA, and without violating the Design Vision constraint: *if a feature reduces the sense of artistic discovery, it is rejected* (Design Vision §13).

### 8.1 Favorites (evolution of "Save")

- **Behavioral role:** promote the intent reservoir from ephemeral to persistent; turn banked intent into a returnable, curatable set.
- **Flow (IA-preserving):** Save (exists today, session-level) → persistent Favorites tied to identity (email/phone verified, or future account). Favorites become a *personal collection* — reinforcing the gallery metaphor, not breaking it.
- **Conversion link:** Favorites landing on return = warm re-entry to Commission ("commission from your saved works"). Directly attacks D7 (saved-and-forgotten).
- **Constraint:** Favorites is a *private gallery*, not a wishlist/cart. No prices, no "add to cart" semantics.

### 8.2 User Account

- **Behavioral role:** collapse returning-customer friction (D6) and unlock continuity — *without* becoming a mandatory signup wall (PRD §4: no password required to design).
- **Flow:** verification-first, password-optional identity. Account *accrues* from Secure Link usage rather than gating entry. First commission is possible with no account; account is offered *after* value is demonstrated.
- **Conversion link:** recognition, faster Commission, project continuity for Type D.
- **Constraint:** must never move the product toward "login to browse." Discovery stays open and anonymous.

### 8.3 Saved Inspirations (curated boards)

- **Behavioral role:** deepen Type A/B engagement by letting users *organize* inspiration into themed boards (Pinterest-native behavior).
- **Flow:** Favorites → multiple named boards → boards can seed a Commission ("commission in the spirit of this board" — style reference bundle).
- **Conversion link:** a board is a rich creative brief; it becomes a high-quality Commission reference, improving Admin's ability to quote/digitize.
- **Constraint:** boards are private by default; sharing is a later, opt-in step (bridges to Community below). Must not turn the studio into a UGC content farm.

### 8.4 Community

- **Behavioral role:** social proof + belonging; user-shared boards/finished pieces; light social discovery.
- **Flow:** opt-in sharing of boards or completed commissions → a curated community surface *within* Discover's spirit (still masonry, still gallery-grade).
- **Conversion link:** peer works are the strongest trust evidence (real customers, real outcomes) — powerful for Type C's outcome-evidence need.
- **Constraint (critical):** community must be *curated/gallery-grade*, never a raw feed. If it dilutes the premium artistic feeling, it is rejected (Design Vision §13). Moderation and curation are prerequisites, not afterthoughts.

### 8.5 Customer Project Tracking

- **Behavioral role:** eliminate post-submit silence anxiety (D12) and mid-commission opacity; extend trust *through* fulfillment.
- **Flow:** the Secure Link (which already exists) evolves into a project view exposing the *lifecycle states* (from `docs/06`): Submitted → Under Review → Quoted → Design Review → Approved → Deposit → Production → Final Payment → Delivery → Completed — as customer-safe milestones.
- **Conversion link:** drives *repeat* commissions (Type D) by making the first experience feel safe and transparent end-to-end; a delivered project view is the natural launchpad for "start another."
- **Constraint:** expose only customer-safe state; never internal production files, digitizing data, or admin notes (PRD, Security doc). Must respect approval-snapshot immutability and secure-link expiry/revocation.

### 8.6 Future-flow guardrails (apply to all of the above)

1. **IA is fixed.** Every future capability lives *inside* Discover / Collections / Studio / Commission / Journal — no sixth domain.
2. **Discovery stays anonymous & open.** No feature may gate browsing behind login.
3. **Gallery feeling is inviolable.** Any feature that makes the experience feel like a marketplace/wishlist/social-feed-farm is rejected.
4. **Secure Link is the identity/continuity spine** until accounts exist; accounts *accrue*, never *gate*.
5. **The emotional spine still rules:** every new flow must move the user along Curious → Interested → Inspired → Trusting → Ready, or bank intent for later — or it doesn't ship.

---

## Appendix A — One-page behavioral summary

```
POSITIONING: Artist studio, not a store. Manufacture intent, then earn trust, then make the ask small.

SPINE:  Curious ─► Interested ─► Inspired ─► Trusting ─► Ready ─► Committed(reversible)
GATES:  [Attention] ──► [Appreciation] ──► [Trust] ──► Commission funnel
DOMAINS: Discover(attention) · Collections(capability) · Studio+Journal(trust) · Commission(convert)

PRIMARY CONVERSION: Commission Request opened + verified + Secure Link issued
SECONDARIES (the staircase): View More · Explore Collection · Read Studio · Save · Contact

UNIVERSAL SAFETY NET (every dead end): back-to-inspiration | bank-the-intent | human-rescue

TYPE PLAYBOOK:
  A (no idea):    slow ramp, protect the spell, Save is the win, plant "this can be made"
  B (rough idea): prove capability via Collections, "like this but mine" on-ramp, kill false-negatives
  C (ready):      pre-answer process/safety BEFORE the ask, 40/60 as protection, human escape hatch
  D (returning):  collapse the funnel, honor the relationship, never treat as a stranger

RULES:
  · Commission CTA appears AFTER appreciation, never in the feed.
  · Never present the primary CTA in isolation — always co-present a lower-commitment move.
  · Trust evidence is pre-positioned one step ahead of need — available, never forced.
  · Nothing is a cart. Nothing locks until the customer approves the design. Deposit is a trust feature.
```

---

## Appendix B — Traceability to source documents

| This document's claim | Source of truth |
| --- | --- |
| Pinterest-first, Inspiration→Order (not Search→Checkout) | `docs/design/DESIGN_VISION.md` §3, §11 |
| Gallery/artwork vocabulary; CTA after appreciation | `DESIGN_VISION.md` §7, §10 |
| Rejected patterns (flash sale, carousel, popups) | `DESIGN_VISION.md` §12 |
| Secure Link, verify email/phone, no design library | `docs/01-PRODUCT-REQUIREMENTS.md` §4 |
| 40% deposit / 60% remaining; server-verified payment | `PRD` §8; `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md` §6, §8 |
| Approval snapshot immutability; revision loop | `docs/06` §4, §9, §10; `PRD` §7 |
| Own-product path (photos + dimensions + location) | `docs/03-USER-JOURNEYS.md` J3; `PRD` §5 |
| Autosave / abandon-and-return | `docs/03` J9 |
| Zalo/Messenger only, no chatbot/unified inbox | `PRD` §11 |
| Lifecycle states used in Project Tracking (future) | `docs/06` §1 |

> Note: This document defines *behavioral* architecture only. It does not redefine IA, screens, or lifecycle. Where behavior and lifecycle meet (post-submit), `docs/06` governs.
