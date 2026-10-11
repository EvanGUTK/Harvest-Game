/**
 * The Sprout opcodes: numbers, names and operand kinds, defined once.
 * Spec: docs/03-architecture/interpreter-vm.md §Bytecode (op list, module layout, op cost table).
 * Invariants: an opcode is its index in OP_SPECS, and `Op` names every entry exactly once (the type
 * checker enforces both directions); the numbering is baked into modules and snapshots, so it only
 * changes with LANGUAGE_VERSION. Cycle costs live in the op cost table and the VM, not here.
 */

/** What an operand word means, so modules can be validated and disassembled generically. */
export type OperandKind =
  | 'pool' // index into the constant pool
  | 'local' // local slot of the current function
  | 'global' // global slot
  | 'target' // absolute pc of an instruction in the same function
  | 'count' // argument or element count, >= 0
  | 'host' // HostId
  | 'cost' // baked host cost, >= 0
  | 'flag' // 0 or 1
  | 'intrinsic' // index into CALLABLE_INTRINSICS
  | 'method' // index into METHOD_IDS
  | 'statement' // index into the statement table
  | 'iterArgs'; // ITER_INIT k: 0 (iterable on the stack) or 1..3 range arguments

export type OpSpec = { readonly name: string; readonly operands: readonly OperandKind[] };

export const OP_SPECS = [
  { name: 'CONST', operands: ['pool'] },
  { name: 'POP', operands: [] },
  { name: 'DUP', operands: [] },
  { name: 'SWAP', operands: [] },
  { name: 'ROT3', operands: [] },
  { name: 'DUP2', operands: [] },
  { name: 'LOAD_LOCAL', operands: ['local'] },
  { name: 'STORE_LOCAL', operands: ['local'] },
  { name: 'LOAD_GLOBAL', operands: ['global'] },
  { name: 'STORE_GLOBAL', operands: ['global'] },
  { name: 'ADD', operands: [] },
  { name: 'SUB', operands: [] },
  { name: 'MUL', operands: [] },
  { name: 'FLOORDIV', operands: [] },
  { name: 'MOD', operands: [] },
  { name: 'NEG', operands: [] },
  { name: 'EQ', operands: [] },
  { name: 'NE', operands: [] },
  { name: 'LT', operands: [] },
  { name: 'LE', operands: [] },
  { name: 'GT', operands: [] },
  { name: 'GE', operands: [] },
  { name: 'IN', operands: [] },
  { name: 'NOT', operands: [] },
  { name: 'JUMP', operands: ['target'] },
  { name: 'JUMP_IF_FALSE', operands: ['target'] },
  { name: 'JUMP_IF_TRUE_KEEP', operands: ['target'] },
  { name: 'JUMP_IF_FALSE_KEEP', operands: ['target'] },
  { name: 'ITER_INIT', operands: ['iterArgs'] },
  { name: 'ITER_NEXT', operands: ['target'] },
  { name: 'REPEAT_INIT', operands: [] },
  { name: 'REPEAT_NEXT', operands: ['target'] },
  { name: 'CALL', operands: ['count'] },
  { name: 'CALL_HOST', operands: ['host', 'count', 'cost', 'flag'] },
  { name: 'CALL_INTRINSIC', operands: ['intrinsic', 'count'] },
  { name: 'CALL_METHOD', operands: ['method', 'count'] },
  { name: 'RETURN', operands: [] },
  { name: 'HALT', operands: [] },
  { name: 'BUILD_LIST', operands: ['count'] },
  { name: 'BUILD_DICT', operands: ['count'] },
  { name: 'INDEX_GET', operands: [] },
  { name: 'INDEX_SET', operands: [] },
  { name: 'LINE', operands: ['statement'] },
] as const satisfies readonly OpSpec[];

export type OpName = (typeof OP_SPECS)[number]['name'];

/** Opcode numbers by name; each equals the entry's index in OP_SPECS (checked by test). */
export const Op: Readonly<Record<OpName, number>> = {
  CONST: 0,
  POP: 1,
  DUP: 2,
  SWAP: 3,
  ROT3: 4,
  DUP2: 5,
  LOAD_LOCAL: 6,
  STORE_LOCAL: 7,
  LOAD_GLOBAL: 8,
  STORE_GLOBAL: 9,
  ADD: 10,
  SUB: 11,
  MUL: 12,
  FLOORDIV: 13,
  MOD: 14,
  NEG: 15,
  EQ: 16,
  NE: 17,
  LT: 18,
  LE: 19,
  GT: 20,
  GE: 21,
  IN: 22,
  NOT: 23,
  JUMP: 24,
  JUMP_IF_FALSE: 25,
  JUMP_IF_TRUE_KEEP: 26,
  JUMP_IF_FALSE_KEEP: 27,
  ITER_INIT: 28,
  ITER_NEXT: 29,
  REPEAT_INIT: 30,
  REPEAT_NEXT: 31,
  CALL: 32,
  CALL_HOST: 33,
  CALL_INTRINSIC: 34,
  CALL_METHOD: 35,
  RETURN: 36,
  HALT: 37,
  BUILD_LIST: 38,
  BUILD_DICT: 39,
  INDEX_GET: 40,
  INDEX_SET: 41,
  LINE: 42,
};

/** The spec of an opcode, or undefined for a number that is not one. */
export function opSpec(opcode: number): OpSpec | undefined {
  return OP_SPECS[opcode];
}

/** Words an instruction occupies: the opcode plus its operands. */
export function instructionWidth(spec: OpSpec): number {
  return 1 + spec.operands.length;
}

export type DecodedInstruction = {
  readonly pc: number;
  readonly spec: OpSpec;
  readonly operands: readonly number[];
};

/** The instruction at `pc`, or undefined if `code[pc]` is not an opcode or its operands run past `end`. */
export function decodeInstruction(code: Int32Array, pc: number, end: number): DecodedInstruction | undefined {
  const spec = opSpec(code[pc] ?? -1);
  if (spec === undefined || pc + instructionWidth(spec) > end) return undefined;
  return { pc, spec, operands: Array.from(code.subarray(pc + 1, pc + instructionWidth(spec))) };
}
