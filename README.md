# Hell Yeah

Hell Yeah is a browser-based 3-row by 5-column slot prototype built with TypeScript, Vite, and PixiJS. It demonstrates reel-strip outcomes, left-to-right ways with WILD substitution, multiple bonus modes, deterministic seeded play, and a headless math simulator. The interface uses the locally bundled Silkscreen and VT323 fonts.

This is a local technical prototype. It has no accounts, payments, backend, persistence, external services, or real-money capability.

## Highlights

- Five independent reel strips rather than independently generated cells
- Regular-symbol ways wins with WILD substitution
- BEER, CIGARETTE, combined, and SWORD feature outcomes
- Stateful free spins with natural retriggers and landed cash-symbol awards
- Browser Web Crypto randomness for normal play
- Reproducible seeded sessions and simulations
- Responsive PixiJS presentation with local artwork and audio
- Shared, DOM-free math modules for browser play and simulation

## Requirements

- Node.js `^20.19.0`, `^22.12.0`, or `>=24.0.0`
- npm

## Getting Started

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The interface remains usable at approximately 320 pixels wide.

`npm install` installs every runtime dependency, including `@fontsource/silkscreen` and `@fontsource/vt323`. Font files are resolved from those packages and bundled by Vite; they are not loaded from a CDN. If a fresh checkout reports that either font package cannot be resolved, install from the current `package-lock.json` before starting the development server.

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

The report uses US-dollar amounts and separately reports total, base-game, free-spin, and Sword RTP. It also includes bonus share of return, hit and feature rates, bonus activations, retriggers, Sword features during free spins, Sword spins and expansions, final-stage reaches, payout from Final Strike features, maximum free-spin multiplier, and maximum paid-round win.

## Playing

- **Spin** places the selected US-dollar wager and plays one complete paid round. While a base, free, or Sword spin is animating, the button becomes **Settle** and immediately shows that already-resolved spin.
- **- / +** moves through the configured bets: `$0.20`, `$0.40`, `$0.60`, `$0.80`, `$1.00`, `$1.20`, `$1.40`, `$1.60`, `$1.80`, `$2.00`, `$2.50`, `$3.00`, `$5.00`, `$10.00`, `$25.00`, `$50.00`, `$75.00`, `$100.00`, `$150.00`, `$200.00`, `$250.00`, `$300.00`, `$400.00`, and `$500.00`.
- **Turbo** shortens the current and future spin animations without changing results. It can be toggled during spins and bonus games; a qualifying spin remains in Turbo through its settlement, then Turbo turns off before the feature-start prompt.
- **Music On / Music Off** and **SFX On / SFX Off** control the soundtrack and sound effects independently. Both are enabled by default. Bonus-symbol columns replace the normal reel-lock click with symbol-specific first, second, and third hit sounds; an individual feature's third hit also plays its win sound. A combined Beer + Cigarette trigger plays its own stinger after the reels settle, and the large-win count-up loops its sound until dismissed.
- **Reset** restores a `$450,000.00` balance and a `$500.00` bet, restarts an active deterministic sequence, and clears prior Spin Ledger entries.
- **Engage** starts a deterministic random sequence from a non-empty seed in the Machine Room.
- **Release** restores browser Web Crypto randomness.
- **Spin Ledger** displays the 30 most recent game events. Reset removes its prior history and records the reset.
- **Feature Buy** first plays a qualifying spin showing one purchased bonus symbol per selected column, awards any ordinary ways win from that spin, and then waits for `Press to Start ... Feature`. Combined buys randomly show either three BEER and two CIGARETTE or two BEER and three CIGARETTE. BEER costs 23.5x bet, CIGARETTE costs 58.5x, BEER + CIGARETTE costs 58.6x, and SWORD costs 900x. The in-game balance must cover the displayed price. These prototype prices are independent of the current math balance.
- Ways wins and completed feature payouts of at least 5x their triggering bet show a large payout count-up: `BIG WIN!` at 5x-9.99x, `HUGE WIN!` at 10x-24.99x, `SUPER WIN!` at 25x-49.99x, and `HELL YEAH!` at 50x or more. Once the count completes, the final payout remains until the player clicks or taps the machine window to continue.

Bet, wager, reset, seed, and feature-buy controls are disabled while a round or feature is running; Settle and Turbo remain available where described above.

## Accessibility

- A keyboard-accessible skip link moves directly to the game controls.
- Status changes, feature announcements, and the Spin Ledger use live regions where appropriate.
- The PixiJS reel and Sword canvases expose text alternatives that update with their visible symbols.

## Game Overview

Regular symbols `10`, `J`, `Q`, `K`, `A`, `GUN`, and `KNIGHT` pay left to right from the first reel. `GUN` ranks directly above `A`, and `KNIGHT` is the highest-paying regular symbol. `WILD` substitutes for regular symbols. `BEER`, `CIGARETTE`, and `SWORD` are non-paying special symbols.

| Symbol | 3 columns | 4 columns | 5 columns |
| --- | ---: | ---: | ---: |
| `10` | x0.1 | x0.1 | x0.2 |
| `J` | x0.1 | x0.2 | x0.3 |
| `Q` | x0.2 | x0.3 | x0.5 |
| `K` | x0.2 | x0.4 | x0.5 |
| `A` | x0.5 | x0.7 | x5.2 |
| `GUN` | x0.8 | x2.3 | x15 |
| `KNIGHT` | x1.5 | x4.5 | x30 |

| Feature | Initial award |
| --- | --- |
| BEER | 10 free spins at x5 |
| CIGARETTE | 10 free spins at x1; each CIGARETTE awards x0.5-x50 bet in uniform x0.5 steps |
| BEER + CIGARETTE | 10 free spins at x5; BEER and CIGARETTE awards are each multiplied by x5 |
| SWORD | Sword Cleave: expanding 5-column respins, stage multipliers, and a possible Final Strike |

Each spinning column can show at most one BEER, CIGARETTE, or SWORD, and a grid can show at most three matching copies of one type. BEER and CIGARETTE features require three matching symbols. A combined feature requires all five columns to show BEER/CIGARETTE symbols split 3+2 in either direction. During CIGARETTE spins, every CIGARETTE awards a uniform x0.5-x50 base value; during combined spins, every CIGARETTE and BEER awards a base value, then counts up to x5 after the reels settle. Three BEER or three CIGARETTE symbols add 10 spins. A feature converts to combined when the opposite symbol retriggers; x5 combined behavior begins on the following spin. SWORD takes priority when outcomes overlap.

Sword Cleave displays a 5x6 board with its bottom three rows initially unlocked. Covered rows still resolve symbols but cannot pay or trigger an award until an expansion unlocks them upward. Its boards use `10`, `J`, `Q`, `K`, `A`, GUN, KNIGHT, WILD, and at most one SWORD. Sword ways use a dedicated feature paytable documented in [Game Rules and Edge Cases](Edge-Cases.md). Before a spin with three, four, or five unlocked rows, an in-play Sword expansion has a 40%, 25%, and 10% chance respectively. Only after that roll fails, the same chance can place a cosmetic no-op SWORD in a locked row. Each expansion adds three spins and replaces the active multiplier with the destination band: 5x4 x5-x10, 5x5 x14-x18, or 5x6 x25-x30. Sword Cleave payouts are capped at 3,750x the triggering bet.

Cash-symbol awards materially affect RTP. Use the seeded simulator to review the result after changing award ranges, reel strips, or feature rules; it is not a statistical or regulatory certification.

See [Game Rules and Edge Cases](Edge-Cases.md) for the authoritative paytable, trigger probabilities, retrigger order, WILD treatment, SWORD priority, and round-accounting rules.

## Deterministic Play

Normal browser play uses Web Crypto. Applying a seed switches the session to a deterministic random source; resetting the game restarts that seed's sequence.

Reproduction depends on the same seed, code, configuration, starting state, and player actions. Reel stops, guaranteed bonus positions, combined 3+2 orientation, free spins, landed cash awards, Sword in-play and locked-row checks and targets, Sword board cells, stage multipliers, and Final Strikes consume the same sequence. Presentation-only scrolling cash values do not consume it. Buying or forcing a feature, or changing the order of actions, therefore changes later outcomes.

The seeded generator is intended for repeatability, not cryptographic security.

## Development Controls

`npm run dev` exposes a separate service panel for forcing BEER, CIGARETTE, combined, and SWORD features. Production startup removes that panel from the UI, and the controller independently rejects forced triggers outside Vite development mode. Each development action plays the same qualifying-symbol spin as its Feature Buy counterpart, places no wager, credits any ordinary ways win at the selected bet, consumes the active random sequence normally, and waits for the same manual start prompt. Production Feature Buy controls always charge the displayed in-game balance price.

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

Symbol artwork, the top-bar logo, and `BG_VIDEO.mp4` are stored in `graphics/`; audio is stored in `audio/`. The Silkscreen and VT323 files come from the installed Fontsource packages. Vite bundles all runtime assets through module URL and CSS imports; the prototype uses no runtime CDN or external asset service.

## Current Limitations

- The game targets approximately 98% theoretical RTP but has not been independently balanced or certified.
- Sword Cleave's rare Final Strike paths make short simulations highly volatile.
- There is no automatic spin mode, persistence, backend, or account system.
- Refreshing the page resets the balance and seed state.
- Browser automation, visual-regression testing, and formal statistical analysis are not included.

## License

This repository is `UNLICENSED`. Its source and assets are provided for viewing only; no permission is granted to use, copy, modify, or distribute them.

## Disclaimer

This project is for local development and education only. It is not certified gambling software, has not undergone regulatory or statistical certification, and must not be used for real-money gambling.
