import { ACTION_COSTS, BUILTINS, CONSTANTS, SENSOR_COSTS, WAIT_BOUNDS } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { constantDefs, hostSignatures } from './signatures';

function signature(name: string, moveCost?: number) {
  const found = hostSignatures(moveCost === undefined ? undefined : { moveCost }).find(
    (s) => s.name === name,
  );
  if (found === undefined) throw new Error(`no signature for ${name}`);
  return found;
}

// interpreter-vm.md §Public API (HostSignature): sim hands the compiler one signature per builtin.
describe('hostSignatures', () => {
  it('has one signature per builtin, in BUILTINS order, with the table index as the host id', () => {
    const signatures = hostSignatures();
    expect(signatures.map((s) => s.name)).toEqual(BUILTINS.map((b) => b.name));
    expect(signatures.map((s) => s.id)).toEqual(BUILTINS.map((_, index) => index));
  });

  it('copies the parameter kinds, return kind and world-touching flag from the metadata', () => {
    for (const [index, meta] of BUILTINS.entries()) {
      const s = hostSignatures()[index];
      expect(s?.params).toEqual(meta.params);
      expect(s?.returns).toBe(meta.returns);
      expect(s?.touchesWorld).toBe(meta.touchesWorld);
    }
    expect(signature('plant')).toMatchObject({ params: ['const'], returns: 'bool', touchesWorld: true });
    expect(signature('random')).toMatchObject({ params: ['int'], returns: 'int', touchesWorld: false });
    expect(signature('spawn')).toMatchObject({ params: ['function'], returns: 'bool' });
  });

  it('bakes the default cycle costs from content (the 1-cycle CALL_HOST is not included)', () => {
    expect(signature('plant').cost).toBe(ACTION_COSTS.plant);
    expect(signature('harvest').cost).toBe(ACTION_COSTS.harvest);
    expect(signature('refill').cost).toBe(ACTION_COSTS.refill);
    expect(signature('sell').cost).toBe(ACTION_COSTS.sell);
    expect(signature('spawn').cost).toBe(ACTION_COSTS.spawn);
    expect(signature('halt').cost).toBe(0);
    expect(signature('crop').cost).toBe(SENSOR_COSTS.crop);
    expect(signature('price').cost).toBe(SENSOR_COSTS.price);
    expect(signature('wait').cost).toBe(WAIT_BOUNDS.min);
  });

  it('applies the drone move cost to move and to goto, per step, and to nothing else (Rotor upgrades)', () => {
    expect(signature('move').cost).toBe(ACTION_COSTS.move);
    for (const [moveCost, name] of [
      [9, 'move'],
      [9, 'goto'],
      [16, 'move'],
      [12, 'goto'],
    ] as const) {
      expect(signature(name, moveCost).cost).toBe(moveCost);
    }
    expect(signature('till', 9).cost).toBe(ACTION_COSTS.till);
    expect(signature('water', 9).cost).toBe(ACTION_COSTS.water);
    expect(signature('plant', 9).cost).toBe(ACTION_COSTS.plant);
  });

  it('renders the unlock as the editor lock text: chapter, skill node, or both, and nothing when always open', () => {
    expect(signature('move').unlock).toBe('Ch 1');
    expect(signature('till').unlock).toBe('Skill: till');
    expect(signature('sell').unlock).toBe('Ch 8 · Skill: sell');
    expect(signature('goto').unlock).toBe('Ch 5');
    for (const s of hostSignatures()) {
      expect(s.unlock === undefined || s.unlock.length > 0).toBe(true);
    }
  });

  it('gives distinct builtin names, so a name identifies one host id', () => {
    expect(new Set(BUILTINS.map((b) => b.name)).size).toBe(BUILTINS.length);
  });

  it('is a pure function: two calls give equal tables, and the tables do not alias each other', () => {
    expect(hostSignatures()).toEqual(hostSignatures());
    expect(hostSignatures()).not.toBe(hostSignatures());
  });
});

describe('constantDefs', () => {
  it('lists every game constant with its stable id and group', () => {
    expect(constantDefs()).toEqual(CONSTANTS.map((c) => ({ name: c.name, id: c.id, group: c.group })));
    expect(constantDefs().find((c) => c.name === 'RADISH')).toEqual({
      name: 'RADISH',
      id: 10,
      group: 'crop',
    });
    expect(constantDefs().find((c) => c.name === 'NORTH')).toEqual({
      name: 'NORTH',
      id: 0,
      group: 'direction',
    });
  });
});
