/**
 * Test support: compiles Sprout source text with a small literal host table, standing in for sim's
 * host signatures, and returns the validated module data or its disassembly listing.
 * Spec: docs/03-architecture/interpreter-vm.md §Bytecode. Not used by production code.
 * Invariants: the source must parse cleanly; every compiled module passes assertValidModule.
 */

import { compileModuleData } from '../compiler/compile';
import type { ModuleData } from '../compiler/bytecode';
import { disassemble } from '../compiler/disassemble';
import { assertValidModule } from '../compiler/validate';
import { INTRINSIC_NAMES } from '../intrinsics/intrinsics';
import { countTokens } from '../lexer/count-tokens';
import { parse } from '../parser/parser';
import { resolveScopes } from '../scope/resolve';
import { DEFAULT_LIMITS, type ConstantDef, type HostSignature, type SourceFile } from '../types';

export const TEST_HOSTS: readonly HostSignature[] = [
  { id: 1, name: 'move', params: ['const'], returns: 'none', cost: 20, touchesWorld: true },
  { id: 2, name: 'plant', params: ['const'], returns: 'bool', cost: 30, touchesWorld: true },
  { id: 3, name: 'harvest', params: [], returns: 'bool', cost: 30, touchesWorld: true },
  { id: 4, name: 'random', params: ['int'], returns: 'int', cost: 2, touchesWorld: false },
  { id: 5, name: 'halt', params: [], returns: 'none', cost: 0, touchesWorld: true },
  { id: 6, name: 'is_ripe', params: [], returns: 'bool', cost: 2, touchesWorld: true },
  { id: 7, name: 'crop', params: [], returns: 'any', cost: 2, touchesWorld: true },
  { id: 8, name: 'world_size', params: [], returns: 'int', cost: 1, touchesWorld: true },
  { id: 9, name: 'inventory', params: ['const'], returns: 'int', cost: 1, touchesWorld: true },
  { id: 10, name: 'sell', params: ['const', 'int'], returns: 'int', cost: 10, touchesWorld: true },
  { id: 11, name: 'moisture', params: [], returns: 'int', cost: 2, touchesWorld: true },
  { id: 12, name: 'water', params: [], returns: 'bool', cost: 25, touchesWorld: true },
  { id: 13, name: 'refill', params: [], returns: 'bool', cost: 60, touchesWorld: true },
];

export const TEST_CONSTANTS: readonly ConstantDef[] = [
  { name: 'RADISH', id: 10, group: 'crop' },
  { name: 'EAST', id: 2, group: 'direction' },
  { name: 'NORTH', id: 1, group: 'direction' },
  { name: 'SOUTH', id: 3, group: 'direction' },
];

/** Parses, resolves and compiles `files` (one main.sprout when given a string); throws on parse errors. */
export function compileSources(files: readonly SourceFile[] | string): ModuleData {
  const sources = typeof files === 'string' ? [{ name: 'main.sprout', text: files }] : files;
  const parsed = parse(sources, DEFAULT_LIMITS);
  if (parsed.diagnostics.length > 0)
    throw new Error(`test source does not parse: ${parsed.diagnostics[0]?.code ?? ''}`);
  const scopes = resolveScopes(parsed.program, {
    hostNames: new Set(TEST_HOSTS.map((h) => h.name)),
    constantNames: new Set(TEST_CONSTANTS.map((c) => c.name)),
    intrinsicNames: INTRINSIC_NAMES,
  });
  const data = compileModuleData(parsed.program, scopes, {
    hostSignatures: TEST_HOSTS,
    constants: TEST_CONSTANTS,
    tokenCount: countTokens(sources),
  });
  assertValidModule(data);
  return data;
}

/** The disassembly listing of `compileSources(files)`. */
export function listing(files: readonly SourceFile[] | string): string[] {
  return disassemble(compileSources(files));
}
