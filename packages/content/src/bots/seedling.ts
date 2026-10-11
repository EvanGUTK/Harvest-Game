/**
 * Seedling: the naive-loop bot. Sprout source exported as a string (no loader needed).
 * Design: docs/01-game-design/multiplayer-modes.md §Bots, docs/02-language/standard-library.md.
 * Invariants: valid Sprout for a showdown (no spawn, no random, one file); the text has no `${` and no backslashes.
 * A reference bot must beat a `pass` program on showdown rules (the balance harness asserts it), so it waters.
 */

export const SEEDLING_SOURCE = `# Seedling: the naive loop.
# Strategy: sweep one row of radishes. Pass one waters a dry tile and plants a radish on every tile; pass two
# flies the row again and harvests, without checking whether anything is ripe. At the end of each lap it
# refills the tank if it is empty and sells everything. It never checks prices and never replants a gap.
# One row, because a lap of the whole farm takes longer than a radish stays fresh, so those crops would
# wither before the drone came back.

while True:
    repeat world_size():
        if moisture() < 10:
            water()
        plant(RADISH)
        move(EAST)
    repeat world_size():
        harvest()
        move(EAST)
    if water_left() == 0:
        refill()
    sell(RADISH, inventory(RADISH))
`;
