/**
 * `APP3-G06` — the event, payload and staging half of the gate.
 *
 * Split out of `check-app3-g06.mjs` for the 400-line limit, the same way
 * `check-app3-g05-transform.mjs` sits beside `check-app3-g05.mjs`.
 *
 * Everything here is an **absence** check, and that is the point. A ruling that
 * says "one new event, existing architecture" is only worth something while the
 * cheaper alternatives stay refused: a sweep, a second queue, a profile flag in
 * the payload, a sanitizer chosen in passing, or SVG quietly disappearing from
 * scope because nothing can implement it yet. Each of those would make the next
 * checkpoint easier and would undo the reason this one exists.
 *
 * Read-only, cross-platform pure Node.
 */

/** Architectures IMP-D046 PO-01 refuses, by the words a document would use. */
const FORBIDDEN_ARCHITECTURE = Object.freeze([
  'second queue',
  'polling sweep',
  'second claim table',
  'second retry framework',
  'cron reconciler',
  'second scheduler',
]);

/** Payload fields PO-02 forbids, by their exact wire names. */
const FORBIDDEN_PAYLOAD_FIELDS = Object.freeze([
  'processingProfile',
  'ownershipClaim',
  'storageKey',
  'sessionSecret',
  'customerId',
]);

/** The exact association → profile mapping PO-03 locks. */
const PROFILE_MAPPING = Object.freeze({
  PRODUCT_SIDE_BACKGROUND: 'SIDE_BACKGROUND',
  DESIGN_TEMPLATE_ASSET: 'TEMPLATE_ASSET',
  DESIGN_SESSION_ASSET: 'SESSION_UPLOAD',
});

/** Sanitizer packages that must not be selected before `APP3-G07`. */
const SANITIZER_PACKAGES = Object.freeze([
  'dompurify',
  'svgo',
  'sanitize-svg',
  'xmldom',
  'svg-sanitizer',
]);

/**
 * Every event/payload/staging invariant, as failures pushed onto `fail`.
 *
 * `sources` carries the already-read texts so the caller keeps one set of file
 * reads: `phase`, `register`, `security`, `nfr`, `audit` and the `files` map for
 * message prefixes.
 */
export function checkNormalizationEvents(sources, fail) {
  checkEventVocabulary(sources, fail);
  checkPayloadShape(sources, fail);
  checkProducerAndProfile(sources, fail);
  checkStaging(sources, fail);
}

/** 3, 4, 5, 11 — one new event, the old one untouched, no new architecture. */
function checkEventVocabulary({ phase, register, files }, fail) {
  const authority = `${phase}\n${register}`;

  if (!authority.includes('asset.normalization.requested')) {
    fail(`${files.phase}: the new normalization event is not named`);
  }
  // The accepted APP2 event must still be described as unchanged, not reused.
  if (
    !/asset\.inspection\.requested[^.]{0,200}(unchanged|never repurposed|untouched)/s.test(
      authority,
    )
  ) {
    fail(`${files.phase}: the ruling does not state that asset.inspection.requested is unchanged`);
  }
  for (const claim of ['repurpose asset.inspection.requested', 'overload asset.inspection']) {
    if (authority.toLowerCase().includes(claim.toLowerCase())) {
      fail(`${files.phase}: the ruling appears to repurpose the inspection event`);
    }
  }

  // Exactly one new event: a second `asset.*.requested` name would be a second
  // dispatch family wearing this decision's approval.
  const events = new Set(
    [...authority.matchAll(/`(asset\.[a-z.]+\.requested)`/g)].map((match) => match[1]),
  );
  events.delete('asset.inspection.requested');
  events.delete('asset.normalization.requested');
  for (const extra of events) {
    fail(`${files.phase}: "${extra}" is a second new event this decision never authorized`);
  }

  for (const architecture of FORBIDDEN_ARCHITECTURE) {
    // Named only inside a refusal; an authority that *proposed* one would read
    // affirmatively, so the word must never appear without its negation nearby.
    const pattern = new RegExp(`(?<!not |never |no )\\b${architecture}\\b`, 'i');
    const sentences = authority.split(/(?<=[.;])\s+/).filter((s) => pattern.test(s));
    for (const sentence of sentences) {
      if (!/\b(not|never|no|refus|forbid|rather than|instead of)\b/i.test(sentence)) {
        fail(`${files.phase}: "${architecture}" appears without a refusal`);
      }
    }
  }
}

/** 6, 7 — the payload names the association and claims nothing else. */
function checkPayloadShape({ phase, register, files }, fail) {
  const authority = `${phase}\n${register}`;

  for (const field of ['assetId', 'normalizationPolicyVersion', 'associationRef']) {
    if (!authority.includes(field)) {
      fail(`${files.phase}: the normalization payload does not carry \`${field}\``);
    }
  }
  for (const reference of ['productSideId', 'designTemplateAssetId', 'designSessionAssetId']) {
    if (!authority.includes(reference)) {
      fail(`${files.phase}: the association reference \`${reference}\` is missing`);
    }
  }
  for (const field of FORBIDDEN_PAYLOAD_FIELDS) {
    // Present only as something the payload must never carry.
    const sentences = authority
      .split(/(?<=[.;])\s+/)
      .filter((sentence) => sentence.includes(field));
    for (const sentence of sentences) {
      if (!/\b(never|not|no|forbid|must not|without)\b/i.test(sentence)) {
        fail(`${files.phase}: the payload appears to carry \`${field}\``);
      }
    }
  }
  if (
    !/payload[^.]{0,120}never[^.]{0,120}profile|never[^.]{0,120}profile[^.]{0,160}payload/is.test(
      authority,
    )
  ) {
    fail(`${files.phase}: the ruling does not forbid a profile in the payload`);
  }
}

/** 8, 9, 10, 13 — mapping, transactional producer, and no association scan. */
function checkProducerAndProfile({ phase, register, files }, fail) {
  const authority = `${phase}\n${register}`;

  for (const [reference, profile] of Object.entries(PROFILE_MAPPING)) {
    const mapped = new RegExp(`${reference}[^.]{0,40}(→|->)[^.]{0,40}${profile}`);
    if (!mapped.test(authority)) {
      fail(`${files.phase}: the mapping ${reference} → ${profile} is missing`);
    }
  }
  if (!/same (database )?transaction/i.test(authority)) {
    fail(`${files.phase}: the producer append is not bound to the association transaction`);
  }
  if (!/rolled[- ]back association[^.]{0,80}no visible event|no visible event/i.test(authority)) {
    fail(`${files.phase}: a rolled-back association is not stated to emit nothing`);
  }
  for (const rule of ['on a read', 'no-op', 'original upload']) {
    if (!authority.toLowerCase().includes(rule)) {
      fail(`${files.phase}: the "no event ${rule}" rule is missing`);
    }
  }
  // The refusal, not the mention: `scans an Asset's associations` on its own is
  // exactly what a document proposing the behaviour would also say.
  if (!/never scans?[\s\S]{0,80}associations?/i.test(authority)) {
    fail(`${files.phase}: the ruling does not forbid scanning an Asset's associations`);
  }
  if (!/lookup key,? (but )?not (an )?authoriz/i.test(authority)) {
    fail(`${files.phase}: the discriminator is not stated to be a lookup key, not authorization`);
  }
}

/** 12, 14, 15, 16, 17, 18 — the split, the staging, and the owners. */
function checkStaging({ phase, register, security, nfr, audit, files }, fail) {
  const authority = `${phase}\n${register}`;

  for (const checkpoint of ['APP3-W01A', 'APP3-W01B', 'APP3-G07', 'APP3-B01N']) {
    if (!authority.includes(checkpoint)) {
      fail(`${files.phase}: the replan does not name ${checkpoint}`);
    }
  }
  if (!/REPLANNED[ —-]+REPLACED_BY_APP3-W01A_AND_APP3-W01B/.test(authority)) {
    fail(`${files.phase}: APP3-W01 is not recorded as replanned into W01A and W01B`);
  }
  if (/APP3-W01\s*=\s*COMPLETE/.test(authority)) {
    fail(`${files.phase}: the failed APP3-W01 is recorded complete`);
  }

  // W01A is raster-only, and SVG is staged rather than deleted.
  if (!/W01A[^.]{0,120}raster[- ]only|raster[- ]only[^.]{0,120}W01A/is.test(authority)) {
    fail(`${files.phase}: W01A is not stated to be raster-only`);
  }
  if (!/authorized[^.]{0,80}(but )?(operationally )?unavailable/i.test(authority)) {
    fail(`${files.phase}: Template SVG is not staged as authorized-but-unavailable`);
  }
  for (const removal of ['SVG is removed from IMP-D044', 'SVG is dropped from scope']) {
    if (authority.includes(removal)) fail(`${files.phase}: SVG was removed from scope`);
  }
  if (!security.includes('APP3-G07')) {
    fail(`${files.security}: the security document does not record the sanitizer owner`);
  }
  if (!/association[- ]bound/i.test(nfr)) {
    fail(`${files.nfr}: the NFR document does not record association-bound normalization`);
  }
  if (!audit.includes('IMP-D046')) {
    fail(`${files.audit}: the pre-implementation audit was not reconciled`);
  }

  // No sanitizer may be selected before G07.
  for (const packageName of SANITIZER_PACKAGES) {
    const chosen = new RegExp(`(select|choose|adopt|use)[^.]{0,60}\`?${packageName}\`?`, 'i');
    if (chosen.test(authority)) {
      fail(`${files.phase}: sanitizer "${packageName}" was selected before APP3-G07`);
    }
  }

  // B01N is a producer, not an endpoint; B06 is not the Product Side owner.
  // `[\s\S]` rather than `[^.]`: the sentence contains
  // `product_sides.background_asset_id`, and a period-excluding class stops dead
  // at the dot in a column name.
  if (!/B01N[\s\S]{0,320}zero[\s\S]{0,80}(HTTP|paths|operations)/i.test(authority)) {
    fail(`${files.phase}: B01N is not stated to add zero HTTP operations`);
  }
  if (/APP3-B02\s*=\s*BLOCKED_BY_APP3-B06/.test(authority)) {
    fail(`${files.phase}: B02 still names B06 as its blocker`);
  }
  if (
    !/B06[^.]{0,160}(not|never)[^.]{0,80}SIDE_BACKGROUND|SIDE_BACKGROUND[^.]{0,120}not[^.]{0,60}B06/is.test(
      authority,
    )
  ) {
    fail(`${files.phase}: B06 is not corrected out of the SIDE_BACKGROUND trigger role`);
  }
}
