# @harvest/lang

The Sprout language: lexer → parser → checker → compiler → resumable, cycle-metered bytecode VM.

- Spec: [`docs/02-language/language-spec.md`](../../docs/02-language/language-spec.md)
- Design: [`docs/03-architecture/interpreter-vm.md`](../../docs/03-architecture/interpreter-vm.md)
- Backlog: `LANG-01` … `LANG-06` (milestone M0)

**Status:** LANG-01 lexer done (`src/lexer/`). Next: LANG-02 parser.

**Purity:** no dependencies, no DOM/Node APIs, no `Date`, `Math.random`, floats or `eval`.
