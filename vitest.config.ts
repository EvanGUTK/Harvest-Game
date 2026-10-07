import { defineConfig } from 'vitest/config';

// Every workspace package directory is a Vitest project. `tools/*` is added when the first tool
// package exists (a bare README there would otherwise be mistaken for a project config).
// `passWithNoTests` exists only for the empty skeleton and is removed in LANG-01.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    passWithNoTests: true,
  },
});
