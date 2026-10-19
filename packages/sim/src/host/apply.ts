/**
 * Applies one host call: decodes the arguments, runs the builtin against the world, and reports the applied cost.
 * Design: docs/03-architecture/simulation-engine.md §Model (host.apply) and §Clock arithmetic (normative),
 * docs/02-language/standard-library.md §Outcome matrix (normative) and §Sensors.
 * Invariants: dispatch is by the builtin's name in the content metadata (host id = index in BUILTINS), and an id with
 * no handler is an invariant violation, so adding a builtin without a handler fails a test; the result is `ok` with
 * the value and applied cost, or `error` with the R-BAD-ARG (or locked-feature) error the VM raises; the world is
 * returned as a new value.
 */

import { BUILTINS } from '@harvest/content';
import type { ValueOps } from '@harvest/lang';
import { InvariantError } from '../invariant';
import {
  callGoto,
  callHalt,
  callHarvest,
  callMove,
  callPlant,
  callRefill,
  callSell,
  callSpawn,
  callTill,
  callWait,
  callWater,
} from './action-calls';
import type { CallContext } from './call-context';
import {
  callCrop,
  callCredits,
  callCycles,
  callCyclesLeft,
  callGrowth,
  callInventory,
  callIsRipe,
  callIsWithered,
  callMeasure,
  callMoisture,
  callPosX,
  callPosY,
  callPrice,
  callRandom,
  callSeedCost,
  callSoil,
  callWaterLeft,
  callWorldSize,
} from './sensor-calls';
import type { HostAgent, HostCall, HostOutcome, HostWorld } from './state';

type Handler = (ctx: CallContext) => HostOutcome;

const HANDLERS: ReadonlyMap<string, Handler> = new Map<string, Handler>([
  ['move', callMove],
  ['plant', callPlant],
  ['harvest', callHarvest],
  ['till', callTill],
  ['water', callWater],
  ['refill', callRefill],
  ['goto', callGoto],
  ['sell', callSell],
  ['wait', callWait],
  ['spawn', callSpawn],
  ['halt', callHalt],
  ['pos_x', callPosX],
  ['pos_y', callPosY],
  ['world_size', callWorldSize],
  ['crop', callCrop],
  ['is_ripe', callIsRipe],
  ['is_withered', callIsWithered],
  ['growth', callGrowth],
  ['soil', callSoil],
  ['moisture', callMoisture],
  ['water_left', callWaterLeft],
  ['credits', callCredits],
  ['inventory', callInventory],
  ['price', callPrice],
  ['seed_cost', callSeedCost],
  ['measure', callMeasure],
  ['cycles', callCycles],
  ['cycles_left', callCyclesLeft],
  ['random', callRandom],
]);

/** Applies `call` made by `agent` at cycle `t` (the yield's `atCycle`) to `world`. */
export function applyHostCall(
  values: ValueOps,
  world: HostWorld,
  agent: HostAgent,
  call: HostCall,
  t: number,
): HostOutcome {
  const name = BUILTINS[call.fn]?.name;
  const handler = name === undefined ? undefined : HANDLERS.get(name);
  if (handler === undefined) {
    throw new InvariantError('SIM-UNKNOWN-BUILTIN', `no host handler for id ${call.fn}`);
  }
  return handler({ values, world, agent, args: call.args, t });
}
