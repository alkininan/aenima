---
paths:
  - "src/lib/scoring/**"
---

# The scoring engine

Rules about the run that turns an artifact and a rubric into a score.

- Normalize with NFC and never NFKC: compatibility normalization rewrites `10⁵` into `105`, which would certify a paraphrase as a verbatim quote. — "NFC, never NFKC."
- Everything reaching the model is versioned, and `PROTOCOL_VERSION` is a digest over the protocol and the three renderers rather than a number someone remembers to type. — "the version is computed rather than typed"
- Bump `PROTOCOL_RELEASE` on any protocol edit that is not a typo: a needless bump costs one re-score, and a missing one costs two incomparable numbers with nothing to tell them apart. — "Bump it on any protocol edit that is not a typo"
- A run may only touch gaps in its own rubric's id space, or scoring the PRD finds no verdict for a design-pack gap and closes it as no longer applicable. — "A run may only touch gaps in its own rubric's id space."
- Run, verdicts, gap moves, ledger and the cleared retry are one transaction, so no-partial-gaps is a `BEGIN` rather than a discipline. — "The whole write is one transaction"
- Re-check law 7 in the WHERE clause rather than trusting the snapshot: both gap updates carry `and disposition = 'open'`, because a human can accept a gap between the read and the write. — "Law 7 is re-checked in the WHERE clause, not trusted from the read."
- A cached run is re-sorted into pack order on the way out, because `check_id` sorts `prd-10` before `prd-2` and the database cannot know a pack's order. — "A cached run is re-sorted into pack order on the way out."
- The fabrication guard runs on the quote the model actually sent, before any clipping: a prefix of an invented sentence is still invented. — "The guard still runs on the quote the model actually sent"
- Every emphasis fold is a pairing rule with flanked edges, so a marker is removed only where it really is a delimiter and `2**5` never folds to `25`. — "A marker is only typesetting when it is really a delimiter."
