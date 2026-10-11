/**
 * The bot programs, as a table in difficulty order.
 * Design: docs/01-game-design/multiplayer-modes.md §Bots. Bots double as reference solutions and as
 * balance-harness players. Each source is a full Sprout file for a showdown (`main.sprout`).
 */

import { AGRONOMIST_SOURCE } from './agronomist';
import { GROWER_SOURCE } from './grower';
import { SEEDLING_SOURCE } from './seedling';

export type BotId = 'seedling' | 'grower' | 'agronomist';

export type BotProgram = {
  id: BotId;
  title: string;
  /** One line for the lobby: what the bot does. */
  strategy: string;
  source: string;
};

export const BOTS: readonly BotProgram[] = [
  {
    id: 'seedling',
    title: 'Seedling',
    strategy: 'Waters and plants one row of radishes, harvests it on the next pass, sells once per lap.',
    source: SEEDLING_SOURCE,
  },
  {
    id: 'grower',
    title: 'Grower',
    strategy: 'Farms three rows of radishes, watering dry tiles and replanting ripe or withered ones.',
    source: GROWER_SOURCE,
  },
  {
    id: 'agronomist',
    title: 'Agronomist',
    strategy: 'Picks the crop that pays best per growing cycle and sells only at a good price.',
    source: AGRONOMIST_SOURCE,
  },
];
