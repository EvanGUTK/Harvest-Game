import { describe, expect, it } from 'vitest';
import { InvariantError } from '../invariant';
import { compileSources, listing } from '../test-support/compile';
import type { Span } from '../types';

/** The instructions of function 0 without the header line, for compact goldens. */
const body = (text: Parameters<typeof listing>[0]): string[] => listing(text).slice(1);

const span = (line: number, col: number, endLine: number, endCol: number, file = 'main.sprout'): Span => ({
  file,
  line,
  col,
  endLine,
  endCol,
});

describe('compile: literals, names and the module body (interpreter-vm.md §Bytecode, canonical emissions)', () => {
  it('lays out function 0 as every statement in order, ending in HALT', () => {
    expect(listing('x = 1 + 2\nprint(x)\n')).toEqual([
      'fn 0 <module>() locals=0 file=main.sprout',
      '  0000  LINE 0  ; main.sprout:1',
      '  0002  CONST 0  ; 1',
      '  0004  CONST 1  ; 2',
      '  0006  ADD',
      '  0007  STORE_GLOBAL 0  ; x',
      '  0009  LINE 1  ; main.sprout:2',
      '  0011  LOAD_GLOBAL 0  ; x',
      '  0013  CALL_INTRINSIC 6 1  ; print',
      '  0016  POP',
      '  0017  HALT',
    ]);
  });

  it('pools every literal kind once, and game constants by id', () => {
    expect(body('print("hi", True, None, -7, RADISH, "hi")\n')).toEqual([
      '  0000  LINE 0  ; main.sprout:1',
      "  0002  CONST 0  ; 'hi'",
      '  0004  CONST 1  ; True',
      '  0006  CONST 2  ; None',
      '  0008  CONST 3  ; 7',
      '  0010  NEG',
      '  0011  CONST 4  ; RADISH',
      "  0013  CONST 0  ; 'hi'",
      '  0015  CALL_INTRINSIC 6 6  ; print',
      '  0018  POP',
      '  0019  HALT',
    ]);
  });

  it('compiles `not` to NOT and builds lists and dicts from their elements', () => {
    expect(body('x = not [1, {2: 3}]\n')).toEqual([
      '  0000  LINE 0  ; main.sprout:1',
      '  0002  CONST 0  ; 1',
      '  0004  CONST 1  ; 2',
      '  0006  CONST 2  ; 3',
      '  0008  BUILD_DICT 1',
      '  0010  BUILD_LIST 2',
      '  0012  NOT',
      '  0013  STORE_GLOBAL 0  ; x',
      '  0015  HALT',
    ]);
  });

  it('runs files in run order (main.sprout last), one LINE per statement with its own file', () => {
    expect(
      body([
        { name: 'main.sprout', text: 'a = 2\n' },
        { name: 'helpers.sprout', text: 'b = 1\n' },
      ]),
    ).toEqual([
      '  0000  LINE 0  ; helpers.sprout:1',
      '  0002  CONST 0  ; 1',
      '  0004  STORE_GLOBAL 0  ; b',
      '  0006  LINE 1  ; main.sprout:1',
      '  0008  CONST 1  ; 2',
      '  0010  STORE_GLOBAL 1  ; a',
      '  0012  HALT',
    ]);
  });

  it('compiles `pass` to its LINE alone and `global` at the top level to nothing', () => {
    expect(body('pass\nglobal x\nx = 1\n')).toEqual([
      '  0000  LINE 0  ; main.sprout:1',
      '  0002  LINE 1  ; main.sprout:3',
      '  0004  CONST 0  ; 1',
      '  0006  STORE_GLOBAL 0  ; x',
      '  0008  HALT',
    ]);
  });
});

describe('compile: short-circuit and comparisons', () => {
  it('compiles `and` / `or` to keep-jumps that leave the deciding operand', () => {
    expect(body('a = 1\nb = a and 2 or 3\n').slice(3)).toEqual([
      '  0006  LINE 1  ; main.sprout:2',
      '  0008  LOAD_GLOBAL 0  ; a',
      '  0010  JUMP_IF_FALSE_KEEP 14',
      '  0012  CONST 1  ; 2',
      '  0014  JUMP_IF_TRUE_KEEP 18',
      '  0016  CONST 2  ; 3',
      '  0018  STORE_GLOBAL 1  ; b',
      '  0020  HALT',
    ]);
  });

  it('compiles a single comparison to one instruction, and `not in` to IN then NOT', () => {
    expect(body('print(1 < 2, 1 not in [])\n')).toEqual([
      '  0000  LINE 0  ; main.sprout:1',
      '  0002  CONST 0  ; 1',
      '  0004  CONST 1  ; 2',
      '  0006  LT',
      '  0007  CONST 0  ; 1',
      '  0009  BUILD_LIST 0',
      '  0011  IN',
      '  0012  NOT',
      '  0013  CALL_INTRINSIC 6 2  ; print',
      '  0016  POP',
      '  0017  HALT',
    ]);
  });

  it('evaluates each middle operand of a chain once: DUP, ROT3, OP, JUMP_IF_FALSE_KEEP, then SWAP, POP', () => {
    expect(body('x = 5\ny = 0 <= x < 8 <= 9\n').slice(3)).toEqual([
      '  0006  LINE 1  ; main.sprout:2',
      '  0008  CONST 1  ; 0',
      '  0010  LOAD_GLOBAL 0  ; x',
      '  0012  DUP',
      '  0013  ROT3',
      '  0014  LE',
      '  0015  JUMP_IF_FALSE_KEEP 29',
      '  0017  CONST 2  ; 8',
      '  0019  DUP',
      '  0020  ROT3',
      '  0021  LT',
      '  0022  JUMP_IF_FALSE_KEEP 29',
      '  0024  CONST 3  ; 9',
      '  0026  LE',
      '  0027  JUMP 31',
      '  0029  SWAP',
      '  0030  POP',
      '  0031  STORE_GLOBAL 1  ; y',
      '  0033  HALT',
    ]);
  });
});

describe('compile: assignment', () => {
  it('compiles `x op= v` to LOAD, v, op, STORE', () => {
    expect(body('n = 1\nn -= 2\n').slice(3)).toEqual([
      '  0006  LINE 1  ; main.sprout:2',
      '  0008  LOAD_GLOBAL 0  ; n',
      '  0010  CONST 1  ; 2',
      '  0012  SUB',
      '  0013  STORE_GLOBAL 0  ; n',
      '  0015  HALT',
    ]);
  });

  it('compiles `a[i] = v` to a, i, v, INDEX_SET and `a[i] op= v` with DUP2 so a and i run once', () => {
    expect(body('g = [1, 2]\ng[1] = 4\ng[0] += 3\n').slice(5)).toEqual([
      '  0010  LINE 1  ; main.sprout:2',
      '  0012  LOAD_GLOBAL 0  ; g',
      '  0014  CONST 0  ; 1',
      '  0016  CONST 2  ; 4',
      '  0018  INDEX_SET',
      '  0019  LINE 2  ; main.sprout:3',
      '  0021  LOAD_GLOBAL 0  ; g',
      '  0023  CONST 3  ; 0',
      '  0025  DUP2',
      '  0026  INDEX_GET',
      '  0027  CONST 4  ; 3',
      '  0029  ADD',
      '  0030  INDEX_SET',
      '  0031  HALT',
    ]);
  });
});

describe('compile: if / elif / else', () => {
  it('tests each branch after its own LINE and skips the rest; the last branch has no JUMP', () => {
    expect(body('n = 0\nif n:\n    n = 1\nelif n == 2:\n    pass\nelse:\n    n = 3\n').slice(3)).toEqual([
      '  0006  LINE 1  ; main.sprout:2',
      '  0008  LOAD_GLOBAL 0  ; n',
      '  0010  JUMP_IF_FALSE 20',
      '  0012  LINE 2  ; main.sprout:3',
      '  0014  CONST 1  ; 1',
      '  0016  STORE_GLOBAL 0  ; n',
      '  0018  JUMP 39',
      '  0020  LINE 3  ; main.sprout:4',
      '  0022  LOAD_GLOBAL 0  ; n',
      '  0024  CONST 2  ; 2',
      '  0026  EQ',
      '  0027  JUMP_IF_FALSE 33',
      '  0029  LINE 4  ; main.sprout:5',
      '  0031  JUMP 39',
      '  0033  LINE 5  ; main.sprout:7',
      '  0035  CONST 3  ; 3',
      '  0037  STORE_GLOBAL 0  ; n',
      '  0039  HALT',
    ]);
  });

  it('jumps straight to the end when the last branch fails and there is no else', () => {
    expect(body('if True:\n    pass\n')).toEqual([
      '  0000  LINE 0  ; main.sprout:1',
      '  0002  CONST 0  ; True',
      '  0004  JUMP_IF_FALSE 8',
      '  0006  LINE 1  ; main.sprout:2',
      '  0008  HALT',
    ]);
  });
});

describe('compile: loops and their exits', () => {
  it('compiles `while` literally (no constant folding), with break as JUMP Lend and continue as JUMP Ltop', () => {
    expect(body('while True:\n    if random(2):\n        break\n    continue\n')).toEqual([
      '  0000  LINE 0  ; main.sprout:1',
      '  0002  CONST 0  ; True',
      '  0004  JUMP_IF_FALSE 27',
      '  0006  LINE 1  ; main.sprout:2',
      '  0008  CONST 1  ; 2',
      '  0010  CALL_HOST 4 1 2 0',
      '  0015  JUMP_IF_FALSE 21',
      '  0017  LINE 2  ; main.sprout:3',
      '  0019  JUMP 27',
      '  0021  LINE 3  ; main.sprout:4',
      '  0023  JUMP 0',
      '  0025  JUMP 0',
      '  0027  HALT',
    ]);
  });

  it('compiles `for` over range to ITER_INIT k and over a value to ITER_INIT 0; break pops the iterator', () => {
    expect(body('for i in range(1, 3):\n    move(EAST)\nfor c in "ab":\n    break\n')).toEqual([
      '  0000  LINE 0  ; main.sprout:1',
      '  0002  CONST 0  ; 1',
      '  0004  CONST 1  ; 3',
      '  0006  ITER_INIT 2',
      '  0008  ITER_NEXT 24',
      '  0010  STORE_GLOBAL 0  ; i',
      '  0012  LINE 1  ; main.sprout:2',
      '  0014  CONST 2  ; EAST',
      '  0016  CALL_HOST 1 1 20 1',
      '  0021  POP',
      '  0022  JUMP 8',
      '  0024  LINE 2  ; main.sprout:3',
      "  0026  CONST 3  ; 'ab'",
      '  0028  ITER_INIT 0',
      '  0030  ITER_NEXT 41',
      '  0032  STORE_GLOBAL 1  ; c',
      '  0034  LINE 3  ; main.sprout:4',
      '  0036  POP',
      '  0037  JUMP 41',
      '  0039  JUMP 30',
      '  0041  HALT',
    ]);
  });

  it('passes 1 to 3 range arguments as ITER_INIT k', () => {
    for (const [args, k] of [
      ['3', 1],
      ['0, 3', 2],
      ['0, 9, 3', 3],
    ] as const) {
      expect(body(`for i in range(${args}):\n    pass\n`)).toContain(
        `  ${String(2 + 2 * k).padStart(4, '0')}  ITER_INIT ${String(k)}`,
      );
    }
  });

  it('compiles `repeat` to REPEAT_INIT / REPEAT_NEXT, and break inside it pops the counter', () => {
    expect(body('repeat 2:\n    harvest()\n    break\n')).toEqual([
      '  0000  LINE 0  ; main.sprout:1',
      '  0002  CONST 0  ; 2',
      '  0004  REPEAT_INIT',
      '  0005  REPEAT_NEXT 22',
      '  0007  LINE 1  ; main.sprout:2',
      '  0009  CALL_HOST 3 0 30 1',
      '  0014  POP',
      '  0015  LINE 2  ; main.sprout:3',
      '  0017  POP',
      '  0018  JUMP 22',
      '  0020  JUMP 5',
      '  0022  HALT',
    ]);
  });

  it('makes break and continue leave only the innermost loop', () => {
    expect(body('while True:\n    for i in range(2):\n        break\n    break\n')).toEqual([
      '  0000  LINE 0  ; main.sprout:1',
      '  0002  CONST 0  ; True',
      '  0004  JUMP_IF_FALSE 29',
      '  0006  LINE 1  ; main.sprout:2',
      '  0008  CONST 1  ; 2',
      '  0010  ITER_INIT 1',
      '  0012  ITER_NEXT 23',
      '  0014  STORE_GLOBAL 0  ; i',
      '  0016  LINE 2  ; main.sprout:3',
      '  0018  POP',
      '  0019  JUMP 23',
      '  0021  JUMP 12',
      '  0023  LINE 3  ; main.sprout:4',
      '  0025  JUMP 29',
      '  0027  JUMP 0',
      '  0029  HALT',
    ]);
  });
});

describe('compile: calls', () => {
  it("bakes a host builtin's id, argc, cost and touchesWorld into CALL_HOST", () => {
    expect(body('plant(RADISH)\nrandom(6)\n')).toEqual([
      '  0000  LINE 0  ; main.sprout:1',
      '  0002  CONST 0  ; RADISH',
      '  0004  CALL_HOST 2 1 30 1',
      '  0009  POP',
      '  0010  LINE 1  ; main.sprout:2',
      '  0012  CONST 1  ; 6',
      '  0014  CALL_HOST 4 1 2 0',
      '  0019  POP',
      '  0020  HALT',
    ]);
  });

  it('compiles method calls to receiver, args, CALL_METHOD m argc', () => {
    expect(body('d = {}\nd.get(RADISH, 0)\n').slice(3)).toEqual([
      '  0006  LINE 1  ; main.sprout:2',
      '  0008  LOAD_GLOBAL 0  ; d',
      '  0010  CONST 0  ; RADISH',
      '  0012  CONST 1  ; 0',
      '  0014  CALL_METHOD 2 2  ; get',
      '  0017  POP',
      '  0018  HALT',
    ]);
  });

  it('calls any other value with callee, args, CALL argc', () => {
    expect(body('f = 3\nf(1)\n').slice(3)).toEqual([
      '  0006  LINE 1  ; main.sprout:2',
      '  0008  LOAD_GLOBAL 0  ; f',
      '  0010  CONST 1  ; 1',
      '  0012  CALL 1',
      '  0014  POP',
      '  0015  HALT',
    ]);
  });
});

describe('compile: debug tables (interpreter-vm.md §Bytecode, module layout)', () => {
  it('writes one statement-table row per LINE, with the header span for compound statements', () => {
    const data = compileSources('x = 1\nwhile x < 3:\n    x += 1\n');
    expect(data.statements).toEqual([
      { file: 'main.sprout', line: 1, span: span(1, 1, 1, 6) },
      { file: 'main.sprout', line: 2, span: span(2, 1, 2, 12) },
      { file: 'main.sprout', line: 3, span: span(3, 5, 3, 11) },
    ]);
  });

  it('gives every instruction that can fail a span, and no other instruction one', () => {
    const data = compileSources('g = [1]\nprint(g[0] // 0)\n');
    expect([...data.opSpans]).toEqual([
      [4, span(1, 5, 1, 8)], // BUILD_LIST
      [10, span(2, 7, 2, 8)], // LOAD_GLOBAL g
      [14, span(2, 7, 2, 11)], // INDEX_GET
      [17, span(2, 7, 2, 16)], // FLOORDIV
      [18, span(2, 1, 2, 17)], // CALL_INTRINSIC print
    ]);
  });

  it('records the plain names of operands for messages, only where an operand is a bare name', () => {
    const data = compileSources('a = 1\nb = 2\nprint(a + b, a * 2, 3 - 4, -a)\nd = {}\nprint(d[1])\n');
    expect([...data.operandNames.values()]).toEqual([['a', 'b'], ['a', null], ['a'], ['d']]);
  });
});

describe('compile: the def guard (LANG-04.2 compiles everything but functions)', () => {
  it('rejects a program with a def as an invariant, until functions are compiled', () => {
    expect(() => compileSources('def f():\n    pass\n')).toThrow(InvariantError);
  });
});
