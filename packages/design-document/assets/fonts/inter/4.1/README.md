# Inter v4.1 — controlled font assets (APP3-F01)

Controlled font data for the Design Document font registry. These are the only
font binaries this repository controls; nothing else may be treated as a
controlled font.

## What this directory is for

`APP3-G04` / `IMP-D044` PO-10 locks that a Design Document stores a server-owned
`fontId` and never a CSS family, a URL or font bytes. The `fontId` resolves
through a versioned registry that must name an approved family, approved styles
and weights, a **controlled** WOFF2 asset, a SHA-256 integrity value, licence
metadata, Vietnamese glyph coverage and a fallback policy.

The first `APP3-P01` attempt stopped because none of that existed: the repository
had no font binary, no licence artifact, no integrity baseline and no coverage
evidence. `APP3-F01` supplies exactly those, and nothing else. The TypeScript
runtime registry is still `APP3-P01`'s to write.

## Provenance

| Item | Value |
| --- | --- |
| Family | Inter |
| Upstream | <https://github.com/rsms/inter> |
| Tag | `v4.1` |
| Resolved commit | `e3a3d4c57d5ecc01453a575621882a384c1995a3` |
| Licence | SIL Open Font License 1.1 (`OFL-1.1`) |
| Licence file | [`LICENSE.txt`](./LICENSE.txt) |
| Provenance manifest | [`FONT-PROVENANCE.json`](./FONT-PROVENANCE.json) |
| Coverage manifest | [`VIETNAMESE-COVERAGE.json`](./VIETNAMESE-COVERAGE.json) |

Acquired by cloning the pinned tag directly from the official upstream
repository. The clone was verified to sit at tag `v4.1` with a clean working
tree and the official `origin` remote, and was deleted before the commit. No
file came from a CDN, a mirror, an unpinned URL, `node_modules`, or a
system font directory.

## Files

| File | Style | Weight range | SHA-256 | Bytes |
| --- | --- | --- | --- | --- |
| `InterVariable.woff2` | normal | 100–900 | `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` | 352 240 |
| `InterVariable-Italic.woff2` | italic | 100–900 | `e564f652916db6c139570fefb9524a77c4d48f30c92928de9db19b6b5c7a262a` | 387 976 |

Both are variable WOFF2 files carrying a `wght` axis from 100 to 900. Inter
ships italic as a **separate file** rather than as an `ital` axis, so italic
identity is carried by the `OS/2` `fsSelection` and `head` `macStyle` italic
bits and the `Italic` name subfamily — set on the italic file, clear on the
upright one.

**The binaries are byte-identical to upstream.** They have not been re-encoded,
subset, renamed or otherwise modified, and must not be. `FONT-PROVENANCE.json`
records the hash of what is committed; changing a byte invalidates it, and
`node tools/check-app3-f01-font-assets.mjs` fails.

## Licence

Redistributed under the **SIL Open Font License 1.1**, the exact upstream
`LICENSE.txt` from tag `v4.1`, copied verbatim and never rewritten or
summarised in place.

- The font files are **redistributed with the software**, not offered on their
  own.
- The files **may not be sold by themselves**.
- The **Reserved Font Name** remains **Inter**; a modified version may not use
  it. This repository has **not modified the font binaries**, so the name stays
  correct.
- The `APP3-P01` registry must reference the committed licence **path**, not
  merely the SPDX string, so the licence travels with the asset.

This README records licence facts and provenance. It is not legal advice, and
this checkpoint claims no licence exception of any kind.

## Vietnamese coverage

Coverage was **measured from the committed bytes**, by reading the real `cmap`
tables — not inferred from the family name, a CSS fallback list, an upstream
claim, a filename or a unicode-range comment.

- Required repertoire: **156** code points — the Vietnamese letters, the six
  vowel bases (`Ă Â Ê Ô Ơ Ư` and lowercase), `Đ`/`đ` (`U+0110`/`U+0111`), the
  eight combining marks canonical decomposition needs (`U+0300`, `U+0301`,
  `U+0302`, `U+0303`, `U+0306`, `U+0309`, `U+031B`, `U+0323`), and every
  assigned code point in `U+1EA0..U+1EF9`.
- Result: **156 / 156 covered, zero missing, in both files.**
- Verified with `fonttools` 4.55.3 on Python 3.11.8, in a throwaway environment
  outside every tracked path, removed afterwards. No package was installed into
  a workspace and no dependency was added to the repository.

A code point counts as covered only when a Unicode `cmap` subtable **in this
file** maps it to a glyph. Fallback coverage from some other installed font is
not coverage, and parsing the file rather than rendering it is what makes that
guarantee real.

## Boundary

- The canonical source of this font lives **here**, with the registry authority
  that governs it. A rendering application may later copy or bundle it through
  an explicit package consumer; it may not become a second source of truth.
- Fonts are **not** Design Document assets. They do not consume the 20-asset or
  decoded-pixel budgets.
- No font bytes and no font URL ever enter a Design Document.
- `packages/styles/src/settings/_typography.scss` is **UI styling authority**
  and is untouched by this checkpoint. Its CSS family stack may legitimately
  name General Sans and Inter as browser-resolved fallbacks; that is a different
  question from which font a Design Document may reference. **General Sans is
  not controlled.**
