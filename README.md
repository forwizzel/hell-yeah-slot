# Hold and Win Prototype

A theme-free, browser-based technical prototype of a 3-row by 5-column Hold-and-Win slot game. It demonstrates reel-strip generation, ways evaluation, a locked-symbol respin feature, deterministic random sources, state-driven orchestration, PixiJS rendering, and headless math simulation.

This project uses integer play credits only. It has no accounts, payments, backend, external services, or real-money capability.

## Technology

- TypeScript with strict compiler settings
- Vite
- PixiJS 8
- HTML and CSS controls
- Vitest
- Browser Web Crypto for normal play
- A deterministic seeded random source for tests, simulation, and reproducible browser sessions

No external images, fonts, sounds, APIs, or CDN resources are used.

## Installation

Requires a current Node.js release and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The layout scales down to approximately 320 pixels wide.

## Commands

```bash
npm run dev       # Start the Vite development server
npm run build     # Type-check and create the production bundle
npm run test      # Run the Vitest unit suite once
npm run simulate  # Run 100,000 seeded, headless base spins
```

Simulation arguments are optional:

```bash
npm run simulate -- --spins=1000000 --seed=12345
```

- `--spins` accepts a positive safe integer and defaults to `100000`.
- `--seed` accepts a non-empty string and defaults to `12345`.
- Invalid values produce a warning and use the corresponding default.

The report separates base and bonus return, and includes hit rate, feature frequency, average feature payout, maximum observed win, average respin count, and full-grid rate. Results are repeatable for the same spin count and seed.

## Controls

- **Spin** deducts the selected bet and starts one base spin.
- **- / +** changes the integer bet from 1 through 100.
- **Quick spin** shortens reel and feature animation delays without changing outcomes.
- **Reset Game** restores 1,000 credits and a bet of 10. If a seed is active, reset also restarts that seed's sequence.
- **Apply Seed** starts a deterministic sequence from the entered string.
- **Clear Seed** restores browser Web Crypto randomness.

Controls that could mutate a running game are disabled outside the `idle` phase. Applying the same seed, then resetting before each run, reproduces the same sequence of outcomes.

## Base Game

Each of the five columns has a configured reel strip. A base result selects one stop per reel and reads three consecutive entries with wraparound. The 15 cells are not selected independently. Each `BONUS` entry receives a value from the weighted bonus-value table when the result is generated.

Regular symbols `A`, `B`, `C`, and `D` pay when the same symbol occurs in at least three consecutive columns beginning at the leftmost column. For each symbol, the number of matching cells in each participating column is multiplied to produce the number of ways. Ways, paytable multiplier, and current bet are then multiplied for the award. More than one regular symbol can win on a result. `BONUS` cells never substitute or participate in regular wins.

Winning regular cells receive a heavier plain border after evaluation.

## Hold-and-Win Feature

Three or more `BONUS` cells anywhere in a base result trigger the feature. Trigger cells retain their generated values and positions; all other positions become empty. The triggering bet is retained and no additional credits are charged.

The feature begins with three respins. On each respin, every empty position independently has the configured 12% chance to receive a weighted `BONUS` value. Existing and new bonus cells remain locked:

- At least one new cell resets remaining respins to three.
- No new cells reduces remaining respins by one.
- Zero remaining respins ends the feature.
- Filling all 15 positions ends it immediately.

At completion, all displayed bonus values are summed and multiplied by the triggering bet. That award is added alongside any regular base win from the triggering result.

## Architecture

```text
src/
  config/         Reel strips, paytable, timing, and feature probabilities
  core/           Domain types, mutable game state, and state-machine controller
  math/           Injected random sources and independently tested game mathematics
  presentation/   PixiJS grid, HTML controls, status, and event log
  simulation/     Node-compatible headless simulation command
  tests/          Mathematical unit tests and controlled random test source
  main.ts         Browser entry point
  styles.css      Responsive neutral interface styles
```

`ReelEngine`, `PayEvaluator`, and `BonusEngine` contain no PixiJS or DOM dependencies. Both the controller and simulator use these same modules and configuration. The controller calculates each result before awaiting its animation. Rendering only receives completed outcomes and cannot select symbols or payouts.

`GameState` uses an explicit phase union: `idle`, `base-spinning`, `base-evaluation`, `bonus-intro`, `bonus-respin`, `bonus-evaluation`, and `bonus-complete`.

## Changing The Math

- Edit `src/config/reelStrips.ts` to change strip length, order, or `BONUS` frequency. Keep one strip per column.
- Edit `src/config/paytable.ts` to change regular-symbol multipliers for three, four, or five columns.
- Edit `BONUS_VALUE_WEIGHTS` in `src/config/gameConfig.ts` to change available bonus values or relative weights.
- Edit `bonusLandingProbability` in `src/config/gameConfig.ts` to change the per-empty-position respin probability.
- Run `npm run test`, `npm run simulate`, and `npm run build` after math changes.

Weights must be finite and greater than zero. Probabilities must remain between zero and one. The engines validate these constraints when constructed.

## Replacing Text With Artwork

Artwork can be introduced later inside `src/presentation/ReelGridView.ts` without changing the math modules:

1. Load local, licensed textures during `ReelGridView.create`.
2. Map each discriminated cell type and regular symbol ID to a PixiJS `Sprite` or texture.
3. Replace or hide each cell's `Text` label while keeping its box container, positioning, and outcome passed by the controller.
4. Keep all asset selection deterministic from the supplied `Cell`; never use rendering code to reroll or modify an outcome.
5. Preserve a text or ARIA equivalent for accessibility.

The current prototype intentionally does not include an asset pipeline because all visuals are plain rectangles, borders, and text.

## Known Limitations

- The reel strips, paytable, and feature probability are illustrative and not mathematically balanced. The default configuration has a very high simulated RTP.
- The seeded generator is intended for reproducibility, not cryptographic security. Normal browser play uses Web Crypto.
- There are no paylines, wilds, jackpots, collectors, multipliers, mystery mechanics, autoplay, or persistence.
- Refreshing the page resets credits and active seed because there is no storage layer.
- The simulation is single-threaded and reports observed values rather than confidence intervals or formal mathematical proofs.
- Browser automation and visual-regression tests are not included; unit coverage focuses on game mathematics.

## Disclaimer

This is a local technical prototype for development and education. It is not certified gambling software, has not undergone regulatory or statistical certification, and must not be used for real-money gambling.
