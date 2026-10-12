/**
 * A small, literal set of host signatures and constants for checker tests, standing in for sim's host
 * table (intrinsics come from lang's own intrinsics.ts).
 * Spec: docs/02-language/standard-library.md (names, arities). Test support only; not part of the public API.
 */

import { parse } from '../parser/parser';
import { resolveScopes } from '../scope/resolve';
import { DEFAULT_LIMITS, type Diagnostic, type HostSignature, type SourceFile } from '../types';
import { check, scopeNames, type CheckOptions } from '../checker/check';

function host(
  id: number,
  name: string,
  params: HostSignature['params'],
  touchesWorld: boolean,
  paramHints?: readonly string[],
): HostSignature {
  const sig: HostSignature = { id, name, params, returns: 'any', cost: 1, touchesWorld };
  return paramHints === undefined ? sig : { ...sig, paramHints };
}

export const TEST_OPTIONS: CheckOptions = {
  hostSignatures: [
    host(1, 'move', ['const'], true, ['a direction like `NORTH`']),
    host(2, 'plant', ['const'], true),
    host(3, 'harvest', [], true),
    host(4, 'is_ripe', [], true),
    host(5, 'crop', [], true),
    host(6, 'sell', ['const', 'int'], true, ['a crop like `RADISH`', 'a number']),
    host(7, 'inventory', ['const'], true),
    host(8, 'world_size', [], true),
    host(9, 'halt', [], true),
    host(10, 'spawn', ['function'], true),
    host(11, 'moisture', [], true),
    host(12, 'water', [], true),
    host(13, 'refill', [], true),
    host(14, 'random', ['int'], false),
  ],
  constants: [
    { name: 'RADISH', id: 10, group: 'crop' },
    { name: 'CORN', id: 11, group: 'crop' },
    { name: 'NORTH', id: 1, group: 'direction' },
    { name: 'EAST', id: 2, group: 'direction' },
    { name: 'SOUTH', id: 3, group: 'direction' },
  ],
  lockedFeatures: new Set(),
  lockedNames: new Set(),
  limits: DEFAULT_LIMITS,
};

/** Parses (which must succeed cleanly), resolves and checks `files`, returning the checker's diagnostics. */
export function checkSources(
  files: readonly SourceFile[] | string,
  options: CheckOptions = TEST_OPTIONS,
): readonly Diagnostic[] {
  const sources = typeof files === 'string' ? [{ name: 'main.sprout', text: files }] : files;
  const parsed = parse(sources, options.limits);
  if (parsed.diagnostics.length > 0)
    throw new Error(`test source does not parse: ${parsed.diagnostics[0]?.code ?? ''}`);
  return check(parsed.program, resolveScopes(parsed.program, scopeNames(options)), options).diagnostics;
}

/** Only the error-severity diagnostics of `checkSources`, for tests of error rules that ignore warnings. */
export function checkErrors(
  files: readonly SourceFile[] | string,
  options: CheckOptions = TEST_OPTIONS,
): readonly Diagnostic[] {
  return checkSources(files, options).filter((d) => d.severity === 'error');
}
