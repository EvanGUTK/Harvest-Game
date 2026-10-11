# @harvest/lang

The Sprout language: lexer → parser → checker → compiler → resumable, cycle-metered bytecode VM.

- Spec: [`docs/02-language/language-spec.md`](../../docs/02-language/language-spec.md)
- Design: [`docs/03-architecture/interpreter-vm.md`](../../docs/03-architecture/interpreter-vm.md)
- Backlog: `LANG-01` … `LANG-06` (milestone M0)

**Status:** LANG-01 lexer done (`src/lexer/`). LANG-02 parser in progress (`src/parser/`).

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
- AST node types (`Program`, `FileNode`, `Statement`, `Expression`, each node kind, `Node`) are exported from `src/index.ts`. Every node is a plain readonly object with a `type` discriminant and a `span`. A comparison chain such as `0 <= x < 8` is a single `CompareExpr` with ordered `operands` and `operators`.
- Expression nesting is capped by `limits.maxExpressionDepth` (`E-TOO-DEEP`), so deeply bracketed input gets a diagnostic, not a stack overflow.
