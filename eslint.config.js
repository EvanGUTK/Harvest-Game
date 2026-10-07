// ESLint flat config. Enforces CLAUDE.md "Hard rules" 1, 4 and 6 mechanically.
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
      'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'hack', 'xxx'], location: 'anywhere' }],
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'No default exports (standards.md).' },
      ],
    },
  },
  {
    // Rule 1: purity of the engine. Never disable these.
    files: ['packages/lang/src/**/*.ts', 'packages/sim/src/**/*.ts', 'packages/content/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...impureGlobals],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG passed in explicitly.' },
        { object: 'Object', property: 'keys', message: 'Unstable for results; use arrays or Map.' },
        { object: 'Object', property: 'values', message: 'Unstable for results; use arrays or Map.' },
        { object: 'Object', property: 'entries', message: 'Unstable for results; use arrays or Map.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'No default exports (standards.md).' },
        {
          selector: "BinaryExpression[operator='/']",
          message: 'Integers only: use floorDiv (standards.md §Purity).',
        },
        { selector: "AssignmentExpression[operator='/=']", message: 'Integers only: use floorDiv.' },
        { selector: "BinaryExpression[operator='**']", message: 'No exponentiation in the engine.' },
        { selector: 'ForInStatement', message: 'Unstable iteration order; use arrays or Map.' },
        { selector: "CallExpression[callee.name='eval']", message: 'Player code is never JavaScript.' },
        { selector: "NewExpression[callee.name='Function']", message: 'Player code is never JavaScript.' },
        { selector: 'ImportExpression', message: 'No dynamic import in the engine.' },
        { selector: 'Literal[regex]', message: 'No regex in the engine (hand-written lexer only).' },
      ],
    },
  },
  {
    // Rule 4: dependency direction.
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
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@harvest/db'], message: 'web never imports db.' }] },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.bench.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
