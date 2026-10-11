/**
 * A small, literal set of host signatures, constants and intrinsic signatures for checker tests, standing
 * in for sim's host table and lang-vm's intrinsic table until they exist (chief ruling 2026-10-11).
 * Spec: docs/02-language/standard-library.md (names, arities). Test support only; not part of the public API.
 */

import { parse } from '../parser/parser';
import { resolveScopes } from '../scope/resolve';
import { DEFAULT_LIMITS, type Diagnostic, type SourceFile } from '../types';
import type { HostSignature } from '../index';
import { check, scopeNames, type CheckOptions } from '../checker/check';

function host(
  id: number,
  name: string,
  params: HostSignature['params'],
  touchesWorld: boolean,
): HostSignature {
  return { id, name, params, returns: 'any', cost: 1, touchesWorld };
}

export const TEST_OPTIONS: CheckOptions = {
  hostSignatures: [
    host(1, 'move', ['const'], true),
    host(2, 'plant', ['const'], true),
    host(3, 'harvest', [], true),
    host(4, 'is_ripe', [], true),
    host(5, 'crop', [], true),
    host(6, 'sell', ['const', 'int'], true),
    host(7, 'inventory', ['const'], true),
    host(8, 'world_size', [], false),
    host(9, 'halt', [], true),
    host(10, 'spawn', ['function'], true),
  ],
  constants: [
    { name: 'RADISH', id: 10, group: 'crop' },
    { name: 'CORN', id: 11, group: 'crop' },
    { name: 'NORTH', id: 1, group: 'direction' },
    { name: 'EAST', id: 2, group: 'direction' },
  ],
  lockedFeatures: new Set(),
  lockedNames: new Set(),
  limits: DEFAULT_LIMITS,
  intrinsicSignatures: [
    { name: 'range', minArgs: 1, maxArgs: 3 },
    { name: 'len', minArgs: 1, maxArgs: 1 },
    { name: 'abs', minArgs: 1, maxArgs: 1 },
    { name: 'min', minArgs: 1, maxArgs: null },
    { name: 'max', minArgs: 1, maxArgs: null },
    { name: 'str', minArgs: 1, maxArgs: 1 },
    { name: 'int', minArgs: 1, maxArgs: 1 },
    { name: 'print', minArgs: 0, maxArgs: null },
  ],
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
