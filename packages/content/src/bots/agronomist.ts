/**
 * Agronomist: the market-aware bot. Sprout source exported as a string (no loader needed).
 * Design: docs/01-game-design/multiplayer-modes.md §Bots, docs/02-language/standard-library.md.
 * Invariants: valid Sprout for a showdown (no spawn, no random, one file); the text has no `${` and no backslashes.
 * The growing times and usual prices in the source mirror CROPS in content; the balance harness (SIM-BAL) retunes them.
 */

export const AGRONOMIST_SOURCE = `# Agronomist: the market-aware bot.
# Strategy: at the start of every lap it asks the market which crop pays best per growing cycle
# (price minus seed cost, per 1000 cycles of growth) and farms the three rows nearest the well with it,
# tilling for corn and melon and keeping melons above their moisture minimum of 30.
# It sells a crop only when the price is at least 70 percent of the usual one, or the match is nearly over.

GROW = {RADISH: 300, CORN: 900, MELON: 2400}
USUAL = {RADISH: 5, CORN: 18, MELON: 60}
CROPS = [RADISH, CORN, MELON]

def best_crop():
    best = RADISH
    best_rate = -1000000
    for c in CROPS:
        rate = (price(c) - seed_cost(c)) * 1000 // GROW[c]
        if rate > best_rate:
            best = c
            best_rate = rate
    return best

def need(kind):
    if kind == MELON:
        return 35
    return 10

def sow(target):
    if target != RADISH and soil() == GRASS:
        till()
    plant(target)

def tend(target):
    here = crop()
    if moisture() < need(here or target) and water_left() > 0:
        water()
    if here == None:
        sow(target)
    elif is_ripe() or is_withered():
        harvest()
        sow(target)

def sell_if_worth_it(kind):
    count = inventory(kind)
    late = cycles_left() < 3000
    if count > 0 and (price(kind) * 100 >= USUAL[kind] * 70 or late):
        sell(kind, count)

while True:
    target = best_crop()
    repeat 3:
        repeat world_size():
            tend(target)
            move(EAST)
        move(NORTH)
    repeat 3:
        move(SOUTH)
    refill()
    for kind in CROPS:
        sell_if_worth_it(kind)
`;
