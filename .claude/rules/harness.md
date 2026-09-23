---
paths:
  - "scripts/**/*.mjs"
  - ".claude/skills/**/*.md"
---

# Harness

The run's own scripts and skill — `scripts/run/`, `scripts/hooks/`, the `/ticket` skill. Rules the
build paid for about code that reads the board, the repository and the protocol itself. The
protocol is `docs/guidelines.md`; this is what was learned writing the code under it.

- A name is looked up in the git reference, never in the working tree: a checkout can be ahead of the reference, and a name this branch added is not evidence that main has it. — `docs/log/T0.34.md`
- A corpus measurement chooses a script's scope and never establishes its safety: a count says what the documents that exist contain, not what the next one will. — "Where a rule's correctness rests on a measurement, write down what the measurement cannot see."
- A script that reads a document finds the facts; what a fact *means* stays with the reader that has the context to tell two causes apart. — `docs/log/T0.34.md`
- Every run script exports its logic and guards its CLI with `isMain`, because a test that imports the module would otherwise run the command and block on stdin. — `docs/log/T0.9.md`
- A name out of a document reaches a child process as an argument in an array and never as a shell line. — `docs/log/T0.34.md`
