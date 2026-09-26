# Repository Guide

## Sources Of Truth

- Current behavior comes from the code, with intended game outcomes documented authoritatively in `docs/Edge-Cases.md`.
- `../README.md` is the public overview; `Edge-Cases.md` is the detailed public game contract; this file contains engineering instructions. Keep agent-only implementation constraints out of the public docs.
- Math configuration lives in `../src/config/{gameConfig,paytable,reelStrips,swordConfig}.ts`. Keep rule changes coordinated with `../src/math/`, tests, and the simulator; update `../README.md` and `Edge-Cases.md` when public behavior changes.

## Commands

- Install/start: `npm install`, then `npm run dev`.
- Full unit suite: `npm run test`.
- One test file: `npm run test -- src/tests/BonusEngine.test.ts`.
- One named test: `npm run test -- src/tests/BonusEngine.test.ts -t "adds 5 spins for three Cigarettes"`.
- Strict typecheck plus production bundle: `npm run build` (`tsc --noEmit && vite build`). There are no separate lint, format, or typecheck scripts.
- Headless math check: `npm run simulate -- --spins=10000 --seed=12345`; omitting arguments runs 100,000 paid spins with seed `12345`.
- After changing game math or reel strips, run `npm run test`, `npm run simulate`, and `npm run build`.

## Architecture And Invariants

- `src/main.ts` boots the browser app; `GameController` owns sequencing and state transitions; `src/presentation/` owns rendering, animation, audio, and control wiring but not game outcomes. `src/simulation/runSimulation.ts` is a Node entrypoint that must use the same config and `src/math/` APIs as browser play.
- Keep `ReelEngine`, `BonusEngine`, and payout evaluation free of DOM/PixiJS dependencies. Complete outcomes, including chance triggers and retriggers, must be resolved before animation; presentation must never reroll or reinterpret them.
- `ReelEngine` and `BonusEngine` must share one injected `RandomSource`. Seed reproducibility depends on preserving random-call order across reel stops, chance checks, multiplier picks, free spins, and retriggers.
- Balances, bets, and payouts are stored as integer cents; counters, bonus multipliers, and paytable multiplier tenths are also integer-only. Every configured bet must be divisible by the paytable scale. All values must remain JavaScript safe integers. Use the checks in `src/math/safeInteger.ts`; do not silently round or cap overflow.
- Development bonus buttons are Vite-development-only, charge no wager, and still consume the active random sequence. Preserve both the UI removal and the controller's `import.meta.env.DEV` guard.
- Browser assets live outside `src/`: graphics under `graphics/`, audio under `audio/`. They are bundled through `new URL(..., import.meta.url)` references; do not treat those paths as public-folder URLs.
- Presentation changes must preserve usability around 320px width and a text or ARIA equivalent for visual symbol content.
- Use player-centered language in UI copy and public documentation. Avoid hardware-oriented labels; prefer "game", "reels", "controls", or "game window" as appropriate.
- Reel-lock tuning is centralized in `src/presentation/ReelLockImpact.ts`; preserve the shared base/Sword behavior in `ReelGridView` and `SwordBoardView`, update `ReelLockImpact.test.ts`, and retune its 28ms audio pre-roll if effect-file leading silence changes.

## Testing Notes

- Unit coverage is math-focused under `src/tests/`; there is no browser or visual automation. Use `ControlledRandomSource` from `src/tests/testUtils.ts` when exact random calls or outcomes matter.
- Reel-strip changes can alter structural reachability and the entire seeded sequence. Keep `ReelEngine.test.ts` invariants passing and review a seeded simulation.
