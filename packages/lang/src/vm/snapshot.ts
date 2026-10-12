/**
 * VM snapshots: a plain, JSON-serialisable record of a machine that restores to an identical one.
 * Spec: docs/03-architecture/interpreter-vm.md §Public API (snapshot, restoreVM: self-contained) and
 * §VM (the live heap count is part of the snapshot; second drone: a kind/version word, chief ruling
 * V8).
 * Restoring refuses a snapshot from another language version (LANG-VERSION-MISMATCH, chief ruling).
 * Invariants: heap objects are written once by id and restored as one object, so sharing and cycles
 * survive; the live-cell count is stored as a number, because unreachable cycles are never reclaimed
 * yet still count; restoring checks the format word, version and kind before reading anything else;
 * snapshot → restore → snapshot is the identity.
 */

import type { BytecodeModule, Limits, Span, VMSnapshot, VMYield } from '../types';
import { InvariantError, assertNever } from '../invariant';
import {
  toBytecodeModule,
  type FunctionInfo,
  type ModuleData,
  type OperandNames,
  type PoolEntry,
  type StatementInfo,
} from '../compiler/bytecode';
import { assertValidModule } from '../compiler/validate';
import { LANGUAGE_VERSION } from '../version';
import type { ConstantDef } from '../types';
import { isLoopState, type LoopState, type StackItem } from './loops';
import type { Frame, Machine, MachineState, Slot, Status } from './machine';
import {
  constValue,
  dictKeyOf,
  fnValue,
  isHeapObj,
  literalStr,
  strCells,
  type DictEntry,
  type DictKey,
  type DictObj,
  type HeapObj,
  type ListObj,
  type RtValue,
  type StrObj,
} from './value';

export const SNAPSHOT_FORMAT = 'sprout-vm-snapshot';
export const SNAPSHOT_FORMAT_VERSION = 1;

/** A value: immediates as themselves; everything else tagged. */
export type ValueJson =
  | number
  | boolean
  | null
  | { readonly ref: number }
  | { readonly s: string }
  | { readonly f: number }
  | { readonly c: number };

export type SlotJson = ValueJson | { readonly unbound: true };

export type ObjectJson =
  | { readonly id: number; readonly rc: number; readonly t: 'str'; readonly text: string }
  | { readonly id: number; readonly rc: number; readonly t: 'list'; readonly items: readonly ValueJson[] }
  | {
      readonly id: number;
      readonly rc: number;
      readonly t: 'dict';
      readonly entries: readonly (readonly [ValueJson, ValueJson])[];
    };

export type LoopJson =
  | { readonly loop: 'iter-list' | 'iter-str'; readonly over: ValueJson; readonly index: number }
  | {
      readonly loop: 'iter-dict';
      readonly over: ValueJson;
      readonly keys: readonly ValueJson[];
      readonly index: number;
    }
  | { readonly loop: 'iter-range'; readonly next: number; readonly stop: number; readonly step: number }
  | { readonly loop: 'repeat'; readonly remaining: number };

export type StatusJson =
  | { readonly kind: 'running' }
  | {
      readonly kind: 'awaiting-host';
      readonly pc: number;
      readonly cost: number;
      readonly args: readonly ValueJson[];
    }
  | { readonly kind: 'finished'; readonly final: VMYield };

export type ModuleJson = {
  readonly languageVersion: string;
  readonly tokenCount: number;
  readonly code: readonly number[];
  readonly pool: readonly PoolEntry[];
  readonly functions: readonly FunctionInfo[];
  readonly globals: readonly string[];
  readonly constantDefs: readonly ConstantDef[];
  readonly statements: readonly StatementInfo[];
  readonly opSpans: readonly (readonly [number, Span])[];
  readonly operandNames: readonly (readonly [number, OperandNames])[];
};

export type SnapshotJson = {
  readonly format: typeof SNAPSHOT_FORMAT;
  readonly formatVersion: number;
  /** 'single': one VM. M2 adds 'program' (a VM and its spawned drone sharing one heap). */
  readonly kind: 'single';
  readonly languageVersion: string;
  readonly limits: Limits;
  readonly module: ModuleJson;
  readonly heap: {
    readonly liveCells: number;
    readonly nextId: number;
    readonly objects: readonly ObjectJson[];
  };
  readonly machine: {
    readonly stack: readonly (ValueJson | LoopJson)[];
    readonly frames: readonly {
      readonly fnIndex: number;
      readonly returnPc: number;
      readonly base: number;
      readonly locals: readonly SlotJson[];
    }[];
    readonly globals: readonly SlotJson[];
    readonly printed: readonly string[];
    readonly ip: number;
    readonly cycles: number;
    readonly dropped: number;
    readonly statement: number;
    readonly status: StatusJson;
  };
};

/** Encodes a machine; the result is JSON-serialisable and carries its module. */
export function snapshotMachine(machine: Machine): VMSnapshot {
  const state = machine.state();
  const objects = new Map<number, ObjectJson>();
  const value = (v: RtValue): ValueJson => encodeValue(v, objects);
  const json: SnapshotJson = {
    format: SNAPSHOT_FORMAT,
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    kind: 'single',
    languageVersion: machine.module.languageVersion,
    limits: { ...machine.limits },
    module: encodeModule(machine.module),
    heap: { ...state.heap, objects: [] },
    machine: {
      stack: state.stack.map((item) => encodeItem(item, value)),
      frames: state.frames.map((f) => ({
        fnIndex: f.fnIndex,
        returnPc: f.returnPc,
        base: f.base,
        locals: f.locals.map((slot) => encodeSlot(slot, value)),
      })),
      globals: state.globals.map((slot) => encodeSlot(slot, value)),
      printed: [...state.printed],
      ip: state.ip,
      cycles: state.cycles,
      dropped: state.dropped,
      statement: state.statement,
      status: encodeStatus(state.status, value),
    },
  };
  const ordered = [...objects.values()].sort((a, b) => a.id - b.id);
  return { ...json, heap: { ...json.heap, objects: ordered } } as unknown as VMSnapshot;
}

/** What a machine is rebuilt from: decoded from a snapshot made by snapshotMachine, in any process. */
export type RestoredParts = {
  readonly module: BytecodeModule;
  readonly limits: Limits;
  readonly state: MachineState;
};

export function decodeSnapshot(snapshot: VMSnapshot): RestoredParts {
  const json = readSnapshot(snapshot);
  const data = decodeModule(json.module);
  assertValidModule(data);
  const objects = decodeObjects(json.heap.objects);
  const value = (v: ValueJson): RtValue => decodeValue(v, objects);
  const m = json.machine;
  const state: MachineState = {
    stack: m.stack.map((item) => decodeItem(item, value)),
    frames: m.frames.map((f): Frame => ({
      fnIndex: f.fnIndex,
      returnPc: f.returnPc,
      base: f.base,
      locals: f.locals.map((s) => decodeSlot(s, value)),
    })),
    globals: m.globals.map((s) => decodeSlot(s, value)),
    printed: m.printed,
    ip: m.ip,
    cycles: m.cycles,
    dropped: m.dropped,
    statement: m.statement,
    status: decodeStatus(m.status, value),
    heap: { liveCells: json.heap.liveCells, nextId: json.heap.nextId },
  };
  return { module: toBytecodeModule(data), limits: json.limits, state };
}

function readSnapshot(snapshot: VMSnapshot): SnapshotJson {
  const json = snapshot as unknown as Partial<SnapshotJson>;
  if (json.format !== SNAPSHOT_FORMAT) throw snapshotError('not a Sprout VM snapshot');
  if (json.formatVersion !== SNAPSHOT_FORMAT_VERSION) {
    throw snapshotError(
      `snapshot format version ${String(json.formatVersion)} is not ${String(SNAPSHOT_FORMAT_VERSION)}`,
    );
  }
  if (json.kind !== 'single') throw snapshotError(`snapshot kind ${String(json.kind)} is not supported`);
  if (json.languageVersion !== LANGUAGE_VERSION) {
    // A snapshot from another bundle would run its bytecode under different semantics: a host bug.
    throw new InvariantError(
      'LANG-VERSION-MISMATCH',
      `snapshot language ${String(json.languageVersion)} is not ${LANGUAGE_VERSION}`,
    );
  }
  return json as SnapshotJson;
}

// ---------- Values ----------

function encodeValue(v: RtValue, objects: Map<number, ObjectJson>): ValueJson {
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return v;
  switch (v.tag) {
    case 'fn':
      return { f: v.index };
    case 'const':
      return { c: v.id };
    case 'str':
      if (v.pinned) return { s: v.text };
      encodeObject(v, objects);
      return { ref: v.id };
    case 'list':
    case 'dict':
      encodeObject(v, objects);
      return { ref: v.id };
    default:
      return assertNever(v);
  }
}

/** Writes each reachable heap object once, iteratively (a 10,000-deep nest must not recurse). */
function encodeObject(root: HeapObj, objects: Map<number, ObjectJson>): void {
  const pending: HeapObj[] = [root];
  for (let obj = pending.pop(); obj !== undefined; obj = pending.pop()) {
    if (objects.has(obj.id)) continue;
    const ref = (member: RtValue): ValueJson => {
      if (isCountedObject(member) && !objects.has(member.id)) pending.push(member);
      return isCountedObject(member) ? { ref: member.id } : encodeValue(member, objects);
    };
    objects.set(obj.id, objectJson(obj, ref));
  }
}

function objectJson(obj: HeapObj, ref: (v: RtValue) => ValueJson): ObjectJson {
  switch (obj.tag) {
    case 'str':
      return { id: obj.id, rc: obj.rc, t: 'str', text: obj.text };
    case 'list':
      return { id: obj.id, rc: obj.rc, t: 'list', items: obj.items.map(ref) };
    case 'dict':
      return {
        id: obj.id,
        rc: obj.rc,
        t: 'dict',
        entries: [...obj.entries.values()].map((e) => [ref(e.key), ref(e.value)] as const),
      };
    default:
      return assertNever(obj);
  }
}

function isCountedObject(v: RtValue): v is HeapObj {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v.tag === 'list' || v.tag === 'dict' || (v.tag === 'str' && !v.pinned))
  );
}

/** Rebuilds every object as an empty shell first, then fills members, so shared and cyclic refs resolve. */
function decodeObjects(objects: readonly ObjectJson[]): ReadonlyMap<number, HeapObj> {
  const byId = new Map<number, HeapObj>();
  for (const o of objects) byId.set(o.id, shell(o));
  const value = (v: ValueJson): RtValue => decodeValue(v, byId);
  for (const o of objects) fill(o, byId.get(o.id), value);
  return byId;
}

function shell(o: ObjectJson): HeapObj {
  switch (o.t) {
    case 'str': {
      const s: StrObj = {
        tag: 'str',
        text: o.text,
        cells: strCells(o.text.length),
        pinned: false,
        rc: o.rc,
        id: o.id,
      };
      return s;
    }
    case 'list': {
      const list: ListObj = { tag: 'list', items: [], rc: o.rc, id: o.id };
      return list;
    }
    case 'dict': {
      const dict: DictObj = { tag: 'dict', entries: new Map<DictKey, DictEntry>(), rc: o.rc, id: o.id };
      return dict;
    }
    default:
      return assertNever(o);
  }
}

function fill(o: ObjectJson, target: HeapObj | undefined, value: (v: ValueJson) => RtValue): void {
  if (o.t === 'list' && target?.tag === 'list') target.items.push(...o.items.map(value));
  if (o.t === 'dict' && target?.tag === 'dict') {
    for (const [k, v] of o.entries) {
      const key = value(k);
      const dictKey = dictKeyOf(key);
      if (dictKey === undefined) throw snapshotError(`dict ${String(o.id)} has an unusable key`);
      target.entries.set(dictKey, { key, value: value(v) });
    }
  }
}

function decodeValue(v: ValueJson, objects: ReadonlyMap<number, HeapObj>): RtValue {
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return v;
  if ('ref' in v) {
    const obj = objects.get(v.ref);
    if (obj === undefined) throw snapshotError(`object ${String(v.ref)} is missing`);
    return obj;
  }
  if ('s' in v) return literalStr(v.s);
  if ('f' in v) return fnValue(v.f);
  return constValue(v.c);
}

function encodeSlot(slot: Slot, value: (v: RtValue) => ValueJson): SlotJson {
  return slot === undefined ? { unbound: true } : value(slot);
}

function decodeSlot(slot: SlotJson, value: (v: ValueJson) => RtValue): Slot {
  return typeof slot === 'object' && slot !== null && 'unbound' in slot ? undefined : value(slot);
}

// ---------- Stack and status ----------

function encodeItem(item: StackItem, value: (v: RtValue) => ValueJson): ValueJson | LoopJson {
  return isLoopState(item) ? encodeLoop(item, value) : value(item);
}

function encodeLoop(state: LoopState, value: (v: RtValue) => ValueJson): LoopJson {
  switch (state.tag) {
    case 'iter-list':
      return { loop: 'iter-list', over: value(state.list), index: state.index };
    case 'iter-str':
      return { loop: 'iter-str', over: value(state.str), index: state.index };
    case 'iter-dict':
      return { loop: 'iter-dict', over: value(state.dict), keys: state.keys.map(value), index: state.index };
    case 'iter-range':
      return { loop: 'iter-range', next: state.next, stop: state.stop, step: state.step };
    case 'repeat':
      return { loop: 'repeat', remaining: state.remaining };
    default:
      return assertNever(state);
  }
}

function decodeItem(item: ValueJson | LoopJson, value: (v: ValueJson) => RtValue): StackItem {
  if (typeof item === 'object' && item !== null && 'loop' in item) return decodeLoop(item, value);
  return value(item);
}

function decodeLoop(json: LoopJson, value: (v: ValueJson) => RtValue): LoopState {
  switch (json.loop) {
    case 'iter-list':
      return { tag: 'iter-list', list: expectTag(value(json.over), 'list'), index: json.index };
    case 'iter-str':
      return { tag: 'iter-str', str: expectTag(value(json.over), 'str'), index: json.index };
    case 'iter-dict':
      return {
        tag: 'iter-dict',
        dict: expectTag(value(json.over), 'dict'),
        keys: json.keys.map(value),
        index: json.index,
      };
    case 'iter-range':
      return { tag: 'iter-range', next: json.next, stop: json.stop, step: json.step };
    case 'repeat':
      return { tag: 'repeat', remaining: json.remaining };
    default:
      return assertNever(json);
  }
}

function expectTag<T extends 'list' | 'str' | 'dict'>(v: RtValue, tag: T): Extract<HeapObj, { tag: T }> {
  if (!isHeapObj(v) || v.tag !== tag) throw snapshotError(`expected a ${tag} under a loop`);
  return v as Extract<HeapObj, { tag: T }>;
}

function encodeStatus(status: Status, value: (v: RtValue) => ValueJson): StatusJson {
  switch (status.kind) {
    case 'running':
      return { kind: 'running' };
    case 'awaiting-host':
      return {
        kind: 'awaiting-host',
        pc: status.call.pc,
        cost: status.call.cost,
        args: status.call.args.map(value),
      };
    case 'finished':
      return { kind: 'finished', final: status.final };
    default:
      return assertNever(status);
  }
}

function decodeStatus(json: StatusJson, value: (v: ValueJson) => RtValue): Status {
  switch (json.kind) {
    case 'running':
      return { kind: 'running' };
    case 'awaiting-host':
      return { kind: 'awaiting-host', call: { pc: json.pc, cost: json.cost, args: json.args.map(value) } };
    case 'finished':
      return { kind: 'finished', final: json.final };
    default:
      return assertNever(json);
  }
}

// ---------- Module ----------

function encodeModule(data: ModuleData): ModuleJson {
  return {
    languageVersion: data.languageVersion,
    tokenCount: data.tokenCount,
    code: Array.from(data.code),
    pool: data.pool,
    functions: data.functions,
    globals: data.globals,
    constantDefs: data.constantDefs,
    statements: data.statements,
    opSpans: [...data.opSpans],
    operandNames: [...data.operandNames],
  };
}

function decodeModule(json: ModuleJson): ModuleData {
  return {
    languageVersion: json.languageVersion,
    tokenCount: json.tokenCount,
    code: Int32Array.from(json.code),
    pool: json.pool,
    functions: json.functions,
    globals: json.globals,
    constantDefs: json.constantDefs,
    statements: json.statements,
    opSpans: new Map(json.opSpans),
    operandNames: new Map(json.operandNames),
  };
}

function snapshotError(message: string): InvariantError {
  return new InvariantError('LANG-BAD-SNAPSHOT', message);
}
