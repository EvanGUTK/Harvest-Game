/**
 * Builds the page-side entry into one browser script, in memory.
 * Design: docs/09-engineering/testing.md §Cross-engine determinism (SIM-08).
 * Invariants: the bundle is built from source on every run, never cached on disk, so a stale build cannot pass.
 */

import { build } from 'esbuild';

/** The package directory as a file path (the URL's path is percent-encoded, e.g. spaces in a parent folder). */
const PACKAGE_DIR = decodeURIComponent(new URL('..', import.meta.url).pathname);

/** The script that defines `window.goldens`, as text. */
export async function buildGoldenBundle(): Promise<string> {
  const result = await build({
    absWorkingDir: PACKAGE_DIR,
    entryPoints: ['determinism/browser-entry.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
  });
  const output = result.outputFiles[0];
  if (output === undefined) throw new Error('esbuild produced no output for the golden bundle');
  return output.text;
}
