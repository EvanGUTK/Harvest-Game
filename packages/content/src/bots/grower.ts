/**
 * Grower: the conditionals bot. Sprout source exported as a string (no loader needed).
 * Design: docs/01-game-design/multiplayer-modes.md §Bots, docs/02-language/standard-library.md.
 * Invariants: valid Sprout for a showdown (no spawn, no random, one file); the text has no `${` and no backslashes.
 */

export const GROWER_SOURCE = `# Grower: the conditionals bot.
# Strategy: farm the three rows nearest the well with radishes. On each tile it waters when the soil is
# dry, plants when the tile is empty, and harvests and replants when the crop is ripe or withered.
# After every lap it flies back to the well, refills the tank and sells the silo. It never looks at prices.

def tend():
    if moisture() < 10 and water_left() > 0:
        water()
    if crop() == None:
        plant(RADISH)
    elif is_ripe() or is_withered():
        harvest()
        plant(RADISH)

while True:
    repeat 3:
        repeat world_size():
            tend()
            move(EAST)
        move(NORTH)
    repeat 3:
        move(SOUTH)
    refill()
    sell(RADISH, inventory(RADISH))
`;
