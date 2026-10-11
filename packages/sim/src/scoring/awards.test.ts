import { describe, expect, it } from 'vitest';
import { assignAwards } from './awards';
import { scorePlayers } from './score';
import type { PlayerStats, ScoringRules } from './stats';

const RULES: ScoringRules = { startCredits: 100, cycleBudget: 30_000 };

function stats(slot: number, over: Partial<PlayerStats> = {}): PlayerStats {
  return {
    slot,
    idle: false,
    credits: 100,
    lastSaleAt: null,
    logicCycles: 100,
    programTokens: 50,
    cropsHarvested: 0,
    cyclesUsed: 30_000,
    unitsSold: 0,
    saleBpUnits: 0,
    cropsPlanted: 0,
    everDryPaused: false,
    output: [],
    ...over,
  };
}

/** Awards per slot for a lobby, read from the results `scorePlayers` produces. */
function awardsFor(lobby: readonly PlayerStats[]): Record<number, readonly string[]> {
  const out: Record<number, readonly string[]> = {};
  for (const result of scorePlayers(RULES, lobby).results) out[result.slot] = result.awards;
  return out;
}

function holders(lobby: readonly PlayerStats[], award: string): number[] {
  const awards = awardsFor(lobby);
  return lobby.filter((s) => awards[s.slot]?.includes(award)).map((s) => s.slot);
}

describe('top_earner (scoring-and-judging.md §Awards: highest score)', () => {
  it('goes to the highest score', () => {
    expect(
      holders(
        [stats(0, { credits: 150 }), stats(1, { credits: 400 }), stats(2, { credits: 90 })],
        'top_earner',
      ),
    ).toEqual([1]);
  });

  it('goes to every player tied on the highest score', () => {
    expect(
      holders(
        [stats(0, { credits: 250 }), stats(1, { credits: 250 }), stats(2, { credits: 90 })],
        'top_earner',
      ),
    ).toEqual([0, 1]);
  });

  it('goes to a real program that ends with ₵0 when the only rival is idle (idle never receives awards)', () => {
    expect(holders([stats(0, { credits: 0 }), stats(1, { idle: true })], 'top_earner')).toEqual([0]);
  });

  it('is not given to anyone when every player is idle', () => {
    expect(holders([stats(0, { idle: true }), stats(1, { idle: true })], 'top_earner')).toEqual([]);
  });
});

describe('most_efficient (floorDiv((score − startCredits) × 1000, max(1, cyclesUsed)))', () => {
  it('goes to the best profit per cycle, not the best profit: ₵200 over 25,000 cycles is 8, ₵120 over 10,000 is 12', () => {
    const lobby = [
      stats(0, { credits: 300, cyclesUsed: 25_000 }),
      stats(1, { credits: 220, cyclesUsed: 10_000 }),
    ];
    expect(holders(lobby, 'most_efficient')).toEqual([1]);
  });

  it('goes to every player tied on the value', () => {
    const lobby = [
      stats(0, { credits: 200, cyclesUsed: 20_000 }),
      stats(1, { credits: 300, cyclesUsed: 40_000 }),
    ];
    // floorDiv(100 × 1000, 20_000) = 5 and floorDiv(200 × 1000, 40_000) = 5
    expect(holders(lobby, 'most_efficient')).toEqual([0, 1]);
  });

  it('floors the value, so near-equal players tie: ₵1 over 30,000 and over 29,000 cycles are both 0', () => {
    const lobby = [
      stats(0, { credits: 101, cyclesUsed: 30_000 }),
      stats(1, { credits: 101, cyclesUsed: 29_000 }),
    ];
    expect(holders(lobby, 'most_efficient')).toEqual([0, 1]);
  });

  it('excludes a score equal to startCredits', () => {
    expect(holders([stats(0, { credits: 100, cyclesUsed: 100 })], 'most_efficient')).toEqual([]);
  });

  it('excludes a score below startCredits', () => {
    expect(holders([stats(0, { credits: 40 }), stats(1, { credits: 100 })], 'most_efficient')).toEqual([]);
  });

  it('treats zero cycles used as one cycle instead of dividing by zero', () => {
    expect(holders([stats(0, { credits: 150, cyclesUsed: 0 })], 'most_efficient')).toEqual([0]);
  });

  it('never goes to an idle player', () => {
    expect(holders([stats(0, { idle: true, credits: 900, cyclesUsed: 1 })], 'most_efficient')).toEqual([]);
  });
});

describe('bumper_crop (most crops harvested, at least 1)', () => {
  it('goes to the most harvested crops', () => {
    expect(
      holders([stats(0, { cropsHarvested: 12 }), stats(1, { cropsHarvested: 30 })], 'bumper_crop'),
    ).toEqual([1]);
  });

  it('goes to every player tied on the most', () => {
    expect(
      holders(
        [stats(0, { cropsHarvested: 9 }), stats(1, { cropsHarvested: 9 }), stats(2, { cropsHarvested: 2 })],
        'bumper_crop',
      ),
    ).toEqual([0, 1]);
  });

  it('is not given when nobody harvested anything', () => {
    expect(holders([stats(0), stats(1)], 'bumper_crop')).toEqual([]);
  });

  it('never goes to an idle player', () => {
    expect(
      holders([stats(0, { idle: true, cropsHarvested: 99 }), stats(1, { cropsHarvested: 1 })], 'bumper_crop'),
    ).toEqual([1]);
  });
});

describe('market_timer (unit-weighted average sale price in basis points of base price)', () => {
  it('goes to the best average: 10 units at full price is 10,000 bp, 4 units at 60 % is 6,000 bp', () => {
    const lobby = [
      stats(0, { unitsSold: 10, saleBpUnits: 100_000 }),
      stats(1, { unitsSold: 4, saleBpUnits: 24_000 }),
    ];
    expect(holders(lobby, 'market_timer')).toEqual([0]);
  });

  it('weights by units: a small lot at a high price does not beat a big lot at a slightly lower one', () => {
    const lobby = [
      stats(0, { unitsSold: 1, saleBpUnits: 9_800 }), // 9,800
      stats(1, { unitsSold: 20, saleBpUnits: 20 * 9_900 }), // 9,900
    ];
    expect(holders(lobby, 'market_timer')).toEqual([1]);
  });

  it('floors the average, so players tied after the floor both win: 10,001 / 2 and 10,000 / 2 are both 5,000', () => {
    const lobby = [
      stats(0, { unitsSold: 2, saleBpUnits: 10_001 }),
      stats(1, { unitsSold: 2, saleBpUnits: 10_000 }),
    ];
    expect(holders(lobby, 'market_timer')).toEqual([0, 1]);
  });

  it('needs at least one unit sold', () => {
    expect(holders([stats(0, { unitsSold: 0, saleBpUnits: 0 }), stats(1)], 'market_timer')).toEqual([]);
  });

  it('is given to the only seller even at a poor price', () => {
    expect(holders([stats(0, { unitsSold: 3, saleBpUnits: 12_000 }), stats(1)], 'market_timer')).toEqual([0]);
  });

  it('never goes to an idle player', () => {
    expect(holders([stats(0, { idle: true, unitsSold: 5, saleBpUnits: 50_000 })], 'market_timer')).toEqual(
      [],
    );
  });
});

describe('clean_code (fewest tokens among places 1 to ⌈n ÷ 2⌉ of n players)', () => {
  it('goes to the shortest program among the top half only: n = 4 so places 1 and 2 compete', () => {
    const lobby = [
      stats(0, { credits: 400, programTokens: 120 }), // 1st
      stats(1, { credits: 300, programTokens: 60 }), // 2nd
      stats(2, { credits: 200, programTokens: 10 }), // 3rd: shorter, but outside the top half
      stats(3, { credits: 150, programTokens: 5 }), // 4th
    ];
    expect(holders(lobby, 'clean_code')).toEqual([1]);
  });

  it('counts idle players in n: with 1 idle among 3 slots the top half is places 1 and 2, so both programs compete', () => {
    const lobby = [
      stats(0, { credits: 400, programTokens: 90 }), // 1st
      stats(1, { credits: 300, programTokens: 40 }), // 2nd
      stats(2, { idle: true }), // 3rd
    ]; // counting only the 2 programs would make the top half place 1 alone and give the award to slot 0
    expect(holders(lobby, 'clean_code')).toEqual([1]);
  });

  it('rounds the half up for an odd lobby: n = 3 gives places 1 and 2', () => {
    const lobby = [
      stats(0, { credits: 400, programTokens: 90 }),
      stats(1, { credits: 300, programTokens: 40 }),
      stats(2, { credits: 200, programTokens: 5 }),
    ];
    expect(holders(lobby, 'clean_code')).toEqual([1]);
  });

  it('uses the shared place number: with n = 5 the top half is places 1 to 3 and both players at =2nd qualify', () => {
    const lobby = [
      stats(0, { credits: 500, programTokens: 80 }), // 1st
      stats(1, { credits: 300, programTokens: 70, logicCycles: 1, lastSaleAt: 1 }), // =2nd
      stats(2, { credits: 300, programTokens: 70, logicCycles: 1, lastSaleAt: 1 }), // =2nd
      stats(3, { credits: 200, programTokens: 10 }), // 4th, outside
      stats(4, { credits: 150, programTokens: 90 }), // 5th
    ];
    expect(holders(lobby, 'clean_code')).toEqual([1, 2]);
  });

  it('goes to every top-half player tied on the fewest tokens', () => {
    const lobby = [
      stats(0, { credits: 400, programTokens: 30 }),
      stats(1, { credits: 300, programTokens: 30 }),
      stats(2, { credits: 200, programTokens: 5 }),
      stats(3, { credits: 150, programTokens: 5 }),
    ];
    expect(holders(lobby, 'clean_code')).toEqual([0, 1]);
  });

  it('never goes to an idle player, even one placed inside the top half: [program, idle, idle] puts both idle at =2nd of ⌈3 ÷ 2⌉ = 2', () => {
    const lobby = [
      stats(0, { credits: 400, programTokens: 80 }),
      stats(1, { idle: true }),
      stats(2, { idle: true }),
    ];
    expect(holders(lobby, 'clean_code')).toEqual([0]);
  });

  it('goes to a lone real player', () => {
    expect(holders([stats(0)], 'clean_code')).toEqual([0]);
  });
});

describe('never_thirsty (at least 1 crop planted, growth never paused for lack of moisture)', () => {
  it('goes to every player who planted and never had a crop dry-paused', () => {
    const lobby = [
      stats(0, { cropsPlanted: 4 }),
      stats(1, { cropsPlanted: 9 }),
      stats(2, { cropsPlanted: 3, everDryPaused: true }),
    ];
    expect(holders(lobby, 'never_thirsty')).toEqual([0, 1]);
  });

  it('needs at least one crop planted', () => {
    expect(holders([stats(0, { cropsPlanted: 0 })], 'never_thirsty')).toEqual([]);
  });

  it('is lost by a single dry pause', () => {
    expect(holders([stats(0, { cropsPlanted: 40, everDryPaused: true })], 'never_thirsty')).toEqual([]);
  });

  it('never goes to an idle player', () => {
    expect(holders([stats(0, { idle: true, cropsPlanted: 5 })], 'never_thirsty')).toEqual([]);
  });
});

describe('assignAwards', () => {
  it('lists a player’s awards in the order of the awards table', () => {
    const lobby = [
      stats(0, {
        credits: 300,
        cyclesUsed: 10_000,
        cropsHarvested: 5,
        unitsSold: 2,
        saleBpUnits: 20_000,
        cropsPlanted: 5,
        programTokens: 3,
      }),
    ];
    expect(awardsFor(lobby)[0]).toEqual([
      'top_earner',
      'most_efficient',
      'bumper_crop',
      'market_timer',
      'clean_code',
      'never_thirsty',
    ]);
  });

  it('gives an idle player an empty list', () => {
    expect(awardsFor([stats(0, { idle: true }), stats(1)])[0]).toEqual([]);
  });

  it('returns an empty map for an empty lobby', () => {
    expect(assignAwards(RULES, [], []).size).toBe(0);
  });
});
