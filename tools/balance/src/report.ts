/**
 * The balance report: builds one section per variant from its data and prints it as plain text or JSON.
 * Design: docs/03-architecture/simulation-engine.md §Balance harness (the reported metrics and the criteria).
 * Invariants: pure functions from data to data and from data to text; the report passes only when it has at least one
 * variant and every criterion of every variant passed; the ideal-profit arithmetic is printed in full.
 */

import { ACTION_COSTS, CROP_IDS, CROPS, WORLD } from '@harvest/content';
import { renderTable } from '@harvest/tool-run/format';
import type { Column } from '@harvest/tool-run/format';
import { evaluateCriteria } from './criteria';
import type { Criterion } from './criteria';
import { hoardVersusSteady, idealProfit, lobbyScores, realisedPriceBp } from './metrics';
import type { HoardVersusSteady, IdealProfit } from './metrics';
import { marketRulesOf } from './overrides';
import type { Variant } from './overrides';
import { eightId, soloId } from './scenario';
import type { VariantData } from './scenario';
import { distribution } from './stats';
import type { Distribution } from './stats';

const SOLO_PREFIX = soloId('');
const PERCENT_DIVISOR = 100;

export type ProgramScores = {
  id: string;
  /** Slot-0 scores of the solo runs, over the seeds. */
  solo: Distribution | null;
  /** All eight slots of the eight-copy lobby, over the seeds. */
  eight: Distribution | null;
};

export type VariantReport = {
  variant: string;
  seeds: number;
  programs: ProgramScores[];
  /** Mean realised sale price as basis points of base in the 8-player all-radish lobby (8 Growers); null if nothing sold. */
  allRadishPriceBp: number | null;
  ideal: IdealProfit[];
  hoard: HoardVersusSteady | null;
  criteria: Criterion[];
};

export type Report = { variants: VariantReport[]; passed: boolean };

/** The program ids that ran solo, in the order they ran. */
function programIds(data: VariantData): string[] {
  return [...data.records.keys()]
    .filter((id) => id.startsWith(SOLO_PREFIX))
    .map((id) => id.slice(SOLO_PREFIX.length));
}

function scoresOf(data: VariantData, id: string): ProgramScores {
  return {
    id,
    solo: distribution(lobbyScores(data, soloId(id))),
    eight: distribution(lobbyScores(data, eightId(id))),
  };
}

function allRadishPrice(data: VariantData): number | null {
  const lots = (data.records.get(eightId('grower')) ?? []).flatMap((r) => r.lots);
  return realisedPriceBp(lots, (crop) => CROPS[crop].basePrice);
}

/** All metrics and criteria for one variant's data. */
export function buildVariantReport(data: VariantData, variant: Variant): VariantReport {
  const inputs = {
    actionCosts: ACTION_COSTS,
    world: WORLD,
    priceFloorBp: marketRulesOf(variant.overrides).priceFloorBp,
  };
  return {
    variant: data.variant,
    seeds: data.seeds.length,
    programs: programIds(data).map((id) => scoresOf(data, id)),
    allRadishPriceBp: allRadishPrice(data),
    ideal: CROP_IDS.map((crop) => idealProfit(CROPS[crop], inputs)),
    hoard: hoardVersusSteady(data),
    criteria: evaluateCriteria(data),
  };
}

/** The report passes when it measured something and nothing failed. */
export function buildReport(variants: VariantReport[]): Report {
  const passed = variants.length > 0 && variants.every((v) => v.criteria.every((c) => c.passed));
  return { variants, passed };
}

function distributionColumns(rows: readonly { id: string; d: Distribution }[]): Column[] {
  const numbers = (pick: (d: Distribution) => number): string[] => rows.map((r) => String(pick(r.d)));
  return [
    { header: 'program', align: 'left', cells: rows.map((r) => r.id) },
    { header: 'n', align: 'right', cells: numbers((d) => d.n) },
    { header: 'min', align: 'right', cells: numbers((d) => d.min) },
    { header: 'p25', align: 'right', cells: numbers((d) => d.p25) },
    { header: 'median', align: 'right', cells: numbers((d) => d.median) },
    { header: 'p75', align: 'right', cells: numbers((d) => d.p75) },
    { header: 'max', align: 'right', cells: numbers((d) => d.max) },
    { header: 'mean', align: 'right', cells: numbers((d) => d.mean) },
  ];
}

function scoreTable(title: string, rows: { id: string; d: Distribution | null }[]): string[] {
  const present = rows.flatMap((r) => (r.d === null ? [] : [{ id: r.id, d: r.d }]));
  return [title, renderTable(distributionColumns(present)), ''];
}

function idealTable(rows: readonly IdealProfit[]): string {
  return renderTable([
    { header: 'crop', align: 'left', cells: rows.map((r) => r.crop) },
    { header: 'cycles/unit', align: 'right', cells: rows.map((r) => String(r.cyclesPerUnit)) },
    { header: 'at base', align: 'right', cells: rows.map((r) => String(r.profitAtBase)) },
    { header: 'at floor', align: 'right', cells: rows.map((r) => String(r.profitAtFloor)) },
    { header: 'tiles to keep busy', align: 'right', cells: rows.map((r) => String(r.tilesToKeepBusy)) },
  ]);
}

function priceLine(bp: number | null): string {
  const label = 'Mean realised sale price, 8-player all-radish lobby (8 × Grower):';
  return bp === null
    ? `${label} no sales`
    : `${label} ${bp} bp of base (${Math.floor(bp / PERCENT_DIVISOR)} %)`;
}

function hoardLine(hoard: HoardVersusSteady | null): string {
  const label = 'Hoard and dump versus steady selling (radish):';
  return hoard === null
    ? `${label} no data`
    : `${label} steady ₵${hoard.steadyMean}, dump ₵${hoard.dumpMean}`;
}

function criterionLine(c: Criterion): string {
  return `${c.passed ? 'PASS' : 'FAIL'}  ${c.id}: ${c.title} (${c.detail})`;
}

function variantSection(v: VariantReport): string[] {
  return [
    `== variant ${v.variant} (${v.seeds} seeds) ==`,
    '',
    ...scoreTable(
      'Scores, solo (₵ over the seeds)',
      v.programs.map((p) => ({ id: p.id, d: p.solo })),
    ),
    ...scoreTable(
      'Scores, 8 copies in one lobby (₵ over the seeds and slots)',
      v.programs.map((p) => ({ id: p.id, d: p.eight })),
    ),
    priceLine(v.allRadishPriceBp),
    hoardLine(v.hoard),
    '',
    'Ideal-play profit per 1,000 drone cycles',
    idealTable(v.ideal),
    ...v.ideal.flatMap((row) => row.lines),
    '',
    'Criteria',
    ...v.criteria.map(criterionLine),
    '',
  ];
}

/** The plain-text report: one section per variant, then the verdict. */
export function formatReport(report: Report): string {
  const criteria = report.variants.flatMap((v) => v.criteria);
  const failing = criteria.filter((c) => !c.passed).length;
  const verdict = `RESULT: ${report.passed ? 'PASS' : 'FAIL'} (${failing} of ${criteria.length} criteria failing)`;
  return [...report.variants.flatMap(variantSection), verdict].join('\n');
}
