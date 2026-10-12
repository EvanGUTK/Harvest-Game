import { describe, expect, it } from 'vitest';
import { CORPUS } from '../test-support/corpus';
import { checkSources } from '../test-support/check-options';
import type { Span } from '../types';

const codes = (text: string): string[] => checkSources(text).map((d) => d.code);

const span = (line: number, col: number, endLine: number, endCol: number): Span => ({
  file: 'main.sprout',
  line,
  col,
  endLine,
  endCol,
});

const corpus = (name: string): string => {
  const file = CORPUS.find((f) => f.name === name);
  if (file === undefined) throw new Error(`no corpus file ${name}`);
  return file.text;
};

describe('the recommended programs check clean (interpreter-vm.md §Checker: the starter must not warn)', () => {
  it('gives the starter showdown program (standard-library.md) no diagnostics at all', () => {
    expect(checkSources(corpus('starter-showdown.sprout'))).toEqual([]);
  });

  it('gives the spec example (language-spec.md §Example) no diagnostics at all', () => {
    expect(checkSources(corpus('spec-example.sprout'))).toEqual([]);
  });
});

describe('W-UNREACHABLE (errors-and-diagnostics.md: "This code will never run because the loop above has no `break` to leave it.")', () => {
  it('warns once at the first statement after a `while True:` with no `break`', () => {
    expect(checkSources('while True:\n    move(EAST)\nharvest()\nharvest()\n')).toEqual([
      {
        code: 'W-UNREACHABLE',
        severity: 'warning',
        range: span(3, 1, 3, 10),
        message: 'This code will never run because the loop above has no `break` to leave it.',
      },
    ]);
  });

  it('says the loop has no `break` even when it can still return or halt, which is why the code is unreachable', () => {
    const lines = checkSources(
      'def f():\n    while True:\n        if crop():\n            return 1\n    harvest()\nf()\n',
    );
    expect(lines.map((d) => [d.code, d.range.line, d.message])).toEqual([
      ['W-UNREACHABLE', 5, 'This code will never run because the loop above has no `break` to leave it.'],
    ]);
  });

  it('does not warn when a `break` leaves the loop, but does when the only `break` belongs to an inner loop', () => {
    expect(codes('while True:\n    if crop():\n        break\nharvest()\n')).toEqual([]);
    expect(codes('while True:\n    while crop():\n        break\n    move(EAST)\nharvest()\n')).toEqual([
      'W-UNREACHABLE',
    ]);
  });

  it('warns after `return`, `break` and `continue` in the same block', () => {
    const source = [
      'def f():',
      '    return 1',
      '    harvest()',
      'while crop():',
      '    break',
      '    harvest()',
      'for i in range(3):',
      '    continue',
      '    harvest()',
      '',
    ].join('\n');
    expect(checkSources(source).map((d) => [d.code, d.range.line, d.message])).toEqual([
      ['W-UNREACHABLE', 3, 'This code will never run because `return` above always leaves this block.'],
      ['W-UNREACHABLE', 6, 'This code will never run because `break` above always leaves this block.'],
      ['W-UNREACHABLE', 9, 'This code will never run because `continue` above always leaves this block.'],
    ]);
  });

  it('only looks at the same block: code after an `if` that returns is reachable', () => {
    expect(codes('def f():\n    if crop():\n        return 1\n    harvest()\nf()\n')).toEqual([]);
  });
});

describe('W-PURE-INFINITE-LOOP (errors-and-diagnostics.md: "This loop never ends and never touches the farm…")', () => {
  it('warns at the `while` of a `while True:` loop that only computes', () => {
    expect(checkSources('n = 0\nwhile True:\n    n = n + 1\n')).toEqual([
      {
        code: 'W-PURE-INFINITE-LOOP',
        severity: 'warning',
        range: span(2, 1, 2, 6),
        message:
          'This loop never ends and never touches the farm, so it will use up all your cycles doing nothing.',
      },
    ]);
  });

  it('does not warn when the loop breaks, returns, halts or calls an action or sensor', () => {
    expect(codes('while True:\n    if crop():\n        break\n')).toEqual([]);
    expect(codes('def f():\n    while True:\n        return 1\nf()\n')).toEqual([]);
    expect(codes('while True:\n    halt()\n')).toEqual([]);
    expect(codes('while True:\n    move(EAST)\n')).toEqual([]);
    expect(codes('while True:\n    if is_ripe():\n        pass\n')).toEqual([]);
  });

  it('follows user functions transitively over the static call graph', () => {
    const touches = 'def a():\n    b()\ndef b():\n    harvest()\nwhile True:\n    a()\n';
    expect(codes(touches)).toEqual([]);
    const pure = 'def a():\n    return b()\ndef b():\n    return 1 + 2\nwhile True:\n    a()\n';
    expect(codes(pure)).toEqual(['W-PURE-INFINITE-LOOP']);
  });

  it('survives recursion in the call graph', () => {
    expect(codes('def a():\n    a()\nwhile True:\n    a()\n')).toEqual(['W-PURE-INFINITE-LOOP']);
  });

  it('treats a `return` inside a called function as not leaving the loop', () => {
    expect(codes('def a():\n    return 1\nwhile True:\n    a()\n')).toEqual(['W-PURE-INFINITE-LOOP']);
  });

  it('assumes a call it cannot resolve statically might touch the farm', () => {
    expect(codes('def a():\n    harvest()\nf = a\nwhile True:\n    f()\n')).toEqual([]);
  });

  it('counts only world-touching builtins: `random()` alone is still pure', () => {
    expect(codes('while True:\n    random(6)\n')).toEqual(['W-PURE-INFINITE-LOOP']);
  });

  it('only applies to `while True:`', () => {
    expect(codes('n = 0\nwhile n < 3:\n    n += 1\n')).toEqual([]);
  });
});

describe('W-USE-BEFORE-DEF (errors-and-diagnostics.md: "`tend` isn\'t defined yet at this line. Move the `def` above.")', () => {
  it('warns at a top-level use above the def', () => {
    expect(checkSources('tend()\ndef tend():\n    harvest()\n')).toEqual([
      {
        code: 'W-USE-BEFORE-DEF',
        severity: 'warning',
        range: span(1, 1, 1, 5),
        message: "`tend` isn't defined yet at this line. Move the `def` above.",
      },
    ]);
  });

  it('covers top-level blocks and run order across files', () => {
    expect(codes('while crop():\n    tend()\ndef tend():\n    harvest()\n')).toEqual(['W-USE-BEFORE-DEF']);
    const files = [
      { name: 'main.sprout', text: 'tend()\n' },
      { name: 'helpers.sprout', text: 'def tend():\n    harvest()\n' },
    ];
    expect(checkSources(files)).toEqual([]);
  });

  it('does not warn inside a def body, which runs only when called', () => {
    expect(codes('def a():\n    b()\ndef b():\n    harvest()\na()\n')).toEqual([]);
  });
});

describe('W-UNUSED-VAR (errors-and-diagnostics.md: hint)', () => {
  it('hints at a variable that is given a value but never read', () => {
    expect(checkSources('def f():\n    total = 0\nf()\n')).toEqual([
      {
        code: 'W-UNUSED-VAR',
        severity: 'hint',
        range: span(2, 5, 2, 10),
        message: '`total` is given a value but never used.',
      },
    ]);
    expect(codes('spare = 1\n')).toEqual(['W-UNUSED-VAR']);
  });

  it('does not count `x += 1` as a use of `x`', () => {
    expect(codes('count = 0\ncount += 1\n')).toEqual(['W-UNUSED-VAR']);
  });

  it('does not hint at variables that are read, loop counters, parameters or `_` names', () => {
    expect(codes('total = 0\nprint(total)\n')).toEqual([]);
    expect(codes('for i in range(3):\n    move(EAST)\n')).toEqual([]);
    expect(codes('def f(unused):\n    pass\nf(1)\n')).toEqual([]);
    expect(codes('_ = 1\n_ignored = 2\n')).toEqual([]);
  });

  it('counts a read in any file or function as a use of a global', () => {
    expect(codes('limit = 3\ndef f():\n    return limit\nf()\n')).toEqual([]);
  });
});
