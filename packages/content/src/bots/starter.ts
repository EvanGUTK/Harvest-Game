/**
 * The starter showdown program shown in the coding phase, exported as a string like the bots.
 * Design: docs/02-language/standard-library.md §Example: a complete starter showdown program.
 * Invariants: the text is that example verbatim (valid Sprout for a showdown, one file); the balance harness
 * (SIM-BAL) holds it to the starter criterion in simulation-engine.md §Balance harness; no `${`, no backslashes.
 */

export const STARTER_PROGRAM = `# Starter program shown in the coding phase.
# Inefficient but profitable: it farms only the 2 bottom rows (16 tiles),
# waters when the soil is dry, and refills and sells after every pass.
def tend():
    if moisture() < 10:
        water()
    if crop() == None:
        plant(RADISH)
    elif is_ripe():
        harvest()
        plant(RADISH)

while True:
    for y in range(2):
        for x in range(world_size()):
            tend()
            move(EAST)
        move(NORTH)
    move(SOUTH)
    move(SOUTH)
    refill()
    sell(RADISH, inventory(RADISH))
`;
