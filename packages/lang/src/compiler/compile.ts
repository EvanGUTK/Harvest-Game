/**
 * The Sprout compiler: a parsed, resolved and checked program → a bytecode module.
 * Spec: docs/03-architecture/interpreter-vm.md §Bytecode (module layout, compilation rules, canonical
 * emissions); docs/02-language/language-spec.md §Scoping, §Iteration, §Files.
 * Invariants: pure; called only for a program whose parse and check produced no error, so anything the
 * checker rejects is an InvariantError (LANG-UNCHECKED-PROGRAM) here, never a diagnostic; function 0 is
 * every file's top level in run order and ends in HALT; the emitted module always passes assertValidModule.
 */

import { InvariantError, assertNever } from '../invariant';
import type { DefStmt, Program, Statement } from '../parser/ast';
import type { ScopeInfo } from '../scope/scope';
import { analyze } from '../checker/analyze';
import { inSourceOrder } from '../checker/check';
import { countTokens } from '../lexer/count-tokens';
import { parse } from '../parser/parser';
import type {
  BytecodeModule,
  CompileOptions,
  CompileResult,
  ConstantDef,
  Diagnostic,
  HostSignature,
  SourceFiles,
} from '../types';
import { LANGUAGE_VERSION } from '../version';
import { toBytecodeModule, type FunctionInfo, type ModuleData } from './bytecode';
import { ModuleBuilder, unchecked } from './module-builder';
import { FunctionCompiler } from './function-compiler';
import { Op } from './opcodes';
import { measureMaxStack } from './stack';
import { assertValidModule } from './validate';

/** What the compiler needs besides the program: the host table and constants it bakes in. */
export type CompileInputs = {
  readonly hostSignatures: readonly HostSignature[];
  readonly constants: readonly ConstantDef[];
  /** countTokens() of the source, stamped on the module (scoring-and-judging.md §Token count). */
  readonly tokenCount: number;
};

/** The name function 0 carries in the function table and in listings. */
export const MODULE_FUNCTION_NAME = '<module>';

/**
 * The pipeline behind LangEngine.compile: parse, analyze (names, checks, warnings), then emit and
 * validate. A program with any error diagnostic is not compiled: parse errors alone are reported (the
 * checker would only add noise about statements the parser dropped), otherwise every check diagnostic.
 * Throws LANG-VERSION-MISMATCH when the host calls this bundle with another language version: choosing
 * the engine bundle for a program's version is the host's job (saves-and-persistence), so it is a host bug.
 */
export function compile(source: SourceFiles, opts: CompileOptions): CompileResult {
  if (opts.languageVersion !== LANGUAGE_VERSION) {
    throw new InvariantError(
      'LANG-VERSION-MISMATCH',
      `compile() of language ${LANGUAGE_VERSION} was called for ${opts.languageVersion}`,
    );
  }
  const parsed = parse(source, opts.limits);
  if (parsed.diagnostics.some(isError)) return { ok: false, diagnostics: [...parsed.diagnostics] };
  const analysis = analyze(parsed.program, opts);
  if (analysis.diagnostics.length > 0) {
    return {
      ok: false,
      diagnostics: inSourceOrder([...analysis.diagnostics, ...analysis.warnings], parsed.program),
    };
  }
  const tokenCount = countTokens(source);
  const data = compileModuleData(parsed.program, analysis.scopes, {
    hostSignatures: opts.hostSignatures,
    constants: opts.constants,
    tokenCount,
  });
  assertValidModule(data);
  return { ok: true, module: toBytecodeModule(data), tokenCount, warnings: [...analysis.warnings] };
}

function isError(diagnostic: Diagnostic): boolean {
  return diagnostic.severity === 'error';
}

/** Compiles a checked program into the opaque public module. */
export function compileProgram(program: Program, scopes: ScopeInfo, inputs: CompileInputs): BytecodeModule {
  return toBytecodeModule(compileModuleData(program, scopes, inputs));
}

/** Compiles a checked program into module data (the form the VM, the validator and the disassembler read). */
export function compileModuleData(program: Program, scopes: ScopeInfo, inputs: CompileInputs): ModuleData {
  const builder = new ModuleBuilder(scopes, inputs.hostSignatures, inputs.constants, collectDefs(program));
  const bounds: FunctionBounds[] = [compileModuleBody(program, builder)];
  for (const def of builder.defs) bounds.push(compileFunction(def, builder));
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

/**
 * A def's own function: its body, then the implicit `CONST None, RETURN` (a function without a `return`
 * gives back None). Locals are the resolver's frame slots: parameters first.
 */
function compileFunction(def: DefStmt, builder: ModuleBuilder): FunctionBounds {
  const scope = builder.scopes.functions.get(def);
  if (scope === undefined) throw unchecked(`no scope for def ${def.name.name}`);
  const entry = builder.emitter.pc;
  new FunctionCompiler(builder).compileBlock(def.body);
  builder.emitter.emit(Op.CONST, builder.pool.add({ kind: 'none' }));
  builder.emitter.emit(Op.RETURN);
  return {
    name: def.name.name,
    arity: def.params.length,
    localNames: scope.locals,
    entry,
    end: builder.emitter.pc,
    file: def.span.file,
  };
}

/** Every def in the program in pre-order (files in run order, a def before the defs inside it). */
function collectDefs(program: Program): readonly DefStmt[] {
  const defs: DefStmt[] = [];
  const visit = (stmts: readonly Statement[]): void => {
    for (const stmt of stmts) {
      if (stmt.type === 'DefStmt') defs.push(stmt);
      for (const block of statementBlocks(stmt)) visit(block);
    }
  };
  for (const file of program.files) visit(file.body);
  return defs;
}

/** The statement blocks directly inside `stmt`, def bodies included. */
function statementBlocks(stmt: Statement): readonly (readonly Statement[])[] {
  switch (stmt.type) {
    case 'IfStmt':
      return [stmt.body, ...stmt.elifs.map((e) => e.body), ...(stmt.orelse === null ? [] : [stmt.orelse])];
    case 'WhileStmt':
    case 'ForStmt':
    case 'RepeatStmt':
    case 'DefStmt':
      return [stmt.body];
    case 'ExprStmt':
    case 'AssignStmt':
    case 'AugAssignStmt':
    case 'PassStmt':
    case 'BreakStmt':
    case 'ContinueStmt':
    case 'ReturnStmt':
    case 'GlobalStmt':
      return [];
    default:
      return assertNever(stmt);
  }
}

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
