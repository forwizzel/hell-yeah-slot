# Bonus Slot Prototype

A browser-based, 3-row by 5-column slot prototype built around BEER, CIGARETTE, and SWORD bonus symbols. It demonstrates reel-strip generation, left-to-right ways with WILD substitution, chance and natural feature activation, stateful free spins and retriggers, deterministic random sources, PixiJS presentation, and headless math simulation.

The project uses integer play credits only. It has no accounts, payments, backend, external services, persistence, or real-money capability. The historical Hold-and-Win design has been removed; its superseded original brief remains in `Hold-and-Win-Slot-Prototype-Spec.md` for reference.

## Technology

- TypeScript with strict compiler settings
- Vite
- PixiJS 8
- HTML and CSS controls
- Vitest
- Browser Web Crypto for unseeded play
- `SeededRandomSource` for tests, simulation, and reproducible browser sessions

No external images, fonts, sounds, APIs, or CDN resources are required. All artwork and audio are bundled locally.

## Installation

Use a current Node.js release and npm:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The interface is designed to remain usable at approximately 320 pixels wide.

## Commands

```bash
npm run dev       # Start the Vite development server
npm run build     # Type-check and create the production bundle
npm run test      # Run the Vitest unit suite once
npm run simulate  # Simulate 100,000 paid base spins and all triggered free spins
```

The simulation accepts optional arguments:

```bash
npm run simulate -- --spins=1000000 --seed=12345
```

- `--spins` is the number of paid base spins. It accepts a positive safe integer and defaults to `100000`.
- `--seed` accepts a non-empty string and defaults to `12345`.
- Invalid values produce a warning and use the corresponding default.
- Free spins do not increase the spin argument or the wager denominator.

## Controls And Credits

- **Spin** deducts the selected integer bet and starts one paid base round.
- **- / +** changes the bet from 1 through 100 in steps of 1.
- **Quick spin** shortens animation delays without changing the precomputed outcome.
- **Sound Off / Sound On** enables or disables all audio. Enabling sound starts the looping background soundtrack.
- **Reset Game** restores 1,000 credits and the default bet of 10. With a seed active, it also restarts that seed's random sequence.
- **Apply Seed** trims and applies a non-empty deterministic seed.
- **Clear Seed** returns normal play to browser Web Crypto randomness.

Controls that could mutate a running game are disabled outside the `idle` phase. A paid round can award its ordinary base win plus the complete free-spin payout. SWORD itself currently awards no credits.

The spin and bet controls have dedicated effects, and each animated reel lock plays a click. Natural feature and retrigger results play first, second, and third symbol cues as matching special symbols are revealed, followed by one winner cue when the feature effect is applied. Below-threshold chance activations do not play the natural symbol sequence. Sound starts disabled so browsers can begin playback from the explicit sound-toggle interaction.

### Development Bonus Controls

`npm run dev` exposes a clearly marked development panel with buttons for BEER, CIGARETTE, combined BEER+CIGARETTE, and SWORD. These controls are removed at runtime from production builds and are guarded again in the controller with `import.meta.env.DEV`.

Forced bonuses can run only while the game is idle. They place no wager, use the currently selected bet for free-spin payouts, and consume the active random sequence normally for multiplier selection, free-spin outcomes, and retriggers. Consequently, using a forced trigger changes subsequent results for an active deterministic seed.

## Symbols And Reels

The five card symbols are `10`, `J`, `Q`, `K`, and `A`. `WILD` substitutes for card symbols. The three non-paying special symbols are `BEER`, `CIGARETTE`, and `SWORD`; they neither pay as ways symbols nor substitute for cards.

Each column uses its own configured 64-stop reel strip. A spin selects one stop per reel and reads three consecutive entries with wraparound, so the 15 cells are not generated independently. The current strips contain:

- Three BEER entries on every reel
- One CIGARETTE entry on every reel
- One WILD entry on every reel
- One SWORD entry on reels 1, 3, and 5 only

SWORD entries are isolated from other special symbols in their visible reel windows. This makes three or more SWORD structurally incompatible with three or more BEER or CIGARETTE on the same configured result; `BonusEngine` also applies SWORD priority defensively.

The strips and feature probabilities are illustrative prototype values, not a certified or balanced math model.

## Ways And WILD

A card symbol wins when that symbol or WILD appears in at least three consecutive columns beginning with the leftmost column. The evaluator multiplies the number of matching cells in each participating column to obtain the ways, then calculates:

```text
award = ways x paytable multiplier x bet
```

Multiple card symbols can win on one result. A WILD can support each applicable card symbol, but an award must contain at least one natural instance of that card symbol in its qualifying columns. If a qualifying result consists only of WILD cells, it is paid once as the highest card, `A`, rather than once for every card symbol.

| Symbol | 3 columns | 4 columns | 5 columns |
| --- | ---: | ---: | ---: |
| `10` | x1 | x2 | x5 |
| `J` | x2 | x4 | x8 |
| `Q` | x3 | x6 | x12 |
| `K` | x4 | x8 | x16 |
| `A` | x5 | x10 | x20 |

## Paid-Spin Features

A natural feature requires at least three matching special symbols anywhere on a paid grid. Different special symbols are not added together to reach the threshold.

BEER and CIGARETTE also have below-threshold chance activation on paid spins only:

| Visible matching symbols | BEER chance | CIGARETTE chance |
| ---: | ---: | ---: |
| 0 | No roll | No roll |
| 1 | 0.2% | 0.5% |
| 2 | 0.8% | 1.0% |
| 3 or more | Natural trigger | Natural trigger |

The BEER and CIGARETTE chance rolls are independent. Both can activate on one result, including a mixture of natural and chance activation, and start the combined feature. SWORD has no chance activation. Three or more SWORD take priority on paid spins and skip BEER/CIGARETTE resolution.

## Free Spins

No additional bet is charged during a feature. Every free spin uses the triggering bet and the same reel strips as the base game.

- **BEER:** 10 free spins at x1.
- **CIGARETTE:** 3 free spins with one uniformly selected integer multiplier from x2 through x10.
- **Combined:** 10 free spins, not 13, with one uniformly selected CIGARETTE multiplier from x2 through x10.

The active multiplier is applied individually to each free spin's ordinary ways payout. A spin pays using the multiplier active at its start; retrigger changes take effect only after that payout and the normal consumption of one spin.

Retriggers are natural-only and require at least three matching symbols on a free spin:

- BEER adds 10 to the remaining spins instead of resetting the counter.
- CIGARETTE uniformly chooses a new x2 through x10 award and multiplies it into the current multiplier.
- BEER and CIGARETTE on the same spin apply both effects and move the feature to combined mode.
- A BEER or CIGARETTE feature becomes combined when it retriggers the other symbol. Combined mode never moves back to a single-symbol mode.

There is no arbitrary multiplier cap. State transitions, multipliers, payouts, and accumulated wins are validated as JavaScript safe integers; an overflow is rejected rather than rounded.

## Sword

SWORD is currently a placeholder `JACKPOT` feature/interstitial with no credit award.

- On a paid spin, at least three SWORD take feature priority. The paid grid's independent card/WILD ways can still pay.
- During free spins, at least three SWORD consume the current spin, suppress same-grid BEER/CIGARETTE retriggers, display the conceptual SWORD interstitial, and then resume the existing feature.
- A free spin containing SWORD still receives any ordinary ways payout at the multiplier active when the spin began. SWORD adds no payout and otherwise leaves the feature mode, multiplier, and counter unchanged beyond the consumed spin.
- A future playable SWORD game must complete before the interrupted free-spin feature resumes.

See `Edge-Cases.md` for the complete clarified outcome contract.

## Randomness And Seeds

All game mathematics receives an injected `RandomSource`; rendering never selects or rerolls an outcome. Normal browser play uses `CryptoRandomSource`. Tests, simulation, and seeded browser play use deterministic `SeededRandomSource`.

`ReelEngine` and `BonusEngine` share one random-source instance. This is important for exact reproducibility: reel stops, paid-spin chance checks, multiplier choices, retriggers, and additional feature spins all advance one sequence in execution order. The same seed reproduces the same results only when the configuration, code, starting state, and player actions are also the same. Resetting while a browser seed is active restarts that sequence.

The seeded generator is intended for repeatability, not cryptographic security.

## Architecture

```text
src/
  config/         Reel strips, card paytable, timing, and feature configuration
  core/           Domain types, game state, and state-machine controller
  math/           Random sources, reel generation, ways evaluation, and bonus rules
  presentation/   PixiJS grid, HTML controls, status, and event log
  simulation/     Node-compatible headless paid-round simulation
  tests/          Unit tests and controlled random test utilities
  main.ts         Browser entry point
  styles.css      Responsive interface styles
```

`ReelEngine`, `evaluateWays`, and `BonusEngine` contain no PixiJS or DOM dependencies. The browser controller and simulator call the same math APIs and configuration. Outcomes are resolved before animation begins, and presentation code receives results without authority to change symbols or payouts.

The phase model is explicit: `idle`, `base-spinning`, `base-evaluation`, `bonus-intro`, `free-spin-spinning`, `free-spin-evaluation`, `sword-bonus`, and `bonus-complete`.

## Simulation Report

The simulator creates one `SeededRandomSource` shared by `ReelEngine` and `BonusEngine`, plays the requested number of paid base spins, and completes every triggered free-spin feature before starting the next paid round. It reports:

- Total, base-game, and free-spin RTP, all divided by paid base-spin wagers only
- Paid-round hit frequency, where any base or free-spin credits make the paid round a hit
- Exclusive BEER-only, CIGARETTE-only, combined, and SWORD feature rates
- Natural and chance activation counts and paid-spin rates for BEER and CIGARETTE
- Total and average free spins, both retrigger counts, and free-spin SWORD interstitials
- Maximum observed multiplier and maximum total paid-round win

Results are repeatable for the same spin count, seed, code, and configuration. The simulation is single-threaded and reports observed samples, not confidence intervals or a formal mathematical proof.

## Changing The Math

- Edit `src/config/reelStrips.ts` to change strip lengths, order, or symbol frequency. Keep one non-empty strip per column.
- Edit `src/config/paytable.ts` to change card multipliers for three, four, or five columns.
- Edit `src/config/gameConfig.ts` to change free-spin awards, multiplier bounds, or below-threshold paid-spin chances.
- Keep trigger chances finite and between 0 and 1, free-spin awards positive safe integers, and multiplier bounds valid safe integers.
- Run `npm run test`, `npm run simulate`, and `npm run build` after coordinated math changes.

## Replacing Text With Artwork

Artwork can be introduced inside the presentation layer without changing math modules:

1. Load local, licensed textures during reel-view initialization.
2. Map each discriminated `Cell` kind and symbol ID to a PixiJS sprite or texture.
3. Replace or hide the current text label while preserving its container, position, and controller-supplied outcome.
4. Never use rendering code to reroll, replace, or reinterpret an outcome.
5. Preserve a text or ARIA equivalent for accessibility.

## Known Limitations

- The current reel strips, paytable, and trigger probabilities are illustrative and have not been balanced or certified.
- SWORD has no playable game or credit award yet.
- There is no autoplay, persistence, backend, account system, or production asset pipeline.
- Refreshing the page resets credits and seed state because there is no storage layer.
- Browser automation, visual-regression tests, confidence intervals, and formal statistical analysis are not included.

## Disclaimer

This is a local technical prototype for development and education. It is not certified gambling software, has not undergone regulatory or statistical certification, and must not be used for real-money gambling.
