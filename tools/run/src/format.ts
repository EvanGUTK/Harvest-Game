/**
 * Plain-text formatting of a finished run: results table, diagnostics, runtime errors, print output, footer.
 * Design: docs/03-architecture/simulation-engine.md §Public API, docs/01-game-design/scoring-and-judging.md §Results.
 * Invariants: pure functions from data to lines of text; the path shown for a player is the one the user typed.
 */

import type { Diagnostic } from '@harvest/lang';
import { rankPlayers } from '@harvest/sim';
import type { PlayerResult, Placement, SimResult } from '@harvest/sim';

/** One player of the run: the slot, the file the user named for it, and whether it compiled. */
export type Participant = {
  slot: number;
  file: string;
  compiled: boolean;
};

const COLUMN_GAP = '  ';
const HEX_DIGITS = 8;
const HEX_RADIX = 16;

export type Align = 'left' | 'right';
export type Column = { header: string; align: Align; cells: readonly string[] };

function pad(text: string, width: number, align: Align): string {
  return align === 'left' ? text.padEnd(width) : text.padStart(width);
}

/** Columns of equal length as an aligned plain-text table: a header row, then one row per cell, no trailing spaces. */
export function renderTable(columns: readonly Column[]): string {
  const widths = columns.map((c) => Math.max(c.header.length, ...c.cells.map((cell) => cell.length)));
  const rowCount = columns[0]?.cells.length ?? 0;
  const lines = [columns.map((c, i) => pad(c.header, widths[i] ?? 0, c.align)).join(COLUMN_GAP)];
  for (let row = 0; row < rowCount; row += 1) {
    lines.push(columns.map((c, i) => pad(c.cells[row] ?? '', widths[i] ?? 0, c.align)).join(COLUMN_GAP));
  }
  return lines.map((line) => line.trimEnd()).join('\n');
}

function placeLabel(placement: Placement): string {
  return placement.shared ? `=${placement.place}` : String(placement.place);
}

function placements(participants: readonly Participant[], results: readonly PlayerResult[]): Placement[] {
  const idleSlots = new Set(participants.filter((p) => !p.compiled).map((p) => p.slot));
  return rankPlayers(results.map((r) => ({ ...r, idle: idleSlots.has(r.slot) })));
}

/** Place, slot, file, score, crops, cycles used and awards, best place first (shared places as "=2"). */
export function formatResultsTable(
  participants: readonly Participant[],
  results: readonly PlayerResult[],
): string {
  const ranked = placements(participants, results);
  const rows = ranked.flatMap((placement) => {
    const result = results.find((r) => r.slot === placement.slot);
    const file = participants.find((p) => p.slot === placement.slot)?.file ?? '';
    return result === undefined ? [] : [{ placement, result, file }];
  });
  return renderTable([
    { header: 'place', align: 'left', cells: rows.map((r) => placeLabel(r.placement)) },
    { header: 'slot', align: 'left', cells: rows.map((r) => String(r.result.slot)) },
    { header: 'file', align: 'left', cells: rows.map((r) => r.file) },
    { header: 'score', align: 'right', cells: rows.map((r) => String(r.result.score)) },
    { header: 'crops', align: 'right', cells: rows.map((r) => String(r.result.cropsHarvested)) },
    { header: 'cycles used', align: 'right', cells: rows.map((r) => String(r.result.cyclesUsed)) },
    { header: 'awards', align: 'left', cells: rows.map((r) => r.result.awards.join(', ')) },
  ]);
}

/** `file:line:col: severity CODE: message`, plus an indented help line when the diagnostic has one. */
export function formatDiagnostics(file: string, diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.flatMap((d) => {
    const head = `${file}:${d.range.line}:${d.range.col}: ${d.severity} ${d.code}: ${d.message}`;
    return d.help === undefined ? [head] : [head, `  help: ${d.help}`];
  });
}

/** One line per player whose program stopped on a runtime error; compile failures are not repeated here. */
export function formatRuntimeErrors(
  participants: readonly Participant[],
  results: readonly PlayerResult[],
): string[] {
  return results.flatMap((result) => {
    const participant = participants.find((p) => p.slot === result.slot);
    if (participant === undefined || !participant.compiled || result.error === undefined) return [];
    return [
      `${participant.file}:${result.error.line}: runtime error ${result.error.code} (slot ${result.slot})`,
    ];
  });
}

/** Every `print` line, prefixed with the slot and file it came from, in slot order. */
export function formatOutput(
  participants: readonly Participant[],
  results: readonly PlayerResult[],
): string[] {
  return [...results]
    .sort((a, b) => a.slot - b.slot)
    .flatMap((result) => {
      const file = participants.find((p) => p.slot === result.slot)?.file ?? '';
      return result.output.map((line) => `[slot ${result.slot} ${file}] ${line}`);
    });
}

/** The event count and the final state hash as eight hex digits. */
export function formatFooter(sim: SimResult): string[] {
  const hash = sim.finalStateHash.toString(HEX_RADIX).padStart(HEX_DIGITS, '0');
  return [`events: ${sim.events.length}`, `finalStateHash: 0x${hash}`];
}
