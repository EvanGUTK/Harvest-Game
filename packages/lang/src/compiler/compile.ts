/**
 * The Sprout compiler: a parsed, resolved and checked program → a bytecode module.
 * Spec: docs/03-architecture/interpreter-vm.md §Bytecode (module layout, compilation rules, canonical
 * emissions); docs/02-language/language-spec.md §Scoping, §Iteration, §Files.
 * Invariants: pure; called only for a program whose parse and check produced no error, so anything the
 * checker rejects is an InvariantError (LANG-UNCHECKED-PROGRAM) here, never a diagnostic; function 0 is
 * every file's top level in run order and ends in HALT; the emitted module always passes assertValidModule.
 */

import type { Program } from '../parser/ast';
import type { ScopeInfo } from '../scope/scope';
import type { BytecodeModule, ConstantDef, HostSignature } from '../types';
import { LANGUAGE_VERSION } from '../version';
import { toBytecodeModule, type FunctionInfo, type ModuleData } from './bytecode';
import { ModuleBuilder } from './module-builder';
import { FunctionCompiler } from './function-compiler';
import { Op } from './opcodes';
import { measureMaxStack } from './stack';

/** What the compiler needs besides the program: the host table and constants it bakes in. */
export type CompileInputs = {
  readonly hostSignatures: readonly HostSignature[];
  readonly constants: readonly ConstantDef[];
  /** countTokens() of the source, stamped on the module (scoring-and-judging.md §Token count). */
  readonly tokenCount: number;
};

/** The name function 0 carries in the function table and in listings. */
export const MODULE_FUNCTION_NAME = '<module>';

/** Compiles a checked program into the opaque public module. */
export function compileProgram(program: Program, scopes: ScopeInfo, inputs: CompileInputs): BytecodeModule {
  return toBytecodeModule(compileModuleData(program, scopes, inputs));
}

/** Compiles a checked program into module data (the form the VM, the validator and the disassembler read). */
export function compileModuleData(program: Program, scopes: ScopeInfo, inputs: CompileInputs): ModuleData {
  const builder = new ModuleBuilder(scopes, inputs.hostSignatures, inputs.constants);
  const bounds: FunctionBounds[] = [compileModuleBody(program, builder)];
  const code = builder.emitter.finish();
  const functions: FunctionInfo[] = bounds.map((fn) => ({
    ...fn,
    maxStack: measureMaxStack(code, fn.entry, fn.end),
  }));
  return {
    languageVersion: LANGUAGE_VERSION,
    tokenCount: inputs.tokenCount,
    code,
    pool: builder.pool.build(),
    functions,
    globals: scopes.globals,
    constantDefs: inputs.constants,
    statements: builder.statements,
    opSpans: builder.opSpans,
    operandNames: builder.operandNames,
  };
}

/** A compiled function before its code is final: everything but maxStack, measured once code is finished. */
type FunctionBounds = Omit<FunctionInfo, 'maxStack'>;

/** Function 0: every file's top-level statements in run order, then HALT (the drone halts at the end). */
function compileModuleBody(program: Program, builder: ModuleBuilder): FunctionBounds {
  const entry = builder.emitter.pc;
  const body = new FunctionCompiler(builder);
  for (const file of program.files) body.compileBlock(file.body);
  builder.emitter.emit(Op.HALT);
  const lastFile = program.files[program.files.length - 1];
  return {
    name: MODULE_FUNCTION_NAME,
    arity: 0,
    localNames: [],
    entry,
    end: builder.emitter.pc,
    file: lastFile?.name ?? '',
  };
}
