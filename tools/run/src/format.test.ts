import type { Diagnostic } from '@harvest/lang';
import type { PlayerResult, SimResult } from '@harvest/sim';
import { describe, expect, it } from 'vitest';
import {
  formatDiagnostics,
  formatFooter,
  formatOutput,
  formatResultsTable,
  formatRuntimeErrors,
} from './format';
import type { Participant } from './format';

function result(slot: number, over: Partial<PlayerResult> = {}): PlayerResult {
  return {
    slot,
    score: 100,
    cyclesLastChange: 30_000,
    logicCycles: 500,
    programTokens: 40,
    cropsHarvested: 0,
    cyclesUsed: 30_000,
    awards: [],
    output: [],
    ...over,
  };
}

const PARTICIPANTS: readonly Participant[] = [
  { slot: 0, file: 'farm.sprout', compiled: true },
  { slot: 1, file: 'bots/grower.sprout', compiled: true },
  { slot: 2, file: 'broken.sprout', compiled: false },
];

function diagnostic(over: Partial<Diagnostic> = {}): Diagnostic {
  return {
    code: 'E-MISSING-COLON',
    severity: 'error',
    range: { file: 'main.sprout', line: 3, col: 9, endLine: 3, endCol: 10 },
    message: 'This `if` needs a colon at the end of the line.',
    ...over,
  };
}

describe('formatResultsTable', () => {
  it('lists place, slot, file, score, crops, cycles used and awards, best place first', () => {
    const table = formatResultsTable(PARTICIPANTS, [
      result(0, { score: 120, cropsHarvested: 4, cyclesUsed: 29_990, awards: ['bumper_crop'] }),
      result(1, {
        score: 340,
        cropsHarvested: 31,
        cyclesUsed: 30_000,
        awards: ['top_earner', 'never_thirsty'],
      }),
      result(2, { score: 0, cyclesUsed: 0 }),
    ]);
    expect(table.split('\n')).toEqual([
      'place  slot  file                score  crops  cycles used  awards',
      '1      1     bots/grower.sprout    340     31        30000  top_earner, never_thirsty',
      '2      0     farm.sprout           120      4        29990  bumper_crop',
      '3      2     broken.sprout           0      0            0',
    ]);
  });

  it('marks players tied on every key with a shared place such as =2', () => {
    const table = formatResultsTable(
      [
        { slot: 0, file: 'a.sprout', compiled: true },
        { slot: 1, file: 'b.sprout', compiled: true },
        { slot: 2, file: 'c.sprout', compiled: true },
      ],
      [result(0, { score: 300 }), result(1, { score: 100 }), result(2, { score: 100 })],
    );
    const places = table
      .split('\n')
      .slice(1)
      .map((line) => line.split(/\s+/)[0]);
    expect(places).toEqual(['1', '=2', '=2']);
  });

  it('places a player whose program did not compile below every player with a program', () => {
    const table = formatResultsTable(
      [
        { slot: 0, file: 'bad.sprout', compiled: false },
        { slot: 1, file: 'ok.sprout', compiled: true },
      ],
      [result(0, { score: 0 }), result(1, { score: 0 })],
    );
    expect(table.split('\n').map((line) => line.split(/\s+/)[1])).toEqual(['slot', '1', '0']);
  });
});

describe('formatDiagnostics', () => {
  it('prints file:line:col, the code and the message, with the path the user typed', () => {
    expect(formatDiagnostics('farm.sprout', [diagnostic()])).toEqual([
      'farm.sprout:3:9: error E-MISSING-COLON: This `if` needs a colon at the end of the line.',
    ]);
  });

  it('adds the help line when the diagnostic has one', () => {
    const lines = formatDiagnostics('farm.sprout', [diagnostic({ help: 'Add `:` after the condition.' })]);
    expect(lines).toEqual([
      'farm.sprout:3:9: error E-MISSING-COLON: This `if` needs a colon at the end of the line.',
      '  help: Add `:` after the condition.',
    ]);
  });

  it('prints warnings too, with their severity', () => {
    const lines = formatDiagnostics('farm.sprout', [
      diagnostic({ severity: 'warning', code: 'W-UNUSED-VAR' }),
    ]);
    expect(lines[0]).toContain('warning W-UNUSED-VAR');
  });

  it('prints nothing for no diagnostics', () => {
    expect(formatDiagnostics('farm.sprout', [])).toEqual([]);
  });
});

describe('formatRuntimeErrors', () => {
  it('names the slot, the file, the code and the line of a runtime error', () => {
    const lines = formatRuntimeErrors(PARTICIPANTS, [
      result(0),
      result(1, { error: { code: 'R-INDEX', line: 7 } }),
    ]);
    expect(lines).toEqual(['bots/grower.sprout:7: runtime error R-INDEX (slot 1)']);
  });

  it('skips players whose program did not compile (their compile diagnostics are printed instead)', () => {
    const lines = formatRuntimeErrors(PARTICIPANTS, [
      result(2, { error: { code: 'E-MISSING-COLON', line: 3 } }),
    ]);
    expect(lines).toEqual([]);
  });
});

describe('formatOutput', () => {
  it('prefixes each print line with the slot and file, in slot order', () => {
    const lines = formatOutput(PARTICIPANTS, [
      result(1, { output: ['b one', 'b two'] }),
      result(0, { output: ['a one'] }),
    ]);
    expect(lines).toEqual([
      '[slot 0 farm.sprout] a one',
      '[slot 1 bots/grower.sprout] b one',
      '[slot 1 bots/grower.sprout] b two',
    ]);
  });

  it('prints nothing when nobody printed', () => {
    expect(formatOutput(PARTICIPANTS, [result(0), result(1)])).toEqual([]);
  });
});

describe('formatFooter', () => {
  it('shows the event count and the final state hash as 8 hex digits', () => {
    const sim: SimResult = { players: [], finalStateHash: 0x1a2b, events: [] };
    expect(formatFooter(sim)).toEqual(['events: 0', 'finalStateHash: 0x00001a2b']);
  });

  it('prints a full uint32 hash', () => {
    const sim: SimResult = { players: [], finalStateHash: 0xffffffff, events: [{ t: 0, k: 'hash', h: 1 }] };
    expect(formatFooter(sim)).toEqual(['events: 1', 'finalStateHash: 0xffffffff']);
  });
});
