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

/** What occupies a VM stack slot, as far as validation is concerned. */
export type SlotKind = 'value' | 'iterator' | 'counter';

/** A slot an instruction pops: a specific kind, or 'any' (POP also drops a loop's iterator on break). */
export type PopKind = SlotKind | 'any';

/** Pops (bottom to top) then pushes (bottom to top) along one control-flow edge. */
export type Transition = { readonly pops: readonly PopKind[]; readonly pushes: readonly SlotKind[] };

/**
 * An instruction's declared stack effect along each edge it has: `next` falls through to the following
 * instruction, `jump` goes to its target operand, `final` leaves the function (RETURN, HALT). An edge
 * that is absent does not exist (JUMP never falls through).
 */
export type StackEffect = {
  readonly next?: Transition;
  readonly jump?: Transition;
  readonly final?: Transition;
};

export type OpSpec = {
  readonly name: string;
  readonly operands: readonly OperandKind[];
  /** The stack effect, computed from the operands where it depends on them (CALL*, BUILD_*, ITER_INIT). */
  readonly effect: (operands: readonly number[]) => StackEffect;
};

const V = 'value';
const values = (count: number): readonly SlotKind[] => Array.from({ length: Math.max(count, 0) }, () => V);
const flow = (pops: readonly PopKind[], pushes: readonly SlotKind[]): StackEffect => ({
  next: { pops, pushes },
});
const operand = (operands: readonly number[], index: number): number => operands[index] ?? 0;
const BINARY = (): StackEffect => flow([V, V], [V]);

export const OP_SPECS = [
  { name: 'CONST', operands: ['pool'], effect: () => flow([], [V]) },
  { name: 'POP', operands: [], effect: () => flow(['any'], []) },
  { name: 'DUP', operands: [], effect: () => flow([V], [V, V]) },
  { name: 'SWAP', operands: [], effect: () => flow([V, V], [V, V]) },
  { name: 'ROT3', operands: [], effect: () => flow([V, V, V], [V, V, V]) },
  { name: 'DUP2', operands: [], effect: () => flow([V, V], [V, V, V, V]) },
  { name: 'LOAD_LOCAL', operands: ['local'], effect: () => flow([], [V]) },
  { name: 'STORE_LOCAL', operands: ['local'], effect: () => flow([V], []) },
  { name: 'LOAD_GLOBAL', operands: ['global'], effect: () => flow([], [V]) },
  { name: 'STORE_GLOBAL', operands: ['global'], effect: () => flow([V], []) },
  { name: 'ADD', operands: [], effect: BINARY },
  { name: 'SUB', operands: [], effect: BINARY },
  { name: 'MUL', operands: [], effect: BINARY },
  { name: 'FLOORDIV', operands: [], effect: BINARY },
  { name: 'MOD', operands: [], effect: BINARY },
  { name: 'NEG', operands: [], effect: () => flow([V], [V]) },
  { name: 'EQ', operands: [], effect: BINARY },
  { name: 'NE', operands: [], effect: BINARY },
  { name: 'LT', operands: [], effect: BINARY },
  { name: 'LE', operands: [], effect: BINARY },
  { name: 'GT', operands: [], effect: BINARY },
  { name: 'GE', operands: [], effect: BINARY },
  { name: 'IN', operands: [], effect: BINARY },
  { name: 'NOT', operands: [], effect: () => flow([V], [V]) },
  { name: 'JUMP', operands: ['target'], effect: () => ({ jump: { pops: [], pushes: [] } }) },
  {
    name: 'JUMP_IF_FALSE',
    operands: ['target'],
    effect: () => ({ next: { pops: [V], pushes: [] }, jump: { pops: [V], pushes: [] } }),
  },
  {
    name: 'JUMP_IF_TRUE_KEEP',
    operands: ['target'],
    effect: () => ({ next: { pops: [V], pushes: [] }, jump: { pops: [V], pushes: [V] } }),
  },
  {
    name: 'JUMP_IF_FALSE_KEEP',
    operands: ['target'],
    effect: () => ({ next: { pops: [V], pushes: [] }, jump: { pops: [V], pushes: [V] } }),
  },
  {
    name: 'ITER_INIT',
    operands: ['iterArgs'],
    effect: (o) => flow(values(operand(o, 0) === 0 ? 1 : operand(o, 0)), ['iterator']),
  },
  {
    name: 'ITER_NEXT',
    operands: ['target'],
    effect: () => ({
      next: { pops: ['iterator'], pushes: ['iterator', V] },
      jump: { pops: ['iterator'], pushes: [] },
    }),
  },
  { name: 'REPEAT_INIT', operands: [], effect: () => flow([V], ['counter']) },
  {
    name: 'REPEAT_NEXT',
    operands: ['target'],
    effect: () => ({
      next: { pops: ['counter'], pushes: ['counter'] },
      jump: { pops: ['counter'], pushes: [] },
    }),
  },
  { name: 'CALL', operands: ['count'], effect: (o) => flow(values(operand(o, 0) + 1), [V]) },
  {
    name: 'CALL_HOST',
    operands: ['host', 'count', 'cost', 'flag'],
    effect: (o) => flow(values(operand(o, 1)), [V]),
  },
  {
    name: 'CALL_INTRINSIC',
    operands: ['intrinsic', 'count'],
    effect: (o) => flow(values(operand(o, 1)), [V]),
  },
  { name: 'CALL_METHOD', operands: ['method', 'count'], effect: (o) => flow(values(operand(o, 1) + 1), [V]) },
  { name: 'RETURN', operands: [], effect: () => ({ final: { pops: [V], pushes: [] } }) },
  { name: 'HALT', operands: [], effect: () => ({ final: { pops: [], pushes: [] } }) },
  { name: 'BUILD_LIST', operands: ['count'], effect: (o) => flow(values(operand(o, 0)), [V]) },
  { name: 'BUILD_DICT', operands: ['count'], effect: (o) => flow(values(2 * operand(o, 0)), [V]) },
  { name: 'INDEX_GET', operands: [], effect: BINARY },
  { name: 'INDEX_SET', operands: [], effect: () => flow([V, V, V], []) },
  { name: 'LINE', operands: ['statement'], effect: () => flow([], []) },
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
