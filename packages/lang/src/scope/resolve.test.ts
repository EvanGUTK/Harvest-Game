import { describe, expect, it } from 'vitest';
import type { DefStmt, Identifier, NameExpr, Program } from '../parser/ast';
import { assertNever } from '../invariant';
import { parse } from '../parser/parser';
import { DEFAULT_LIMITS, type SourceFile } from '../types';
import { resolveScopes } from './resolve';
import type { ResolveOptions, Resolution, ScopeInfo } from './scope';

/** Literal name sets until lang-vm's intrinsic table and sim's host table exist (chief ruling Q2). */
const OPTIONS: ResolveOptions = {
  hostNames: new Set(['move', 'plant', 'harvest', 'is_ripe']),
  constantNames: new Set(['RADISH', 'EAST']),
  intrinsicNames: new Set(['range', 'len', 'print']),
};

function program(files: SourceFile[] | string): Program {
  const sources = typeof files === 'string' ? [{ name: 'main.sprout', text: files }] : files;
  const result = parse(sources, DEFAULT_LIMITS);
  expect(result.diagnostics).toEqual([]);
  return result.program;
}

const resolveText = (text: string | SourceFile[]): ScopeInfo => resolveScopes(program(text), OPTIONS);

/** Every resolved occurrence as `name@line:col kind[slot|name]`, in the map's (pre-order) iteration order. */
function occurrences(info: ScopeInfo): string[] {
  const out: string[] = [];
  for (const [node, resolution] of info.resolutions) out.push(`${label(node)} ${show(resolution)}`);
  return out;
}

const label = (node: NameExpr | Identifier): string =>
  `${node.name}@${String(node.span.line)}:${String(node.span.col)}`;

function show(r: Resolution): string {
  switch (r.kind) {
    case 'local':
    case 'global':
      return `${r.kind}[${String(r.slot)}]`;
    case 'intrinsic':
    case 'builtin':
    case 'constant':
      return r.kind;
    case 'unknown':
      return 'unknown';
    default:
      return assertNever(r);
  }
}

function onlyDef(info: ScopeInfo, name: string): DefStmt {
  for (const def of info.functions.keys()) if (def.name.name === name) return def;
  throw new Error(`no def ${name}`);
}

describe('resolveScopes: local slots (language-spec.md §Scoping)', () => {
  it('orders a def frame as parameters, then names bound in the body in first-binding order', () => {
    const info = resolveText('def f(a, b):\n    y = 1\n    for i in range(a):\n        x = i\n    y += b\n');
    expect(info.functions.get(onlyDef(info, 'f'))?.locals).toEqual(['a', 'b', 'y', 'i', 'x']);
  });

  it('treats a name assigned anywhere in the body as local for the whole body, even when read first', () => {
    const info = resolveText('total = 0\ndef f():\n    print(total)\n    total = 1\n');
    expect(occurrences(info)).toEqual([
      'total@1:1 global[0]',
      'f@2:5 global[1]',
      'print@3:5 intrinsic',
      'total@3:11 local[0]',
      'total@4:5 local[0]',
    ]);
  });

  it('leaves names declared `global` out of the frame and resolves them to their global slot', () => {
    const info = resolveText('total = 0\ndef f():\n    global total\n    total += 1\n');
    const scope = info.functions.get(onlyDef(info, 'f'));
    expect(scope?.locals).toEqual([]);
    expect([...(scope?.declaredGlobal ?? [])]).toEqual(['total']);
    expect(occurrences(info)).toEqual([
      'total@1:1 global[0]',
      'f@2:5 global[1]',
      'total@3:12 global[0]',
      'total@4:5 global[0]',
    ]);
  });

  it('reads a name the body never binds as a global', () => {
    const info = resolveText('def f():\n    return limit\nlimit = 3\n');
    expect(occurrences(info)).toEqual(['f@1:5 global[0]', 'limit@2:12 global[1]', 'limit@3:1 global[1]']);
  });

  it('does not bind the object of an indexed assignment', () => {
    const info = resolveText('grid = [0]\ndef f():\n    grid[0] = 1\n');
    expect(info.functions.get(onlyDef(info, 'f'))?.locals).toEqual([]);
    expect(occurrences(info)).toContain('grid@3:5 global[0]');
  });
});

describe('resolveScopes: globals (language-spec.md §Files: one global namespace, run order)', () => {
  it('numbers global slots by first binding in pre-order over the files in run order', () => {
    const info = resolveText([
      { name: 'main.sprout', text: 'score = 0\ntend()\n' },
      { name: 'helpers.sprout', text: 'def tend():\n    global count\n    count = 1\nscore = 5\n' },
    ]);
    expect(info.globals).toEqual(['tend', 'count', 'score']);
  });

  it('gives a name declared `global` in a def a slot even if the top level never binds it', () => {
    expect(resolveText('def f():\n    global hits\n    hits = 1\n').globals).toEqual(['f', 'hits']);
  });

  it('makes module-level `for` targets globals', () => {
    const info = resolveText('for i in range(3):\n    move(EAST)\n');
    expect(info.globals).toEqual(['i']);
    expect(occurrences(info)).toEqual([
      'i@1:5 global[0]',
      'range@1:10 intrinsic',
      'move@2:5 builtin',
      'EAST@2:10 constant',
    ]);
  });
});

describe('resolveScopes: intrinsics, builtins, constants and unknown names', () => {
  it('resolves names nobody binds against the intrinsic, host and constant sets, in that order', () => {
    const info = resolveText('len(x)\nplant(RADISH)\nharvset()\n');
    expect(occurrences(info)).toEqual([
      'len@1:1 intrinsic',
      'x@1:5 unknown',
      'plant@2:1 builtin',
      'RADISH@2:7 constant',
      'harvset@3:1 unknown',
    ]);
  });

  it('records a binding of a reserved name as a binding, for the checker to report (E-RESERVED-NAME)', () => {
    const info = resolveText('move = 1\nmove\n');
    expect(info.globals).toEqual(['move']);
    expect(occurrences(info)).toEqual(['move@1:1 global[0]', 'move@2:1 global[0]']);
  });

  it('does not resolve method names, which are not variables', () => {
    const info = resolveText('lst = []\nlst.append(len(lst))\n');
    expect(occurrences(info)).toEqual([
      'lst@1:1 global[0]',
      'lst@2:1 global[0]',
      'len@2:12 intrinsic',
      'lst@2:16 global[0]',
    ]);
  });
});

describe('resolveScopes: every binding Identifier and NameExpr is resolved', () => {
  it('covers def names, parameters, `for` targets, `global` names and assignment targets', () => {
    const info = resolveText('def go(x, y):\n    global n\n    for i in range(x):\n        n = i + y\n');
    expect(occurrences(info)).toEqual([
      'go@1:5 global[0]',
      'x@1:8 local[0]',
      'y@1:11 local[1]',
      'n@2:12 global[1]',
      'i@3:9 local[2]',
      'range@3:14 intrinsic',
      'x@3:20 local[0]',
      'n@4:9 global[1]',
      'i@4:13 local[2]',
      'y@4:17 local[1]',
    ]);
  });

  it('runs the same way twice (deterministic slot numbers and order)', () => {
    const text = 'a = 1\ndef f(p):\n    q = p\n    return q + a\nb = f(2)\n';
    expect(occurrences(resolveText(text))).toEqual(occurrences(resolveText(text)));
  });
});

describe('resolveScopes: inputs the names checker rejects still resolve deterministically (chief ruling 2026-10-12)', () => {
  it('keeps a repeated parameter in parameter order and resolves it to its first slot (E-DUPLICATE-PARAM)', () => {
    const info = resolveText('def f(a, a):\n    return a\n');
    expect(info.functions.get(onlyDef(info, 'f'))?.locals).toEqual(['a', 'a']);
    expect(occurrences(info)).toEqual([
      'f@1:5 global[0]',
      'a@1:7 local[0]',
      'a@1:10 local[0]',
      'a@2:12 local[0]',
    ]);
  });

  it('keeps a parameter declared `global` local for the whole body and ignores the `global` line (E-GLOBAL-PARAM)', () => {
    const info = resolveText('x = 0\ndef f(x):\n    global x\n    x = 1\n    return x\n');
    const scope = info.functions.get(onlyDef(info, 'f'));
    expect(scope?.locals).toEqual(['x']);
    expect([...(scope?.declaredGlobal ?? [])]).toEqual([]);
    expect(info.globals).toEqual(['x', 'f']);
    expect(occurrences(info)).toEqual([
      'x@1:1 global[0]',
      'f@2:5 global[1]',
      'x@2:7 local[0]',
      'x@3:12 local[0]',
      'x@4:5 local[0]',
      'x@5:12 local[0]',
    ]);
    expect(resolveText('def f(x):\n    global x\n').globals).toEqual(['f']);
  });
});
