# @harvest/lang

The Sprout language: lexer → parser → checker → compiler → resumable, cycle-metered bytecode VM.

- Spec: [`docs/02-language/language-spec.md`](../../docs/02-language/language-spec.md)
- Design: [`docs/03-architecture/interpreter-vm.md`](../../docs/03-architecture/interpreter-vm.md)
- Backlog: `LANG-01` … `LANG-06` (milestone M0)

- **Hashing:** `fnv1a32Bytes`, `fnv1a32Ascii`, `fnv1a32Words` (FNV-1a, 32-bit; `FNV1A_OFFSET_BASIS`, `FNV1A_PRIME`, `HashInputError`). The `lang` goldens hash UTF-8 bytes with it; `sim` imports it for PRNG stream ids and the state hash (`lang` cannot import `sim`).

**Status:** LANG-01 lexer done (`src/lexer/`). Next: LANG-02 parser.

**Purity:** no dependencies, no DOM/Node APIs, no `Date`, `Math.random`, floats or `eval`.
