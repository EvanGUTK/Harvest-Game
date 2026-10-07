import { defineConfig } from 'vitest/config';

// Every workspace package is a Vitest project. Matching on package.json keeps
// stray files (READMEs) in apps/, packages/ and tools/ from being treated as projects.
export default defineConfig({
  test: {
    projects: ['packages/*/package.json', 'apps/*/package.json', 'tools/*/package.json'],
    passWithNoTests: true,
  },
});
