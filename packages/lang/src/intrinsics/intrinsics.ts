/**
 * The language intrinsics: builtins `lang` implements itself, as opposed to host builtins supplied
 * by `sim`. The scope resolver takes INTRINSIC_NAMES as `intrinsicNames` (binding one is
 * E-RESERVED-NAME); the checker validates call arity against INTRINSICS and METHODS; the compiler
 * emits them without a host table. Costs are defined once, in the op cost table of
 * docs/03-architecture/interpreter-vm.md, and implemented by the vm/ semantic functions.
 * Spec: docs/02-language/standard-library.md §Pure helpers; chief rulings 2026-10-11 (Q1, Q13, Q14).
 */

export type IntrinsicName = 'range' | 'len' | 'abs' | 'min' | 'max' | 'str' | 'int' | 'print';

export type MethodName = 'append' | 'pop' | 'get';

/** Accepted argument counts; `max` is absent when any number of arguments from `min` up is fine. */
export type Arity = { readonly min: number; readonly max?: number };

export const INTRINSICS: ReadonlyMap<IntrinsicName, Arity> = new Map<IntrinsicName, Arity>([
  ['range', { min: 1, max: 3 }],
  ['len', { min: 1, max: 1 }],
  ['abs', { min: 1, max: 1 }],
  ['min', { min: 1 }],
  ['max', { min: 1 }],
  ['str', { min: 1, max: 1 }],
  ['int', { min: 1, max: 1 }],
  ['print', { min: 0 }],
]);

/** list.append(x), list.pop([i]), dict.get(k[, default]): checked by name at compile time (Q13). */
export const METHODS: ReadonlyMap<MethodName, Arity> = new Map<MethodName, Arity>([
  ['append', { min: 1, max: 1 }],
  ['pop', { min: 0, max: 1 }],
  ['get', { min: 1, max: 2 }],
]);

export const INTRINSIC_NAMES: ReadonlySet<string> = new Set(INTRINSICS.keys());

/**
 * The intrinsics reached through CALL_INTRINSIC id argc, numbered by position. `range` is absent: it
 * compiles to ITER_INIT k. The ids are baked into bytecode and snapshots, so the order never changes
 * within a LANGUAGE_VERSION.
 */
export const CALLABLE_INTRINSICS: readonly IntrinsicName[] = [
  'len',
  'abs',
  'min',
  'max',
  'str',
  'int',
  'print',
];

/** The methods reached through CALL_METHOD m argc, numbered by position (same stability rule). */
export const METHOD_IDS: readonly MethodName[] = ['append', 'pop', 'get'];

export function isIntrinsicName(name: string): name is IntrinsicName {
  return INTRINSIC_NAMES.has(name);
}

/** True if `count` arguments are accepted by `arity`. */
export function acceptsArgCount(arity: Arity, count: number): boolean {
  return count >= arity.min && (arity.max === undefined || count <= arity.max);
}
