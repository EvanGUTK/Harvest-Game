import { describe, expect, it } from 'vitest';
import { checkErrors, TEST_OPTIONS } from '../test-support/check-options';
import type { Span } from '../types';

const codes = (text: string): string[] => checkErrors(text).map((d) => d.code);

const span = (line: number, col: number, endLine: number, endCol: number, file = 'main.sprout'): Span => ({
  file,
  line,
  col,
  endLine,
  endCol,
});

describe('E-UNKNOWN-NAME (errors-and-diagnostics.md: "I don\'t know `harvset`. Did you mean `harvest`?")', () => {
  it('suggests the closest known name within distance 2, with a fix-it that replaces it', () => {
    expect(checkErrors('harvset()\n')).toEqual([
      {
        code: 'E-UNKNOWN-NAME',
        severity: 'error',
        range: span(1, 1, 1, 8),
        message: "I don't know `harvset`. Did you mean `harvest`?",
        fix: { label: 'Change to `harvest`', edits: [{ span: span(1, 1, 1, 8), newText: 'harvest' }] },
      },
    ]);
  });

  it('suggests variables, intrinsics and constants too', () => {
    expect(checkErrors('total = 0\nprint(totl)\n')[0]?.message).toBe(
      "I don't know `totl`. Did you mean `total`?",
    );
    expect(checkErrors('lenn([])\n')[0]?.message).toBe("I don't know `lenn`. Did you mean `len`?");
    expect(checkErrors('plant(RADSH)\n')[0]?.message).toBe("I don't know `RADSH`. Did you mean `RADISH`?");
    expect(checkErrors('def f(count):\n    return cout\n')[0]?.message).toBe(
      "I don't know `cout`. Did you mean `count`?",
    );
  });

  it('ranks candidates: the closest wins, then locals, globals and intrinsics in that order', () => {
    expect(checkErrors('total = 0\ndef f(totals):\n    return totl\n')[0]?.message).toBe(
      "I don't know `totl`. Did you mean `total`?",
    );
    expect(checkErrors('ac = 1\ndef f(ab):\n    return aa\n')[0]?.message).toBe(
      "I don't know `aa`. Did you mean `ab`?",
    );
    expect(checkErrors('lex = 1\nprint(lem)\n')[0]?.message).toBe("I don't know `lem`. Did you mean `lex`?");
  });

  it('says only what it does not know when nothing is within distance 2', () => {
    expect(checkErrors('zebra()\n')).toEqual([
      {
        code: 'E-UNKNOWN-NAME',
        severity: 'error',
        range: span(1, 1, 1, 6),
        message: "I don't know `zebra`.",
        help: 'Check the spelling, or give it a value first.',
      },
    ]);
  });

  it('reports every occurrence, in source order', () => {
    expect(checkErrors('a = q\nb = q\n').map((d) => d.range.line)).toEqual([1, 2]);
  });

  it('does not report names bound anywhere in the program, even below their use or in another file', () => {
    expect(codes('def f():\n    return later\nlater = 1\n')).toEqual([]);
    expect(
      checkErrors([
        { name: 'main.sprout', text: 'tend()\n' },
        { name: 'helpers.sprout', text: 'def tend():\n    pass\n' },
      ]),
    ).toEqual([]);
  });

  it('never suggests a locked name', () => {
    const options = {
      ...TEST_OPTIONS,
      lockedNames: new Map([['sell', { kind: 'chapter', chapter: 8 } as const]]),
    };
    expect(checkErrors('selll(RADISH, 1)\n', options)[0]?.message).toBe("I don't know `selll`.");
  });
});

describe('E-RESERVED-NAME (chief ruling 2026-10-11: builtins, intrinsics and constants cannot be bound)', () => {
  it('reports a builtin used as a variable, with the catalogue wording', () => {
    expect(checkErrors('move = 1\n')).toEqual([
      {
        code: 'E-RESERVED-NAME',
        severity: 'error',
        range: span(1, 1, 1, 5),
        message: "`move` is a built-in command, so it can't be used as a name. Pick another name.",
      },
    ]);
  });

  it('says "built-in name" for a game constant', () => {
    expect(checkErrors('RADISH = 3\n')[0]?.message).toBe(
      "`RADISH` is a built-in name, so it can't be used as a name. Pick another name.",
    );
  });

  it('covers every binding site: augmented target, `for` target, def name, parameter and `global` name', () => {
    const source = [
      'len += 1',
      'for EAST in [1]:',
      '    pass',
      'def harvest():',
      '    pass',
      'def f(print):',
      '    global range',
      '',
    ].join('\n');
    expect(checkErrors(source).map((d) => [d.code, d.range.line, d.range.col])).toEqual([
      ['E-RESERVED-NAME', 1, 1],
      ['E-RESERVED-NAME', 2, 5],
      ['E-RESERVED-NAME', 4, 5],
      ['E-RESERVED-NAME', 6, 7],
      ['E-RESERVED-NAME', 7, 12],
    ]);
  });

  it('allows names that merely resemble builtins', () => {
    expect(codes('moves = 1\nradish = 2\n')).toEqual([]);
  });
});

describe('E-BUILTIN-NOT-VALUE (chief ruling 2026-10-11: builtins are not first-class values)', () => {
  it('reports a builtin used without a call, with an example call built from its signature', () => {
    expect(checkErrors('f = plant\n')).toEqual([
      {
        code: 'E-BUILTIN-NOT-VALUE',
        severity: 'error',
        range: span(1, 5, 1, 10),
        message: '`plant` is a command: call it with brackets, like `plant(...)`.',
      },
    ]);
    expect(checkErrors('spawn(halt)\n')[0]?.message).toBe(
      '`halt` is a command: call it with brackets, like `halt()`.',
    );
  });

  it('covers intrinsics and every value position', () => {
    expect(codes('print(len)\nx = [abs]\nif move:\n    pass\n')).toEqual([
      'E-BUILTIN-NOT-VALUE',
      'E-BUILTIN-NOT-VALUE',
      'E-BUILTIN-NOT-VALUE',
    ]);
  });

  it('accepts builtins in call position and user functions as values', () => {
    expect(codes('def tend():\n    harvest()\nspawn(tend)\nf = tend\n')).toEqual([]);
  });
});

describe('E-RANGE-ONLY-IN-FOR (errors-and-diagnostics.md: "`range` can only be used in `for x in range(...)`.")', () => {
  it('reports `range(...)` outside a `for` header, over the whole call', () => {
    expect(checkErrors('r = range(5)\n')).toEqual([
      {
        code: 'E-RANGE-ONLY-IN-FOR',
        severity: 'error',
        range: span(1, 5, 1, 13),
        message: '`range` can only be used in `for x in range(...)`.',
      },
    ]);
  });

  it('covers the catalogue examples, a bare `range`, and a range nested inside a `for` iterable', () => {
    expect(codes('5 in range(10)\n')).toEqual(['E-RANGE-ONLY-IN-FOR']);
    expect(codes('len(range(5))\n')).toEqual(['E-RANGE-ONLY-IN-FOR']);
    expect(codes('f = range\n')).toEqual(['E-RANGE-ONLY-IN-FOR']);
    expect(codes('for x in [range(3)]:\n    pass\n')).toEqual(['E-RANGE-ONLY-IN-FOR']);
  });

  it('accepts `range(...)` as exactly the iterable of a `for`, with names in its arguments still checked', () => {
    expect(codes('for x in range(world_size()):\n    pass\n')).toEqual([]);
    expect(codes('for x in range(nope):\n    pass\n')).toEqual(['E-UNKNOWN-NAME']);
  });
});

describe('E-GLOBAL-AFTER-USE (errors-and-diagnostics.md: "Put `global total` before the first line that uses `total`.")', () => {
  it('reports `global x` below a line of the same def that already uses `x`', () => {
    expect(checkErrors('total = 0\ndef f():\n    print(total)\n    global total\n')).toEqual([
      {
        code: 'E-GLOBAL-AFTER-USE',
        severity: 'error',
        range: span(4, 12, 4, 17),
        message: 'Put `global total` before the first line that uses `total`.',
      },
    ]);
  });

  it('counts assignments and nested blocks as uses', () => {
    expect(codes('def f():\n    if a:\n        n = 1\n    global n\na = 1\n')).toEqual([
      'E-GLOBAL-AFTER-USE',
    ]);
  });

  it('accepts `global` first, a repeated `global`, and module-level `global` anywhere', () => {
    expect(codes('n = 0\ndef f():\n    global n\n    global n\n    n += 1\n')).toEqual([]);
    expect(codes('n = 0\nglobal n\n')).toEqual([]);
  });

  it('does not mix up two defs', () => {
    expect(codes('n = 0\ndef f():\n    print(n)\ndef g():\n    global n\n    n = 1\n')).toEqual([]);
  });
});

describe('E-DUPLICATE-PARAM (chief ruling 2026-10-12: a parameter name may appear only once in a def)', () => {
  it('reports the repeated parameter with the catalogue wording', () => {
    expect(checkErrors('def f(a, b, a):\n    return a\n')).toEqual([
      {
        code: 'E-DUPLICATE-PARAM',
        severity: 'error',
        range: span(1, 13, 1, 14),
        message: '`a` is listed twice in the parameters of `f`. Give each parameter a different name.',
      },
    ]);
  });

  it('accepts distinct parameters, and the same name in two different defs', () => {
    expect(codes('def f(a, b):\n    pass\ndef g(a):\n    pass\n')).toEqual([]);
  });
});

describe('E-GLOBAL-PARAM (chief ruling 2026-10-12: a parameter cannot be declared global in its own def)', () => {
  it('reports the name inside the `global` statement, instead of E-GLOBAL-AFTER-USE', () => {
    expect(checkErrors('x = 0\ndef f(x):\n    global x\n')).toEqual([
      {
        code: 'E-GLOBAL-PARAM',
        severity: 'error',
        range: span(3, 12, 3, 13),
        message:
          "`x` is a parameter of `f`, so it can't be declared `global`. Rename the parameter or drop the `global` line.",
      },
    ]);
  });

  it('reports only E-GLOBAL-PARAM when the parameter was also used before the `global` line', () => {
    expect(checkErrors('def f(x):\n    print(x)\n    global x\n').map((d) => [d.code, d.range])).toEqual([
      ['E-GLOBAL-PARAM', span(3, 12, 3, 13)],
    ]);
  });

  it('leaves `global` of a non-parameter alone', () => {
    expect(codes('n = 0\ndef f(x):\n    global n\n    n = x\n')).toEqual([]);
  });
});
