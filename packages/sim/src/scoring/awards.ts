/**
 * Cosmetic awards: who earned which badge, computed across the whole lobby.
 * Design: docs/01-game-design/scoring-and-judging.md §Awards.
 * Invariants: awards never affect placement; idle players neither compete for nor receive any award;
 * players tied on a criterion all receive it; a player's awards are listed in the order of the awards table.
 */

import { floorDiv } from '@harvest/lang';
import type { AwardId } from '../index';
import type { Placement } from './ranking';
import type { PlayerStats, ScoringRules } from './stats';

/** A player with a program, together with the place they were ranked at. */
type Contender = { stats: PlayerStats; place: number };

/** Per-mille scale of the Most Efficient value: credits gained per 1,000 cycles. */
const CYCLES_SCALE = 1_000;

type Award = {
  id: AwardId;
  /** The slots that earn this award among the lobby's contenders. */
  winners: (rules: ScoringRules, contenders: readonly Contender[], slotCount: number) => number[];
};

/** The slots whose `value` is the highest among `contenders`; empty when there are none. */
function highest(contenders: readonly Contender[], value: (c: Contender) => number): number[] {
  if (contenders.length === 0) return [];
  const best = Math.max(...contenders.map(value));
  return contenders.filter((c) => value(c) === best).map((c) => c.stats.slot);
}

/** The slots whose `value` is the lowest among `contenders`; empty when there are none. */
function lowest(contenders: readonly Contender[], value: (c: Contender) => number): number[] {
  if (contenders.length === 0) return [];
  const best = Math.min(...contenders.map(value));
  return contenders.filter((c) => value(c) === best).map((c) => c.stats.slot);
}

function efficiency(rules: ScoringRules, stats: PlayerStats): number {
  return floorDiv((stats.credits - rules.startCredits) * CYCLES_SCALE, Math.max(1, stats.cyclesUsed));
}

function averageSaleBp(stats: PlayerStats): number {
  return floorDiv(stats.saleBpUnits, stats.unitsSold);
}

/** Places 1 to ⌈n ÷ 2⌉ of n slots. */
function topHalfLastPlace(slotCount: number): number {
  return floorDiv(slotCount + 1, 2);
}

const AWARDS: readonly Award[] = [
  {
    id: 'top_earner',
    winners: (_rules, contenders) => highest(contenders, (c) => c.stats.credits),
  },
  {
    id: 'most_efficient',
    winners: (rules, contenders) => {
      const eligible = contenders.filter((c) => c.stats.credits > rules.startCredits);
      return highest(eligible, (c) => efficiency(rules, c.stats));
    },
  },
  {
    id: 'bumper_crop',
    winners: (_rules, contenders) => {
      const harvesters = contenders.filter((c) => c.stats.cropsHarvested >= 1);
      return highest(harvesters, (c) => c.stats.cropsHarvested);
    },
  },
  {
    id: 'market_timer',
    winners: (_rules, contenders) => {
      const sellers = contenders.filter((c) => c.stats.unitsSold >= 1);
      return highest(sellers, (c) => averageSaleBp(c.stats));
    },
  },
  {
    id: 'clean_code',
    winners: (_rules, contenders, slotCount) => {
      const topHalf = contenders.filter((c) => c.place <= topHalfLastPlace(slotCount));
      return lowest(topHalf, (c) => c.stats.programTokens);
    },
  },
  {
    id: 'never_thirsty',
    winners: (_rules, contenders) =>
      contenders.filter((c) => c.stats.cropsPlanted >= 1 && !c.stats.everDryPaused).map((c) => c.stats.slot),
  },
];

function contendersOf(stats: readonly PlayerStats[], placements: readonly Placement[]): Contender[] {
  const contenders: Contender[] = [];
  for (const s of stats) {
    const placement = placements.find((p) => p.slot === s.slot);
    if (!s.idle && placement !== undefined) contenders.push({ stats: s, place: placement.place });
  }
  return contenders;
}

/**
 * Awards per slot. `stats` and `placements` cover every slot of the match (idle ones included, since
 * Clean Code's top half is counted over all slots). Slots with no award are absent from the map.
 */
export function assignAwards(
  rules: ScoringRules,
  stats: readonly PlayerStats[],
  placements: readonly Placement[],
): Map<number, AwardId[]> {
  const contenders = contendersOf(stats, placements);
  const awards = new Map<number, AwardId[]>();
  if (contenders.length === 0) return awards;
  for (const award of AWARDS) {
    for (const slot of award.winners(rules, contenders, stats.length)) {
      awards.set(slot, [...(awards.get(slot) ?? []), award.id]);
    }
  }
  return awards;
}
