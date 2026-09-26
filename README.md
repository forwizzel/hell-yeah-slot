# Hell Yeah

Hell Yeah is a browser slot game built with **TypeScript, PixiJS, and Vite**. Its five reel strips, left-to-right ways payouts, and four interconnected features share the same game math with a reproducible, headless simulator. The artwork, background video, and audio were made for this project.

![Hell Yeah showing its five reels, balance, controls, Auto Spin, and Feature Buy](screenshots/overview.png)

## Try it

Requires Node.js `^20.19.0` or `>=22.12.0` and npm. To play locally:

```bash
npm ci
npm run dev
```

Open the URL printed by Vite. To try the **production build** instead:

```bash
npm run build
npm run preview
```

`build` type-checks and writes the site to `dist/`; `preview` serves those built files locally (usually on port 4173).

The displayed dollar amounts are virtual game balance and wagers. Hell Yeah has no accounts, payments, backend, persistence, or real-money play. Reloading resets the session; Reset returns the balance to `$450,000.00` and the bet to `$500.00`.

## What it demonstrates

- **Outcome-first architecture:** five 64-stop reel strips determine a 3×5 result; ways evaluation, WILD substitution, feature triggers, cash prizes, and capped payouts resolve independently of PixiJS animation.
- **Connected features:** BEER free spins, CIGARETTE cash awards, a combined mode with retriggers, and Sword Cleave's expanding 5×6 board and possible Final Strike.
- **Exact accounting:** wagers, balances, and awards use integer cents; paytable multipliers use integer tenths; a paid or purchased round has a 10,000×-bet payout ceiling.
- **Two randomness paths:** browser play uses Web Crypto; the Node simulator uses a seeded source with the same math and configuration to reproduce runs. Visual-only scrolling never selects outcomes.
- **Player experience:** Turbo, manual Settle, Auto Spin, feature buys, keyboard-operable feature and payout prompts, responsive controls, audio settings, and reduced-motion behavior.

![Sword Cleave's locked upper rows, active lower rows, winning cells, and feature counters](screenshots/sword-cleave.png)

BEER and CIGARETTE initially award eight free spins (BEER and combined start at x3). Sword Cleave starts with three spins and three unlocked rows; an in-play Sword adds three spins and unlocks another row. Feature Buy deducts its displayed price from the virtual balance, then plays a qualifying spin before the feature starts. Its prices target approximately 98% purchased-round RTP by design, **not** a guaranteed result. For paytables, trigger priorities, retrigger order, cash ladders, and payout accounting, see [Game Rules and Edge Cases](docs/Edge-Cases.md).

## Project map

| Path | Role |
| --- | --- |
| `src/config/` | Reel strips, paytables, bonus configuration, bet and timing settings |
| `src/math/` | DOM-free random sources, reel generation, payout and feature engines |
| `src/core/` | Game state, types, and browser round orchestration |
| `src/presentation/` | PixiJS reels and Sword board, controls, overlays, audio |
| `src/simulation/` | Node-only analysis and seeded simulation |
| `src/tests/` | Unit tests for math and presentation behavior |

See [Code Structure](docs/CODE_STRUCTURE.md) for a guided walkthrough. Normal browser play has no seed controls. `npm run dev` alone shows no-wager feature triggers for development; the production build omits their panel and independently rejects forced triggers in the controller.

## Verify and explore the math

| Command | Purpose |
| --- | --- |
| `npm run test` | Run the Vitest suite |
| `npm run build` | Type-check and build production assets |
| `npm run analyze` | Calculate exact base-game ways RTP by symbol and match length |
| `npm run simulate -- --spins=100000 --seed=12345` | Repeat a seeded sample of paid rounds, including triggered features |
| `npm run simulate -- --spins=250000 --seed=buy-check --feature=combined` | Sample a purchased feature at its configured price |

`--feature` accepts `beer`, `cigarette`, `combined`, or `sword`; the default run uses 100,000 paid spins and seed `12345`. The report separates base, free-spin, and Sword contributions and counts retriggers and expansions. The game targets approximately 98% natural-play RTP, but rare outcomes make short samples volatile. Simulation results are observations, **not** certification, confidence intervals, or guarantees.

## Accessibility and assets

The game provides a skip link, status announcements, text descriptions of visible canvas symbols, keyboard-operable feature starts and large-win dismissal, and a reduced-motion path that avoids reel scrolling, payout count-ups, and background-video playback.

The symbol art, logos, background video, and audio were created by the project author. The bundled [VCR OSD Mono font by Riciery Leal](https://www.dafont.com/vcr-osd-mono.font) is a third-party asset listed on DaFont as “100% Free”; its rights belong to its creator. Graphics and font files are under `graphics/`, and audio is under `audio/`; runtime assets are bundled locally rather than fetched from a CDN.

## Rights and limitations

**All rights reserved.** This repository is `UNLICENSED`: its source and original assets are available to view, but no permission is granted to use, copy, modify, or redistribute them. The third-party font is credited separately above. This game is not certified gambling software and must not be used for real-money gambling. There is no persistent save, account system, or independently certified statistical analysis.
