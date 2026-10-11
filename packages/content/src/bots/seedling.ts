/**
 * Seedling: the naive-loop bot. Sprout source exported as a string (no loader needed).
 * Design: docs/01-game-design/multiplayer-modes.md §Bots, docs/02-language/standard-library.md.
 * Invariants: valid Sprout for a showdown (no spawn, no random, one file); the text has no `${` and no backslashes.
 */

export const SEEDLING_SOURCE = `# Seedling: the naive loop.
# Strategy: plant one whole row of radishes, fly the row again to harvest them, sell everything, repeat.
# It never looks at the soil or at prices, so a dry tile wastes a seed, but the timing is fixed:
# a lap takes longer than the 300 cycles a radish needs, so the first tile is ripe when the drone returns.

while True:
    repeat world_size():
        plant(RADISH)
        move(EAST)
    repeat world_size():
        harvest()
        move(EAST)
    sell(RADISH, inventory(RADISH))
`;
