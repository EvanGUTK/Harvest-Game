import { BOTS } from '@harvest/content';
import { describe, expect, it } from 'vitest';
import { loadPrograms } from './sources';

const files: Record<string, string> = { 'a.sprout': 'move(EAST)\n', 'b.sprout': 'halt()\n' };

function readFile(path: string): string {
  const text = files[path];
  if (text === undefined) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
  return text;
}

/** Throws a value that is not an Error object, as a failing read callback might. */
function raise(value: unknown): never {
  throw value;
}

describe('loadPrograms', () => {
  it('reads each file as a one-file program named main.sprout, labelled with the path the user typed', () => {
    const loaded = loadPrograms(
      [
        { kind: 'file', path: 'a.sprout' },
        { kind: 'file', path: 'b.sprout' },
      ],
      readFile,
    );
    expect(loaded).toEqual({
      ok: true,
      programs: [
        { slot: 0, label: 'a.sprout', files: [{ name: 'main.sprout', text: 'move(EAST)\n' }] },
        { slot: 1, label: 'b.sprout', files: [{ name: 'main.sprout', text: 'halt()\n' }] },
      ],
    });
  });

  it('takes a bot from the BOTS table instead of the disk, labelled bot:<id>', () => {
    const grower = BOTS.find((b) => b.id === 'grower');
    const loaded = loadPrograms([{ kind: 'bot', id: 'grower' }], () => {
      throw new Error('a bot must not be read from disk');
    });
    expect(loaded).toEqual({
      ok: true,
      programs: [
        { slot: 0, label: 'bot:grower', files: [{ name: 'main.sprout', text: grower?.source ?? '' }] },
      ],
    });
  });

  it('numbers the slots in the order given, mixing files and bots', () => {
    const loaded = loadPrograms(
      [
        { kind: 'file', path: 'a.sprout' },
        { kind: 'bot', id: 'seedling' },
        { kind: 'bot', id: 'agronomist' },
      ],
      readFile,
    );
    expect(loaded.ok && loaded.programs.map((p) => [p.slot, p.label])).toEqual([
      [0, 'a.sprout'],
      [1, 'bot:seedling'],
      [2, 'bot:agronomist'],
    ]);
  });

  it('reports a file that cannot be read, naming the path and the reason, and reads no further', () => {
    const loaded = loadPrograms(
      [
        { kind: 'file', path: 'missing.sprout' },
        { kind: 'file', path: 'a.sprout' },
      ],
      readFile,
    );
    expect(loaded).toEqual({
      ok: false,
      message: "cannot read missing.sprout: ENOENT: no such file or directory, open 'missing.sprout'",
    });
  });

  it('reports a read failure that is not an Error object', () => {
    const loaded = loadPrograms([{ kind: 'file', path: 'x.sprout' }], () => raise('denied'));
    expect(loaded).toEqual({ ok: false, message: 'cannot read x.sprout: denied' });
  });

  it('reports a bot id that is not in BOTS', () => {
    const loaded = loadPrograms([{ kind: 'bot', id: 'scarecrow' }], readFile);
    expect(loaded.ok).toBe(false);
    expect(loaded.ok ? '' : loaded.message).toContain('scarecrow');
  });
});
