import { describe, expect, it } from 'vitest';
import type { BytecodeModule } from '../types';
import { InvariantError } from '../invariant';
import { assemble } from '../test-support/assemble';
import { ConstantPool, moduleData, toBytecodeModule } from './bytecode';
import { Op } from './opcodes';

describe('ConstantPool', () => {
  it('gives equal literals one index and keeps kinds apart', () => {
    const pool = new ConstantPool();
    expect(pool.add({ kind: 'int', value: 1 })).toBe(0);
    expect(pool.add({ kind: 'str', text: '1' })).toBe(1);
    expect(pool.add({ kind: 'bool', value: true })).toBe(2);
    expect(pool.add({ kind: 'int', value: 1 })).toBe(0);
    expect(pool.add({ kind: 'const', id: 1 })).toBe(3);
    expect(pool.add({ kind: 'fn', index: 1 })).toBe(4);
    expect(pool.add({ kind: 'none' })).toBe(5);
    expect(pool.add({ kind: 'str', text: '1' })).toBe(1);
    expect(pool.build()).toHaveLength(6);
  });
});

describe('BytecodeModule brand (interpreter-vm.md §Public API: opaque outside lang)', () => {
  it('round-trips module data and exposes the language version and token count', () => {
    const data = assemble({ functions: [{ name: '<module>', body: (e) => e.emit(Op.HALT) }], tokenCount: 7 });
    const module = toBytecodeModule(data);
    expect(module.languageVersion).toBe('0.1.0');
    expect(module.tokenCount).toBe(7);
    expect(moduleData(module)).toBe(data);
  });

  it('throws LANG-FOREIGN-MODULE for an object lang did not build', () => {
    const fake = { languageVersion: '0.1.0', tokenCount: 0 } as unknown as BytecodeModule;
    expect(() => moduleData(fake)).toThrow(InvariantError);
  });
});
