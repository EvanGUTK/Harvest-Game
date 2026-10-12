import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parser';
import type { DefStmt, Statement } from '../parser/ast';
import { DEFAULT_LIMITS } from '../types';
import { boundNames, declaredGlobals } from './bindings';

function body(text: string): readonly Statement[] {
  return parse([{ name: 'main.sprout', text }], DEFAULT_LIMITS).program.files[0]?.body ?? [];
}

function defBody(text: string): readonly Statement[] {
  const def = body(text).find((s): s is DefStmt => s.type === 'DefStmt');
  if (def === undefined) throw new Error('expected a def');
  return def.body;
}

describe('boundNames (language-spec.md §Scoping: assignment, augmented assignment and `for` targets bind)', () => {
  it('lists names bound by assignment, augmented assignment, `for` and `def`, in first-binding order', () => {
    expect(boundNames(body('b = 1\na = 2\nb += 1\nfor i in r:\n    c = i\ndef f():\n    pass\n'))).toEqual([
      'b',
      'a',
      'i',
      'c',
      'f',
    ]);
  });

  it('looks into nested blocks of the same scope', () => {
    expect(
      boundNames(
        body(
          'if a:\n    x = 1\nelif b:\n    y = 1\nelse:\n    z = 1\nwhile c:\n    w = 1\nrepeat 2:\n    v = 1\n',
        ),
      ),
    ).toEqual(['x', 'y', 'z', 'w', 'v']);
  });

  it('binds the `for` target before names bound in its body', () => {
    expect(boundNames(body('for t in ts:\n    total = t\n'))).toEqual(['t', 'total']);
  });

  it('does not bind the object of an indexed assignment', () => {
    expect(boundNames(body('grid[0] = 1\nd[k] += 2\n'))).toEqual([]);
  });

  it('does not look into a nested def body (its own scope)', () => {
    expect(boundNames(body('def f():\n    inner = 1\n'))).toEqual(['f']);
  });

  it('lists a name once however often it is bound', () => {
    expect(boundNames(body('x = 1\nx = 2\nfor x in r:\n    x += 1\n'))).toEqual(['x']);
  });
});

describe('declaredGlobals (language-spec.md §Scoping: `global x`)', () => {
  it('collects every name declared `global` in the scope, in nested blocks too', () => {
    expect([...declaredGlobals(defBody('def f():\n    global a, b\n    if c:\n        global d\n'))]).toEqual(
      ['a', 'b', 'd'],
    );
  });

  it('ignores `global` statements of a nested def', () => {
    expect([...declaredGlobals(body('def f():\n    global a\n'))]).toEqual([]);
  });
});
