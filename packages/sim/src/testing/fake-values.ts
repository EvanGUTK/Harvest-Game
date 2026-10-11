/**
 * A minimal `ValueOps` for sim tests: tagged plain objects instead of the VM's real values.
 * Design: docs/03-architecture/interpreter-vm.md §Public API (ValueOps is the only way hosts build and inspect Values).
 * Invariants: test double only (never imported by production code); `kindOf` is exact for every kind sim reads;
 * `list` and `fn` build kinds that `ValueOps` cannot construct, so tests can pass them as wrong arguments.
 */

import type { Value, ValueKind, ValueOps } from '@harvest/lang';

type FakeValue = Value & { readonly kind: ValueKind; readonly payload: number | boolean | string | null };

function make(kind: ValueKind, payload: FakeValue['payload']): Value {
  const value: FakeValue = { __brand: 'SproutValue', kind, payload };
  return value;
}

function read(v: Value): FakeValue {
  return v as FakeValue;
}

export type FakeValues = ValueOps & { list(): Value; fn(): Value };

export function createFakeValues(): FakeValues {
  return {
    int: (n) => make('int', n),
    bool: (b) => make('bool', b),
    str: (s) => make('str', s),
    constant: (id) => make('const', id),
    none: make('none', null),
    list: () => make('list', null),
    fn: () => make('function', null),
    kindOf: (v) => read(v).kind,
    asInt: (v) => Number(read(v).payload),
    asBool: (v) => read(v).payload === true,
    asStr: (v) => String(read(v).payload),
    asConstantId: (v) => Number(read(v).payload),
  };
}
