#!/usr/bin/env tsx
/**
 * Entry point of `balance`: wires the process and the real engine into `main`.
 * Design: docs/03-architecture/simulation-engine.md §Balance harness. Kept thin; everything testable lives in run.ts.
 */

import { main } from './run';
import { loadRuntimeFactory } from './runtime';

process.exitCode = main(
  process.argv.slice(2),
  {
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
  },
  loadRuntimeFactory,
);
