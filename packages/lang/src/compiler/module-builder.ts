/**
 * Everything the functions of one module share while they are compiled: the single emitter and constant
 * pool, the debug tables, and the lookups the compiler bakes in (host signatures, constant ids, scopes).
 * Spec: docs/03-architecture/interpreter-vm.md §Bytecode (module layout, debug tables).
 * Invariants: one emitter for all functions, so functions are contiguous; the debug tables are keyed by
 * the pc the emitter returned, so they always point at instruction starts.
 *
 * A class because a compilation accumulates state; it is created and discarded inside compileModuleData.
 */

import { InvariantError } from '../invariant';
import type { DefStmt } from '../parser/ast';
import type { ScopeInfo } from '../scope/scope';
import type { ConstantDef, HostSignature, Span } from '../types';
import { ConstantPool, type OperandNames, type StatementInfo } from './bytecode';
import { Emitter } from './emitter';
import { Op } from './opcodes';

export class ModuleBuilder {
  readonly emitter = new Emitter();
  readonly pool = new ConstantPool();
  readonly statements: StatementInfo[] = [];
  readonly opSpans = new Map<number, Span>();
  readonly operandNames = new Map<number, OperandNames>();
  private readonly hosts: ReadonlyMap<string, HostSignature>;
  private readonly constantIds: ReadonlyMap<string, number>;
  private readonly functionIndices: ReadonlyMap<DefStmt, number>;

  constructor(
    readonly scopes: ScopeInfo,
    hostSignatures: readonly HostSignature[],
    constants: readonly ConstantDef[],
    /** Every def in pre-order; def i is function i + 1 (function 0 is the module body). */
    readonly defs: readonly DefStmt[],
  ) {
    this.hosts = new Map(hostSignatures.map((s) => [s.name, s]));
    this.constantIds = new Map(constants.map((c) => [c.name, c.id]));
    this.functionIndices = new Map(defs.map((def, i) => [def, i + 1]));
  }

  functionIndex(def: DefStmt): number {
    const index = this.functionIndices.get(def);
    if (index === undefined) throw unchecked(`def ${def.name.name} was not collected`);
    return index;
  }

  /** Emits an instruction that can fail, recording where its error points. */
  emitAt(span: Span, opcode: number, ...operands: readonly number[]): number {
    const pc = this.emitter.emit(opcode, ...operands);
    this.opSpans.set(pc, span);
    return pc;
  }

  /** Records the plain variable names of an instruction's operands, when at least one is a name. */
  nameOperands(pc: number, names: OperandNames): void {
    if (names.some((n) => n !== null)) this.operandNames.set(pc, names);
  }

  /** `LINE s`: a new statement-table row for the statement starting `span`, then the marker itself. */
  emitLine(span: Span): void {
    const index = this.statements.push({ file: span.file, line: span.line, span }) - 1;
    this.emitter.emit(Op.LINE, index);
  }

  host(name: string): HostSignature {
    const sig = this.hosts.get(name);
    if (sig === undefined) throw unchecked(`no host signature for ${name}`);
    return sig;
  }

  constantId(name: string): number {
    const id = this.constantIds.get(name);
    if (id === undefined) throw unchecked(`no constant named ${name}`);
    return id;
  }
}

/** The compiler met something the checker rejects; it only ever compiles checked programs. */
export function unchecked(detail: string): InvariantError {
  return new InvariantError('LANG-UNCHECKED-PROGRAM', detail);
}
