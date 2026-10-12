# Bot programs

Seedling, Grower and Agronomist: handwritten Sprout programs for showdowns (design: [multiplayer-modes](../../../../docs/01-game-design/multiplayer-modes.md) §Bots). Each is a TS module exporting the program text as a string, so no bundler loader is needed; `BOTS` lists them in difficulty order. A new bot adds a module, a `BOTS` row and a test entry in `packages/sim/src/bots/bots.test.ts`.

**Criterion (asserted by the balance harness, SIM-BAL).** Every bot must beat a `pass` program (which ends with the starting ₵100) on showdown rules, and Seedling must stay the weakest. The harness runs them; until it exists the bots have never run, so their numbers are first guesses.

Rules for a bot source: valid for a showdown (no `spawn`, no `random`), one file, under 16 KB, a header comment that states the strategy, and no `${` or backslash in the text.

`STARTER_PROGRAM` is the published starter showdown program from the [standard library](../../../../docs/02-language/standard-library.md#example-a-complete-starter-showdown-program), verbatim. It is not a bot, so it is not in `BOTS`; the balance harness holds it to the starter criterion (at least ₵250 solo, and at least 30 % of the Agronomist's score in an 8-player lobby).
