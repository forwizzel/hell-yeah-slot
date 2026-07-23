# Hell Yeah

Hell Yeah is a browser-based 3-row by 5-column slot prototype built with TypeScript, Vite, and PixiJS. It demonstrates reel-strip outcomes, left-to-right ways with WILD substitution, multiple bonus modes, deterministic seeded play, and a headless math simulator.

This is a local technical prototype. It has no accounts, payments, backend, persistence, external services, or real-money capability.

## Highlights

- Five independent reel strips rather than independently generated cells
- Card-symbol ways wins with WILD substitution
- BEER, CIGARETTE, combined, and SWORD feature outcomes
- Stateful free spins with natural retriggers and compounding multipliers
- Browser Web Crypto randomness for normal play
- Reproducible seeded sessions and simulations
- Responsive PixiJS presentation with local artwork and audio
- Shared, DOM-free math modules for browser play and simulation

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`
- npm

## Getting Started

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The interface remains usable at approximately 320 pixels wide.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run test` | Run the Vitest unit suite once |
| `npm run simulate` | Simulate 100,000 paid spins with seed `12345` |
| `npm run build` | Type-check and create the production bundle |

The simulator accepts optional paid-spin and seed arguments:

```bash
npm run simulate -- --spins=1000000 --seed=my-seed
```

`--spins` must be a positive safe integer. `--seed` must be non-empty. Invalid values produce a warning and fall back to the defaults. Triggered free spins are completed in addition to the requested paid spins.

The report uses US-dollar amounts, separates base-game and free-spin RTP, reports the bonus share of return, and includes hit rates, feature rates, activations, retriggers, maximum multiplier, and maximum paid-round win.

## Playing

- **Spin** places the selected US-dollar wager and plays one complete paid round.
- **- / +** moves through the configured bets: `$0.20`, `$0.40`, `$0.60`, `$0.80`, `$1.00`, `$1.20`, `$1.40`, `$1.60`, `$1.80`, `$2.00`, `$2.50`, `$3.00`, `$5.00`, `$10.00`, `$25.00`, `$50.00`, `$75.00`, `$100.00`, `$150.00`, `$200.00`, `$250.00`, `$300.00`, `$400.00`, and `$500.00`.
- **Quick Spin** shortens animation without changing the result.
- **Sound Off / Sound On** controls all audio; sound begins disabled.
- **Reset Game** restores a `$1,000.00` balance and a `$10.00` bet.
- **Apply Seed** starts a deterministic random sequence from a non-empty seed.
- **Clear Seed** restores browser Web Crypto randomness.

Controls that can mutate the game are disabled while a round or feature is running.

## Game Overview

Card symbols `10`, `J`, `Q`, `K`, and `A` pay left to right from the first reel. `WILD` substitutes for card symbols. `BEER`, `CIGARETTE`, and `SWORD` are non-paying special symbols.

| Symbol | 3 columns | 4 columns | 5 columns |
| --- | ---: | ---: | ---: |
| `10` | x0.1 | x0.1 | x0.1 |
| `J` | x0.1 | x0.1 | x0.2 |
| `Q` | x0.2 | x0.2 | x0.4 |
| `K` | x0.2 | x0.4 | x0.8 |
| `A` | x0.5 | x0.8 | x5.2 |

| Feature | Initial award |
| --- | --- |
| BEER | 10 free spins at x6 |
| CIGARETTE | 3 free spins at x12 through x60: the x6 baseline times a uniform x2 through x10 selection |
| BEER + CIGARETTE | 10 free spins at x12 through x60: the x6 baseline times a uniform x2 through x10 selection |
| SWORD | A placeholder `JACKPOT` interstitial with no monetary award |

BEER and CIGARETTE can activate naturally or through configured below-threshold chances on paid spins. Free-spin retriggers are natural-only: BEER adds spins, while CIGARETTE compounds the active multiplier by another uniform x2 through x10 selection. The x6 baseline is applied once at feature initialization and is included in the displayed multiplier. SWORD takes priority when outcomes overlap.

The configured math targets approximately 98% theoretical RTP: about 28.76 percentage points from paid-spin ways and 69.24 from free spins. Free spins therefore account for about 70.65% of expected return. This design target is not a statistical or regulatory certification.

See [Game Rules and Edge Cases](Edge-Cases.md) for the authoritative paytable, trigger probabilities, retrigger order, WILD treatment, SWORD priority, and round-accounting rules.

## Deterministic Play

Normal browser play uses Web Crypto. Applying a seed switches the session to a deterministic random source; resetting the game restarts that seed's sequence.

Reproduction depends on the same seed, code, configuration, starting state, and player actions. Feature triggers and free spins consume the same sequence as reel stops, so forcing a development bonus or changing the order of actions changes later outcomes.

The seeded generator is intended for repeatability, not cryptographic security.

## Development Controls

`npm run dev` exposes buttons for forcing BEER, CIGARETTE, combined, and SWORD features. They are absent from production builds. Forced features place no wager, use the selected bet for payouts, and consume the active random sequence normally.

## Project Layout

```text
src/
  config/         Game settings, paytable, and reel strips
  core/           Domain types, state, and browser orchestration
  math/           Random sources, reel generation, payouts, and bonus rules
  presentation/   PixiJS rendering, controls, animation, and audio
  simulation/     Node-compatible headless simulation
  tests/          Math-focused unit tests
  main.ts         Browser entry point
```

Artwork is stored in `graphics/`; audio is stored in `sfx/sfx/`. All runtime assets are local.

## Current Limitations

- The game targets approximately 98% theoretical RTP but has not been independently balanced or certified.
- SWORD has no playable game or monetary award.
- There is no autoplay, persistence, backend, account system, or production asset pipeline.
- Refreshing the page resets the balance and seed state.
- Browser automation, visual-regression testing, and formal statistical analysis are not included.

The superseded Hold-and-Win brief remains in [`Hold-and-Win-Slot-Prototype-Spec.md`](Hold-and-Win-Slot-Prototype-Spec.md) for project history only. It does not describe the current game.

## License

This repository is `UNLICENSED`. Its source and assets are provided for viewing only; no permission is granted to use, copy, modify, or distribute them.

## Disclaimer

This project is for local development and education only. It is not certified gambling software, has not undergone regulatory or statistical certification, and must not be used for real-money gambling.
