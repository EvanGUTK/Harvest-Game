/**
 * The page-side half of the cross-engine determinism check: the sim's golden runner, bundled for a browser.
 * Design: docs/09-engineering/testing.md §Cross-engine determinism (SIM-08).
 * Invariants: it runs the same `runScripted` the Node golden test runs, over the same `cases`, and only reports
 * the results; the comparison with the committed goldens happens in the spec, outside the page.
 */

import { cases } from '../src/__golden__/cases';
import { runScripted } from '../src/golden/scripted';
import type { GoldenResult } from '../src/golden/scripted';

export type GoldenApi = {
  /** The case names, in the order of cases.ts. */
  caseNames: () => string[];
  /** The hashes of one case, played in this browser engine. */
  runGolden: (name: string) => GoldenResult;
};

declare global {
  interface Window {
    goldens: GoldenApi;
  }
}

window.goldens = {
  caseNames: () => cases.map((c) => c.name),
  runGolden: (name) => {
    const found = cases.find((c) => c.name === name);
    if (found === undefined) throw new Error(`no golden case ${name}`);
    return runScripted(found);
  },
};
