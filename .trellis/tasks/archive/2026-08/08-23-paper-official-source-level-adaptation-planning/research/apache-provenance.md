# Research: Apache-2.0 Derivative and Provenance Boundary

- Query: What obligations apply if Ameow copies or modifies Paper Heatmap source?
- Scope: upstream license/package metadata plus repository distribution practice
- Date: 2026-08-23

## Upstream Facts

- `@paper-design/shaders@0.0.80` and `@paper-design/shaders-react@0.0.80` declare `Apache-2.0`.
- Published source revision: `60467401863c1917dd02016d0c1ff2f791d0b3c8`.
- License: <https://github.com/paper-design/shaders/blob/60467401863c1917dd02016d0c1ff2f791d0b3c8/LICENSE>.
- NOTICE in the published packages states:

```text
Paper Shaders
Copyright 2026 Paper

Powered by Paper Shaders:
https://shaders.paper.design
```

## Mandatory When a Derivative Is Distributed

Apache-2.0 section 4 requires:

1. Give recipients a copy of Apache-2.0.
2. Put a prominent notice in every modified upstream-derived file stating that Ameow changed it.
3. Retain applicable copyright, patent, trademark, and attribution notices from upstream source form.
4. Reproduce applicable upstream NOTICE attribution in a readable third-party notice location.
5. Do not imply trademark rights or Paper endorsement; Apache-2.0 grants only customary descriptive use of names required for origin/NOTICE.

For this repository, the minimum distribution handling is:

- retain Ameow's MIT license unchanged;
- keep the Apache-2.0 text and Paper NOTICE in `THIRD_PARTY_NOTICES.md` or another shipped/readable third-party-license surface;
- add a provenance header to each copied derivative file naming Paper, upstream path, version/commit, retrieval date, and a prominent description of Ameow's modification;
- identify the Lab module as Paper-derived rather than “official” after modification.

If the experiment never leaves a private local checkout, redistribution duties may not yet be triggered. Committing/pushing it to a repository or shipping it in an artifact should be treated as distribution and should satisfy the duties before review.

## Conditional Boundaries

- Existing upstream notices must be retained only when they pertain to the copied portion, but the Paper NOTICE plainly pertains to the Heatmap source.
- Source files at the pinned revision do not carry a per-file copyright block. Section 4(c) requires retaining existing notices; it does not require inventing a new upstream copyright statement. The modified-file/provenance header remains required/recommended as described above.
- Apache-2.0 permits Ameow to license its own modifications or the larger work differently, provided the upstream Work remains distributed under compliant terms.

## Recommended Provenance Hygiene

- Record package/version, npm `gitHead`, npm integrity, upstream URL/path, and retrieval date.
- Keep an automated upstream-versus-local diff assertion that permits only the provenance/import plumbing and the one domain-selector expression.
- Keep derivative files isolated under the Browser Lab boundary and out of Production bundles.
- Record the exact semantic diff in `THIRD_PARTY_NOTICES.md`.
- Re-audit if the prototype changes more than the single selector, upgrades Paper, or copies additional source files.

This is engineering compliance planning, not legal advice.

