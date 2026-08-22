Apply a spec patch to docs/design-spec.md or docs/product-spec.md.

The patch content follows this command. Apply it exactly — the wording
is deliberate; do not paraphrase, improve, or reformat surrounding text.

House rules, always:
1. Bump the version in the H1 title.
2. Add ONE line to the header HTML comment describing what changed and
   why, in the same voice as the existing changelog lines. Name the
   sections touched.
3. Update the closing "*vX.Y — complete and closed*" line to match.
4. Never leave correction history in the document body. The body reads
   as current law; the header comment carries the history.
5. If the patch contradicts something elsewhere in the document, stop
   and say so before editing — a spec that argues with itself is worse
   than one that is out of date.

Then: run pnpm lint, and commit with the message
"design spec vX.Y — <short summary of changes>".
Do not push; report what changed and let me push.
