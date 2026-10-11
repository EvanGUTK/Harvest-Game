#!/usr/bin/env tsx
/**
 * Entry point of `sprout`: wires the process, the disk and the real engine into `main`.
 * Design: docs/07-roadmap/milestones.md M0 (`tools/run`). Kept thin; everything testable lives in run.ts.
 * Invariants: relative paths resolve against the directory the user typed the command in (pnpm sets INIT_CWD,
 * because it runs the script from tools/run), not against tools/run.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { main } from './run';
import { loadRuntime } from './runtime';

const base = process.env.INIT_CWD ?? process.cwd();

process.exitCode = main(
  process.argv.slice(2),
  {
    readFile: (path) => readFileSync(resolve(base, path), 'utf8'),
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
  },
  loadRuntime,
);
