import { defineConfig } from 'vitest/config';

// Every workspace package directory is a Vitest project. `tools/*` is added when the first tool
// package exists (a bare README there would otherwise be mistaken for a project config).
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});
