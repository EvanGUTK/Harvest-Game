/**
 * `balance`: runs the scenario matrix for each rule variant, prints the report and gates on the criteria.
 * Design: docs/03-architecture/simulation-engine.md §Balance harness.
 * Invariants: all effects go through `Io` and the injected factory loader, so the whole flow is testable with fakes;
 * the exit code is 0 when every criterion of every variant passes, 1 when one fails, 2 for a usage error and 70 when
 * the engine is not wired.
 */

import { parseBalanceArgs } from './args';
import { buildReport, buildVariantReport, formatReport } from './report';
import type { VariantReport } from './report';
import type { Variant } from './overrides';
import { collectVariantData } from './scenario';
import type { FactoryResult } from './runtime';

export type Io = {
  stdout(text: string): void;
  stderr(text: string): void;
};

export const EXIT_OK = 0;
export const EXIT_CRITERIA_FAILED = 1;
export const EXIT_USAGE = 2;
export const EXIT_ENGINE_NOT_WIRED = 70;

type VariantOutcome = { ok: true; report: VariantReport } | { ok: false; message: string };

function seedsOf(count: number): number[] {
  return Array.from({ length: count }, (_, seed) => seed);
}

function runVariant(
  factory: Extract<FactoryResult, { ok: true }>['factory'],
  variant: Variant,
  seeds: readonly number[],
): VariantOutcome {
  const built = factory(variant.overrides);
  if (!built.ok) return { ok: false, message: built.message };
  const data = collectVariantData(built.runtime, variant, seeds);
  return { ok: true, report: buildVariantReport(data, variant) };
}

/** Runs the CLI; returns the process exit code. `argv` is the command line without node and the script path. */
export function main(argv: readonly string[], io: Io, loadFactory: () => FactoryResult): number {
  const parsed = parseBalanceArgs(argv);
  if (!parsed.ok) {
    io.stderr(parsed.message);
    return EXIT_USAGE;
  }
  const loaded = loadFactory();
  if (!loaded.ok) {
    io.stderr(loaded.message);
    return EXIT_ENGINE_NOT_WIRED;
  }
  const seeds = seedsOf(parsed.options.seedCount);
  const reports: VariantReport[] = [];
  for (const variant of parsed.options.variants) {
    const outcome = runVariant(loaded.factory, variant, seeds);
    if (!outcome.ok) {
      io.stderr(outcome.message);
      return EXIT_ENGINE_NOT_WIRED;
    }
    reports.push(outcome.report);
  }
  const report = buildReport(reports);
  io.stdout(parsed.options.json ? JSON.stringify(report) : formatReport(report));
  return report.passed ? EXIT_OK : EXIT_CRITERIA_FAILED;
}
