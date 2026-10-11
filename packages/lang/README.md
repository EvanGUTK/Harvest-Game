# @harvest/lang

The Sprout language: lexer → parser → checker → compiler → resumable, cycle-metered bytecode VM.

- Spec: [`docs/02-language/language-spec.md`](../../docs/02-language/language-spec.md)
- Design: [`docs/03-architecture/interpreter-vm.md`](../../docs/03-architecture/interpreter-vm.md)
- Backlog: `LANG-01` … `LANG-06` (milestone M0)

- **Hashing:** `fnv1a32Bytes`, `fnv1a32Ascii`, `fnv1a32Words` (FNV-1a, 32-bit; `FNV1A_OFFSET_BASIS`, `FNV1A_PRIME`, `HashInputError`). The `lang` goldens hash UTF-8 bytes with it; `sim` imports it for PRNG stream ids and the state hash (`lang` cannot import `sim`).
- **Integer math:** `floorDiv`, `floorMod` (`src/int-math.ts`, Python floor semantics; the one module where lint allows `/`). Invariant violations throw `InvariantError` with a stable `code`.

**Status:** LANG-01 lexer done (`src/lexer/`). LANG-02 parser in progress (`src/parser/`). Next: LANG-05 value model.

**Purity:** no dependencies, no DOM/Node APIs, no `Date`, `Math.random`, floats or `eval`.

## Parser (LANG-02)

```ts
import { parse, DEFAULT_LIMITS } from '@harvest/lang';

const { program, diagnostics, nodeCount } = parse(files, DEFAULT_LIMITS);
```

- `parse(files: SourceFiles, limits: Limits): ParseResult` lexes and parses every file. It never throws.
- `program.files` is in **run order**: every file except `main.sprout` in the given order, then `main.sprout` last (language-spec §Files). Every span carries its own file's name.
- `diagnostics` holds the lexer's and the parser's diagnostics, ordered by file (run order), then line, then column. Compile a program only when none of them has `severity: 'error'`. The AST holds only well-formed nodes: a statement the parser cannot repair is reported and dropped. Obvious repairs (`/` read as `//`) are reported and parsed as repaired.
- `nodeCount` is the number of AST nodes under the counting rule in `src/parser/ast.ts`. The editor shows it as `nodes / maxAstNodes`.
- AST node types (`Program`, `FileNode`, `Statement`, `Expression`, each node kind, `AstNode`) are exported from `src/index.ts`. Every node is a plain readonly object with a `type` discriminant and a `span`. A comparison chain such as `0 <= x < 8` is a single `CompareExpr` with ordered `operands` and `operators`.
- Expression nesting is capped by `limits.maxExpressionDepth` (`E-TOO-DEEP`), so deeply bracketed input gets a diagnostic, not a stack overflow.
- Error recovery: a bad statement is reported once and skipped to the end of its line, and a compound statement with a broken header still has its block parsed. `E-MISSING-COLON`, `E-ASSIGN-IN-IF` and `E-SLASH-DIVISION` carry fix-its and are parsed as repaired. Limits come only from the `limits` argument: `maxNesting` (blocks), `maxExpressionDepth` and `maxAstNodes` (`E-PROGRAM-TOO-BIG`, all files together).
