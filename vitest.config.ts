import { defineConfig } from 'vitest/config';

// Every workspace package directory is a Vitest project. `tools/*` is the tools glob, with
// `tools/README.md` excluded because it would otherwise be mistaken for a project config.
// The per-test timeout is passed on the command line (`--testTimeout=30000` in the package.json test
// scripts): a `testTimeout` set here does not reach glob-defined projects. The engine's fast-check
// property tests take 1 to 4 s alone and several times that when many checks run at once, so the 5 s
// default failed green code at random; 30 s still catches a hang.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', 'tools/*', '!tools/README.md'],
  },
});
