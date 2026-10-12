/**
 * The programs the balance harness runs: `pass`, the starter and the bots from content, and harness-only
 * single-crop farmers with a steady or a hoard-and-dump selling policy.
 * Design: docs/03-architecture/simulation-engine.md §Balance harness (no single crop should dominate; hoard and dump
 * must not beat steady selling), docs/01-game-design/crops-and-economy.md.
 * Invariants: every program is a valid showdown program (one file, no spawn, no random); the farmers are fixtures
 * for measuring the economy, never shown to players and never in content.
 */

import { BOTS, CROPS, STARTER_PROGRAM } from '@harvest/content';
import type { CropId } from '@harvest/content';

/** A named program: the id is stable (reports and criteria refer to it), the source is a full Sprout file. */
export type Program = { id: string; title: string; source: string };

export type SellPolicy = { kind: 'steady' } | { kind: 'dump'; windowCycles: number };

/** A program that does nothing: it ends with the starting credits. Every reference bot must beat it. */
export const PASS_PROGRAM: Program = { id: 'pass', title: 'Pass', source: 'pass\n' };

/** The selling window of the hoard-and-dump fixture, in cycles (simulation-engine.md: "one large sell per window"). */
export const DUMP_WINDOW_CYCLES = 5_000;

/** Rows each farmer works: three rows of the farm, as the Grower does, so a lap is shorter than any crop's wither time. */
const FARMED_ROWS = 3;
/** Water a tile below this moisture, for crops that grow at any moisture above 0. */
const LOW_MOISTURE = 10;
/** Water a tile below this moisture for a crop that only grows at moisture 30 or more (melon). */
const LOW_MOISTURE_PICKY = 35;
/** A crop whose minimum moisture is above this needs the earlier top-up. */
const DEFAULT_MIN_MOISTURE = 1;

/** The starter program and the three bots, from content, in difficulty order. */
export function referencePrograms(): Program[] {
  return [
    { id: 'starter', title: 'Starter', source: STARTER_PROGRAM },
    ...BOTS.map((bot) => ({ id: bot.id, title: bot.title, source: bot.source })),
  ];
}

function sowBlock(crop: CropId): string {
  const constant = CROPS[crop].constant;
  if (!CROPS[crop].needsTilled) return `def sow():\n    plant(${constant})\n`;
  return `def sow():\n    if soil() == GRASS:\n        till()\n    plant(${constant})\n`;
}

function sellBlock(crop: CropId, policy: SellPolicy): string {
  const constant = CROPS[crop].constant;
  const sale = `sell(${constant}, inventory(${constant}))`;
  if (policy.kind === 'steady') return `    ${sale}\n`;
  return `    if cycles() >= next_dump:\n        ${sale}\n        next_dump = next_dump + ${policy.windowCycles}\n`;
}

function policyId(policy: SellPolicy): string {
  return policy.kind === 'steady' ? 'steady' : `dump-${policy.windowCycles}`;
}

/** A farmer that works one crop on three rows and sells it under the given policy. */
export function cropFarmer(crop: CropId, policy: SellPolicy): Program {
  const low = CROPS[crop].minMoisture > DEFAULT_MIN_MOISTURE ? LOW_MOISTURE_PICKY : LOW_MOISTURE;
  const header = `# Harness fixture (SIM-BAL): ${crop} farmer, ${policyId(policy)}.\n`;
  const tend = `def tend():
    if moisture() < ${low} and water_left() > 0:
        water()
    if crop() == None:
        sow()
    elif is_ripe() or is_withered():
        harvest()
        sow()
`;
  const start = policy.kind === 'dump' ? `next_dump = ${policy.windowCycles}\n` : '';
  const lap = `while True:
    repeat ${FARMED_ROWS}:
        repeat world_size():
            tend()
            move(EAST)
        move(NORTH)
    repeat ${FARMED_ROWS}:
        move(SOUTH)
    refill()
`;
  const source = [header, sowBlock(crop), tend, start, lap + sellBlock(crop, policy)].join('\n');
  return { id: `${crop}-${policyId(policy)}`, title: `${crop} ${policyId(policy)}`, source };
}
