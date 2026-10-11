/**
 * Named PRNG streams and their seeding.
 * Design: docs/03-architecture/simulation-engine.md §PRNG seeding (SIM-05).
 * Invariants: streamId = fnv1a32(name); the sfc32 state is the next four splitmix32 outputs of
 * `(seed ^ streamId) >>> 0`, then 12 outputs are discarded; streams are independent; the fixed
 * order is layout, weather, player:0 … player:(nSlots−1) (the state hash walks them in this order).
 */

import { fnv1a32Ascii } from '@harvest/lang';
import { InvariantError } from '../invariant';
import { createSfc32, type Sfc32 } from './sfc32';
import { splitmix32 } from './splitmix32';

/** sfc32 outputs discarded after seeding, per the normative seeding rule. */
const SEED_WARMUP_DISCARDS = 12;

export type StreamId = 'layout' | 'weather' | { readonly player: number };

export type NamedStream = { readonly name: string; readonly rng: Sfc32 };

export type MatchStreams = {
  readonly layout: Sfc32;
  readonly weather: Sfc32;
  /** The stream of one slot; both of its drones draw from it in scheduler order. */
  player(slot: number): Sfc32;
  /** Every stream in the fixed order layout, weather, player:0 … player:(nSlots−1). */
  readonly ordered: readonly NamedStream[];
};

/** The ASCII stream name hashed into the stream id: `layout`, `weather` or `player:<slot>`. */
export function streamName(id: StreamId): string {
  if (id === 'layout' || id === 'weather') return id;
  return `player:${id.player}`;
}

/** A stream seeded from the match seed (uint32) and a stream name. */
export function seedStream(seed: number, name: string): Sfc32 {
  const expander = splitmix32((seed ^ fnv1a32Ascii(name)) >>> 0);
  const rng = createSfc32([expander.next(), expander.next(), expander.next(), expander.next()]);
  for (let i = 0; i < SEED_WARMUP_DISCARDS; i += 1) rng.next();
  return rng;
}

/** All streams of a match: layout, weather and one per slot. */
export function createStreams(seed: number, nSlots: number): MatchStreams {
  const layout = seedStream(seed, streamName('layout'));
  const weather = seedStream(seed, streamName('weather'));
  const players = Array.from({ length: nSlots }, (_, slot) => seedStream(seed, streamName({ player: slot })));
  const ordered: NamedStream[] = [
    { name: streamName('layout'), rng: layout },
    { name: streamName('weather'), rng: weather },
    ...players.map((rng, slot) => ({ name: streamName({ player: slot }), rng })),
  ];
  return {
    layout,
    weather,
    player(slot: number): Sfc32 {
      const rng = players[slot];
      if (rng === undefined) {
        throw new InvariantError('SIM-BAD-SLOT', `slot ${slot} is outside 0..${nSlots - 1}`);
      }
      return rng;
    },
    ordered,
  };
}

/** `random(n)` of a slot stream: `next() % n`, one draw per call, `n ≥ 1` an integer. */
export function randomBelow(rng: Sfc32, n: number): number {
  if (!Number.isInteger(n) || n < 1) {
    throw new InvariantError('SIM-BAD-RANDOM-BOUND', `random bound n must be an integer ≥ 1, got ${n}`);
  }
  return rng.next() % n;
}
