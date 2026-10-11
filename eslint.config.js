// ESLint flat config. Mechanically enforces CLAUDE.md Hard rules:
//   1 (engine purity), 4 (dependency direction, every edge), and the lint-able parts of
//   6 (no `any`, no `@ts-ignore`, no TODO/FIXME comments, no default exports, no focused or
//   skipped tests, no inline lint disables). Everything else in the standards is reviewed by humans
//   and the `reviewer` agent; see docs/09-engineering/standards.md "What is enforced where".
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/** Globals that would make lang/sim impure or nondeterministic. */
const impureGlobals = [
  'Date',
  'performance',
  'crypto',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'window',
  'document',
  'navigator',
  'process',
  'require',
  'fetch',
  'localStorage',
  'sessionStorage',
  'globalThis',
];

const noDefaultExport = {
  selector: 'ExportDefaultDeclaration',
  message: 'No default exports (standards.md).',
};

/** Syntax that is banned in engine source because it breaks determinism or the sandbox. */
const enginePuritySyntax = [
  {
    selector: "BinaryExpression[operator='/']",
    message: 'Integers only: use floorDiv (standards.md §Purity).',
  },
  { selector: "AssignmentExpression[operator='/=']", message: 'Integers only: use floorDiv.' },
  { selector: "BinaryExpression[operator='**']", message: 'No exponentiation in the engine.' },
  { selector: 'ForInStatement', message: 'Unstable iteration order; use arrays or Map.' },
  { selector: 'Literal[regex]', message: 'No regex in the engine (hand-written lexer only).' },
];

/** Syntax that is banned everywhere in engine packages, tests included: player code is never JavaScript. */
const sandboxSyntax = [
  { selector: "CallExpression[callee.name='eval']", message: 'Player code is never JavaScript.' },
  { selector: "NewExpression[callee.name='Function']", message: 'Player code is never JavaScript.' },
  { selector: 'ImportExpression', message: 'No dynamic import in the engine.' },
];

const ENGINE_SRC = ['packages/lang/src/**/*.ts', 'packages/sim/src/**/*.ts', 'packages/content/src/**/*.ts'];
const ENGINE_TESTS = ['packages/lang/src/**/*.{test,bench}.ts', 'packages/sim/src/**/*.{test,bench}.ts'];

export default defineConfig(
  // Root tool configs are not part of any tsconfig project and carry no logic worth type-linting.
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.d.ts',
      'pnpm-lock.yaml',
      '*.config.js',
      '*.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    // Rule 6: no inline lint disables, anywhere.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // standards.md: `type` for data, `interface` for behaviour contracts; the lint rule can't express that.
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/array-type': ['error', { default: 'array', readonly: 'array' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', minimumDescriptionLength: 10 },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // Rule 6: deferred work is tracked in backlog.md + STATE.md, never in code comments.
      'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'hack', 'xxx'], location: 'anywhere' }],
      'no-restricted-syntax': ['error', noDefaultExport],
    },
  },
  {
    // Rule 1: purity of the engine. Never disable these.
    files: ENGINE_SRC,
    rules: {
      'no-restricted-globals': ['error', ...impureGlobals],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG passed in explicitly.' },
        { object: 'Object', property: 'keys', message: 'Unstable for results; use arrays or Map.' },
        { object: 'Object', property: 'values', message: 'Unstable for results; use arrays or Map.' },
        { object: 'Object', property: 'entries', message: 'Unstable for results; use arrays or Map.' },
      ],
      'no-restricted-syntax': ['error', noDefaultExport, ...enginePuritySyntax, ...sandboxSyntax],
    },
  },
  {
    // The one place `/` is allowed: the floorDiv/floorMod helper module (simulation-engine.md §Determinism,
    // standards.md §Purity, CLAUDE.md rule 1). Its exactness is proven in int-math.ts and its tests. Every
    // other engine rule, including the `/=` ban, still applies to this file. Approved by the owner 2026-10-11.
    files: ['packages/lang/src/int-math.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noDefaultExport,
        ...enginePuritySyntax.filter((rule) => rule.selector !== "BinaryExpression[operator='/']"),
        ...sandboxSyntax,
      ],
    },
  },
  {
    // Engine tests must run unchanged in Node and all three browser engines (SIM-08), so they keep the
    // global and property bans. They may use regex, `/` and `**` in assertions (testing.md §Rules).
    files: ENGINE_TESTS,
    rules: {
      'no-restricted-syntax': ['error', noDefaultExport, ...sandboxSyntax],
    },
  },
  {
    // Rule 4: dependency direction. lang and content depend on nothing.
    files: ['packages/lang/src/**/*.ts', 'packages/content/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@harvest/*'], message: 'lang and content depend on nothing.' }] },
      ],
    },
  },
  {
    files: ['packages/sim/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@harvest/protocol', '@harvest/db'], message: 'sim may only import lang and content.' },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/protocol/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['@harvest/db'], message: 'protocol may only import lang, content and sim.' }],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@harvest/db'], message: 'web never imports db.' }] },
      ],
    },
  },
  {
    // Rule 6 / testing.md: no focused, skipped or placeholder tests.
    files: ['**/*.test.ts', '**/*.bench.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-properties': [
        'error',
        ...['it', 'test', 'describe', 'bench'].flatMap((object) =>
          ['only', 'skip', 'todo'].map((property) => ({
            object,
            property,
            message: 'No focused/skipped/placeholder tests (testing.md §Rules).',
          })),
        ),
      ],
    },
  },
);
