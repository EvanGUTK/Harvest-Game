import { describe, expect, it } from 'vitest';
import { checkErrors, TEST_OPTIONS } from '../test-support/check-options';
import type { Span } from '../types';

const messages = (text: string, options = TEST_OPTIONS): string[] =>
  checkErrors(text, options).map((d) => d.message);

const span = (line: number, col: number, endLine: number, endCol: number): Span => ({
  file: 'main.sprout',
  line,
  col,
  endLine,
  endCol,
});

describe('E-WRONG-ARG-COUNT for host builtins (errors-and-diagnostics.md: "`move` needs 1 thing in the brackets: a direction like `NORTH`.")', () => {
  it('uses the catalogue sentence with the parameter hints, over the whole call, and says how many were given', () => {
    expect(checkErrors('move()\n')).toEqual([
      {
        code: 'E-WRONG-ARG-COUNT',
        severity: 'error',
        range: span(1, 1, 1, 7),
        message: '`move` needs 1 thing in the brackets: a direction like `NORTH`.',
        help: 'You gave 0.',
      },
    ]);
    expect(messages('sell(RADISH)\n')).toEqual([
      '`sell` needs 2 things in the brackets: a crop like `RADISH` and a number.',
    ]);
  });

  it('falls back to the generic wording when the signature has no hints (chief ruling W3)', () => {
    expect(messages('plant()\n')).toEqual(['`plant` needs 1 thing in the brackets, but got 0.']);
    expect(messages('harvest(1)\n')).toEqual(['`harvest` needs nothing in the brackets, but got 1.']);
  });

  it('allows the optional parameters a signature declares', () => {
    const options = {
      ...TEST_OPTIONS,
      hostSignatures: [
        ...TEST_OPTIONS.hostSignatures,
        {
          id: 99,
          name: 'wave',
          params: ['int', 'int'] as const,
          optionalParams: 1,
          returns: 'any' as const,
          cost: 1,
          touchesWorld: true,
        },
      ],
    };
    expect(messages('wave(1)\nwave(1, 2)\n', options)).toEqual([]);
    expect(messages('wave()\nwave(1, 2, 3)\n', options)).toEqual([
      '`wave` needs 1 or 2 things in the brackets, but got 0.',
      '`wave` needs 1 or 2 things in the brackets, but got 3.',
    ]);
  });

  it('accepts the right number of arguments', () => {
    expect(messages('move(EAST)\nsell(RADISH, 3)\nharvest()\n')).toEqual([]);
  });
});

describe('E-WRONG-ARG-COUNT for intrinsics (standard-library.md §Pure helpers)', () => {
  it("uses the checker's own hint table", () => {
    expect(checkErrors('len()\n')).toMatchObject([
      {
        code: 'E-WRONG-ARG-COUNT',
        message: '`len` needs 1 thing in the brackets: a list, a dict or text.',
        help: 'You gave 0.',
      },
    ]);
  });

  it('checks ranges and open-ended counts', () => {
    expect(messages('for i in range():\n    pass\nfor i in range(1, 2, 3, 4):\n    pass\n')).toEqual([
      '`range` needs 1 to 3 things in the brackets: a stop, or a start and a stop, and optionally a step.',
      '`range` needs 1 to 3 things in the brackets: a stop, or a start and a stop, and optionally a step.',
    ]);
    expect(messages('min()\n')).toEqual([
      '`min` needs at least 1 thing in the brackets: a list, or two or more values.',
    ]);
    expect(messages('print()\nprint(1, 2, 3)\nmin(1, 2, 3)\nfor i in range(0, 8, 2):\n    pass\n')).toEqual(
      [],
    );
  });
});

describe('E-WRONG-ARG-COUNT for direct calls of user functions (language-spec.md §Type interactions: Calling)', () => {
  it('checks a call by name against the def, in any file and above or below the def', () => {
    expect(messages('f(1)\ndef f(a, b):\n    pass\n')).toEqual([
      '`f` needs 2 things in the brackets, but got 1.',
    ]);
    expect(
      checkErrors([
        { name: 'main.sprout', text: 'tend(1)\n' },
        { name: 'helpers.sprout', text: 'def tend():\n    pass\n' },
      ]).map((d) => d.message),
    ).toEqual(['`tend` needs nothing in the brackets, but got 1.']);
  });

  it('checks when every def of the name has the same number of parameters', () => {
    expect(messages('def f(a):\n    pass\ndef f(b):\n    pass\nf()\n')).toEqual([
      '`f` needs 1 thing in the brackets, but got 0.',
    ]);
  });

  it('treats a def name that some def declares `global` (and may rebind) as uncertain', () => {
    const source = 'def f(a):\n    pass\ndef g():\n    global f\n    f = h\ndef h():\n    pass\nf()\n';
    expect(messages(source)).toEqual([]);
  });

  it('leaves calls whose target is only known at run time to R-WRONG-ARG-COUNT', () => {
    expect(messages('def f(a):\n    pass\ndef f(a, b):\n    pass\nf()\n')).toEqual([]);
    expect(messages('def f(a):\n    pass\nf = 3\nf()\n')).toEqual([]);
    expect(messages('def f(a):\n    pass\ng = f\ng()\n')).toEqual([]);
    expect(messages('def f(a):\n    pass\ndef h(f):\n    f()\n')).toEqual([]);
  });
});

describe('E-WRONG-ARG-COUNT for methods (chief ruling 2026-10-11: arity by method name)', () => {
  it('checks `.append`, `.pop` and `.get` whatever the receiver', () => {
    expect(messages('lst = []\nlst.append()\nlst.pop(1, 2)\nd = {}\nd.get()\n')).toEqual([
      '`.append` needs 1 thing in the brackets, but got 0.',
      '`.pop` needs 0 or 1 things in the brackets, but got 2.',
      '`.get` needs 1 or 2 things in the brackets, but got 0.',
    ]);
  });

  it('accepts the valid forms', () => {
    expect(
      messages('lst = []\nlst.append(1)\nlst.pop()\nlst.pop(0)\nd = {}\nd.get(1)\nd.get(1, 2)\n'),
    ).toEqual([]);
  });
});

describe('E-UNKNOWN-METHOD (chief ruling 2026-10-11: "`.sort` isn\'t a method in Sprout. Lists have `.append` and `.pop`; dicts have `.get`.")', () => {
  it('reports a method no Sprout value has, at the method name, with the catalogue wording', () => {
    expect(checkErrors('lst = []\nlst.sort(1, 2, 3)\n')).toEqual([
      {
        code: 'E-UNKNOWN-METHOD',
        severity: 'error',
        range: span(2, 5, 2, 9),
        message: "`.sort` isn't a method in Sprout. Lists have `.append` and `.pop`; dicts have `.get`.",
      },
    ]);
  });

  it('suggests a close method with a fix-it that replaces the name', () => {
    expect(checkErrors('lst = []\nlst.apend(1)\n')).toEqual([
      {
        code: 'E-UNKNOWN-METHOD',
        severity: 'error',
        range: span(2, 5, 2, 10),
        message: "`.apend` isn't a method in Sprout. Did you mean `.append`?",
        help: 'Lists have `.append` and `.pop`; dicts have `.get`.',
        fix: { label: 'Change to `.append`', edits: [{ span: span(2, 5, 2, 10), newText: 'append' }] },
      },
    ]);
    expect(messages('d = {}\nd.gett(1)\n')).toEqual([
      "`.gett` isn't a method in Sprout. Did you mean `.get`?",
    ]);
  });
});
