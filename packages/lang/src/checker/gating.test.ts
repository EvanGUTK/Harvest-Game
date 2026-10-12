import { describe, expect, it } from 'vitest';
import { checkErrors, TEST_OPTIONS } from '../test-support/check-options';
import type { Feature, LockReason, Span } from '../types';
import type { CheckOptions } from './check';

const chapter = (n: number): LockReason => ({ kind: 'chapter', chapter: n });

/** TEST_OPTIONS with `features` and `names` locked (by chapter unless a reason is given). */
function locked(
  features: readonly Feature[],
  names: readonly (readonly [string, LockReason])[] = [],
): CheckOptions {
  return {
    ...TEST_OPTIONS,
    lockedFeatures: new Map(features.map((f) => [f, chapter(9)] as const)),
    lockedNames: new Map(names),
  };
}

const lockedMessages = (text: string, opts: CheckOptions): string[] =>
  checkErrors(text, opts)
    .filter((d) => d.code === 'E-LOCKED-FEATURE')
    .map((d) => d.message);

const span = (line: number, col: number, endLine: number, endCol: number): Span => ({
  file: 'main.sprout',
  line,
  col,
  endLine,
  endCol,
});

describe('E-LOCKED-FEATURE for syntax (curriculum.md §Feature gating map)', () => {
  it('uses the catalogue sentence with the chapter suffix, at the keyword', () => {
    const opts = { ...TEST_OPTIONS, lockedFeatures: new Map<Feature, LockReason>([['while', chapter(4)]]) };
    expect(checkErrors('while crop():\n    move(EAST)\n', opts)).toEqual([
      {
        code: 'E-LOCKED-FEATURE',
        severity: 'error',
        range: span(1, 1, 1, 6),
        message: "`while` isn't unlocked yet. You'll get it in Chapter 4.",
      },
    ]);
  });

  it('uses the node suffix when the chapter is reached but the node is not bought', () => {
    const opts = {
      ...TEST_OPTIONS,
      lockedFeatures: new Map<Feature, LockReason>([['repeat', { kind: 'node', node: 'Repeat' }]]),
    };
    expect(lockedMessages('repeat 3:\n    move(EAST)\n', opts)).toEqual([
      "`repeat` isn't unlocked yet. Buy the Repeat node in the skill tree.",
    ]);
  });

  const table: readonly (readonly [Feature, string, string])[] = [
    ['repeat', 'repeat 2:\n    pass\n', '`repeat`'],
    ['for', 'for i in range(2):\n    pass\n', '`for`'],
    ['for_in_list', 'for t in tiles:\n    pass\ntiles = 1\n', '`for` over a list'],
    ['if', 'if crop():\n    pass\n', '`if`'],
    ['comparison', 'crop() == None\n', '`==`'],
    ['while', 'while crop():\n    break\n', '`while`'],
    ['boolean_ops', 'crop() and is_ripe()\n', '`and`'],
    ['boolean_ops', 'not crop()\n', '`not`'],
    ['variables', 'n = 1\n', 'Storing a value with `=`'],
    ['arithmetic', 'print(1 + 2)\n', '`+`'],
    ['arithmetic', 'print(-1)\n', '`-`'],
    ['def', 'def f():\n    pass\n', '`def`'],
    ['return', 'def f():\n    return 1\n', '`return` with a value'],
    ['global', 'def f():\n    global n\nn = 1\n', '`global`'],
    ['lists', 'print([1])\n', 'Lists'],
    ['lists', 'print(1 in [])\n', '`in`'],
    ['dicts', 'print({})\n', 'Dicts'],
  ];
  for (const [feature, source, subject] of table) {
    it(`gates ${feature} at ${subject}`, () => {
      const messages = lockedMessages(source, locked([feature]));
      expect(messages[0]?.startsWith(subject)).toBe(true);
    });
  }

  it('gates `break` and `continue` with `while`', () => {
    expect(lockedMessages('for i in range(2):\n    break\n    continue\n', locked(['while']))).toEqual([
      "`break` isn't unlocked yet. You'll get it in Chapter 9.",
      "`continue` isn't unlocked yet. You'll get it in Chapter 9.",
    ]);
  });

  it('separates `for` over range from `for` over anything else', () => {
    expect(lockedMessages('for i in range(3):\n    pass\n', locked(['for_in_list']))).toEqual([]);
    expect(lockedMessages('for c in "ab":\n    pass\n', locked(['for']))).toEqual([]);
  });

  it('gates indexing and list or dict methods as lists and dicts', () => {
    const source = 'x = [1]\nprint(x[0])\nx.append(2)\nd = {}\nd.get(1)\n';
    expect(lockedMessages(source, locked(['lists']))).toEqual([
      "Lists aren't unlocked yet. You'll get it in Chapter 9.",
      "Indexing with `[ ]` isn't unlocked yet. You'll get it in Chapter 9.",
      "`.append` isn't unlocked yet. You'll get it in Chapter 9.",
    ]);
    expect(lockedMessages(source, locked(['dicts']))).toEqual([
      "Dicts aren't unlocked yet. You'll get it in Chapter 9.",
      "`.get` isn't unlocked yet. You'll get it in Chapter 9.",
    ]);
  });

  it('checks `x += 1` for variables before arithmetic, one diagnostic per node', () => {
    expect(lockedMessages('n = 0\nn += 1\n', locked(['arithmetic']))).toEqual([
      "`+=` isn't unlocked yet. You'll get it in Chapter 9.",
    ]);
    expect(lockedMessages('n = 0\nn += 1\n', locked(['variables', 'arithmetic']))).toHaveLength(2);
  });

  it('reports the first locked operator of a comparison chain', () => {
    expect(lockedMessages('a = 1\nprint(a < 2 in [])\n', locked(['lists']))).toEqual([
      "`in` isn't unlocked yet. You'll get it in Chapter 9.",
      "Lists aren't unlocked yet. You'll get it in Chapter 9.",
    ]);
  });

  it('never gates literals, calls, `pass`, `for` targets or def parameters', () => {
    const everything: Feature[] = [
      'repeat',
      'variables',
      'arithmetic',
      'comparison',
      'boolean_ops',
      'lists',
      'dicts',
      'while',
      'if',
      'return',
      'global',
      'for_in_list',
    ];
    expect(
      lockedMessages(
        'move(EAST)\nprint("hi", 5, True, None)\npass\nfor i in range(5):\n    pass\ndef f(a):\n    pass\n',
        locked(everything),
      ),
    ).toEqual([]);
  });
});

describe('E-LOCKED-FEATURE for names (errors-and-diagnostics.md: locked names win over E-UNKNOWN-NAME)', () => {
  it('reports a locked builtin with the chapter and the node wordings', () => {
    expect(lockedMessages('sell(RADISH, 1)\n', locked([], [['sell', chapter(8)]]))).toEqual([
      "`sell` isn't unlocked yet. You'll get it in Chapter 8.",
    ]);
    expect(
      lockedMessages('sell(RADISH, 1)\n', locked([], [['sell', { kind: 'node', node: 'Sell' }]])),
    ).toEqual(["`sell` isn't unlocked yet. Buy the Sell node in the skill tree."]);
  });

  it('gives the two multiplayer reasons (standard-library.md)', () => {
    const tend = 'def tend():\n    pass\n';
    expect(
      lockedMessages(
        `${tend}spawn(tend)\n`,
        locked([], [['spawn', { kind: 'mode', mode: 'single-player-only' }]]),
      ),
    ).toEqual(['`spawn()` is single-player only in v1.']);
    expect(lockedMessages('random(6)\n', locked([], [['random', { kind: 'mode', mode: 'ranked' }]]))).toEqual(
      ['`random()` is turned off in ranked matches so replays stay clean.'],
    );
  });

  it('wins over E-UNKNOWN-NAME, E-WRONG-ARG-COUNT and E-BUILTIN-NOT-VALUE', () => {
    const opts = locked(
      [],
      [
        ['sell', chapter(8)],
        ['measure', chapter(9)],
        ['GOURD', chapter(9)],
      ],
    );
    expect(checkErrors('measure()\nprint(GOURD)\nsell()\nf = sell\n', opts).map((d) => d.code)).toEqual([
      'E-LOCKED-FEATURE',
      'E-LOCKED-FEATURE',
      'E-LOCKED-FEATURE',
      'E-LOCKED-FEATURE',
    ]);
  });

  it('wins over E-RANGE-ONLY-IN-FOR for a locked `range`', () => {
    expect(checkErrors('r = range(3)\n', locked([], [['range', chapter(2)]])).map((d) => d.code)).toEqual([
      'E-LOCKED-FEATURE',
    ]);
  });

  it('never locks a name the program defines itself', () => {
    expect(
      lockedMessages('def measure():\n    pass\nmeasure()\n', locked([], [['measure', chapter(9)]])),
    ).toEqual([]);
  });
});
