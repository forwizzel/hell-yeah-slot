**How The App Runs**

1. `index.html` provides the page structure and control IDs.
2. `src/main.ts` loads global CSS, background/logo assets, creates `GameView`, then creates and initializes `GameController`.
3. `GameController` is the coordinator. It owns the current `GameState`, balance, bet, RNG, feature sequence, and calls the view to animate already-resolved results.
4. `GameView` and the other `presentation/` files render the PixiJS reels/Sword board, controls, overlays, audio, and event log. They do not decide outcomes.
5. `math/` determines every game outcome: reel stops, ways payouts, feature triggers, free spins, cash awards, Sword boards, multipliers, and Final Strike.
6. `simulation/runSimulation.ts` uses the same math/config files without a browser or graphics, so it is the right place to measure the effect of math changes.

**A Normal Spin**

- `GameController.spin()` checks that the game is idle and affordable, deducts the bet, and clears the previous round display.
- `ReelEngine` selects one random stop on each of the five configured reel strips and reads three consecutive symbols per reel.
- `PayEvaluator` calculates left-to-right ways wins from that 3x5 grid.
- `BonusEngine` checks the same grid for BEER, CIGARETTE, combined, or SWORD triggers.
- The complete base-spin result is determined before the animation starts. `ReelGridView` only animates toward that resolved grid.
- The controller credits the normal win, then starts the relevant feature if one triggered.

**Auto Spin**

- `GameController` owns Auto Spin run state and invokes the same `spin()` path used by the manual Spin button.
- Each completed paid spin decrements the configured count. A bonus trigger ends the run before its feature starts, while a base-game large-win count-up dismisses automatically.
- `ControlPanel` validates the configured bet/count through controller actions and renders remaining-spin status; it never schedules or resolves outcomes.
- `GAME_CONFIG.maximumAutoSpins` bounds custom runs.

**Feature Flow**

- **BEER:** starts free spins at x3.
- **CIGARETTE:** starts free spins at x1; landed CIGARETTE symbols receive independently rolled cash awards.
- **Combined:** starts x3 free spins; both BEER and CIGARETTE can land weighted cash awards, then those awards are multiplied by x3.
- Free-spin retriggers and conversions to combined mode are handled by `BonusEngine`.
- **SWORD:** `SwordEngine` switches to a separate 5x6 board. It evaluates only unlocked rows, can expand upward, adds three spins to the remaining counter on expansion, replaces the active multiplier from a configured range, and can apply a Final Strike after reaching 6 rows.
- A SWORD during free spins pauses the free-spin feature, completes Sword Cleave, then resumes free spins.

**Where To Change Game Math**

| Goal | Main file | Important values |
| --- | --- | --- |
| Starting money, default bet, bet buttons | `src/config/gameConfig.ts` | `startingBalanceCents`, `defaultBetCents`, `BET_OPTIONS_CENTS` |
| Free spins, retriggers, multiplier, cash ladders, round cap | `src/config/gameConfig.ts` | `beerFreeSpins`, retrigger counts, `beerFreeSpinMultiplier`, cash-award tables, `maximumPaidRoundWinMultiplier` |
| Feature-buy prices | `src/config/gameConfig.ts` | `FEATURE_BUY_MULTIPLIER_TENTHS` |
| Regular symbol payouts | `src/config/paytable.ts` | `PAYTABLE` |
| Sword-specific payouts | `src/config/paytable.ts` | `SWORD_PAYTABLE` |
| Base hit rate and feature frequency | `src/config/reelStrips.ts` | `CARD_DISTRIBUTION`, special-symbol placements in `REEL_STRIPS` |
| Sword frequency/value/volatility | `src/config/swordConfig.ts` | `startingSpins`, `expansionChances`, `boardSymbols`, `multiplierBands`, `finalStrikes` |
| Large-win display thresholds | `src/presentation/LargeWin.ts` | `TIERS` |

**Important Number Formats**

- Money is always stored as integer cents: `$5.00` is `500`.
- Paytable and cash-award multipliers use tenths: `52` means x5.2; `500` means x50.
- Keep all payouts as safe integers. The `safeInteger.ts` checks intentionally fail instead of rounding.
- Bets must remain divisible by 10 cents because of the payout scale.

**Reel Strips**

`src/config/reelStrips.ts` is the biggest RTP and frequency lever.

- Each reel has 64 stops.
- A spin picks one stop per reel; the three visible cells are consecutive positions, not independent random cells.
- More copies of a regular symbol generally increase its frequency.
- More BEER/CIGARETTE/SWORD positions increase feature frequency, but their reel placement controls which combinations are structurally possible.
- The existing spacing ensures no visible reel column has two bonus symbols and each special type is limited to three relevant reels. Keep those constraints unless you deliberately change the game rules and engine assumptions.

**Presentation And Feel**

- `src/styles.css`: page layout, typography, color, responsive behavior, overlays, controls.
- `src/presentation/ReelGridView.ts`: normal 3x5 PixiJS grid, symbol textures, reel movement, cash labels.
- `src/presentation/SwordBoardView.ts`: 5x6 Sword board, locked-row cover, Sword spin animation.
- `src/presentation/ReelLockImpact.ts`: reel stop impact feel.
  - `REEL_LOCK_SOUND_PREROLL_MS`
  - normal/Turbo impact durations
  - bounce offsets and flash intensity
- `src/config/gameConfig.ts`: most animation timing values, such as `normalSpinDurationMs`, `quickSpinDurationMs`, evaluation delays, count-up durations, and large-win hold duration.
- `src/presentation/GameAudio.ts`: soundtrack/effect asset paths plus `SOUNDTRACK_VOLUME` and `SYMBOL_EFFECT_GAIN`.
- `graphics/` and `audio/`: source art, video, and sound assets.
- Keep player-facing labels player-centered: use "game", "reels", "controls", or "game window" rather than hardware-oriented terms.

**State And Types**

- `src/core/types.ts` defines the shared vocabulary: grids, cells, payouts, free-spin state, Sword state, and phases.
- `src/core/GameState.ts` holds the mutable session state and produces a safe snapshot for rendering.
- `GamePhase` is the main state flow. It prevents controls from doing inappropriate actions during animations or features.
- `src/core/GuaranteedFeatureSymbols.ts` creates qualifying feature-buy and development-trigger grids.

**Randomness And Reproducibility**

- Normal browser play uses `CryptoRandomSource`, backed by browser Web Crypto.
- `SeededRandomSource` is used by the headless simulator and math tests, not browser controls.
- One shared random source is injected into `ReelEngine`, `BonusEngine`, and `SwordEngine`.
- Any math or simulation action-order change alters later seeded simulator results because it changes random-call order.
- The temporary scrolling symbols use `Math.random()` only for visuals; they do not affect outcomes.

**Tests And Simulation**

- `src/tests/` mirrors the important math and presentation helpers. For example:
  - `ReelEngine.test.ts` protects reel constraints.
  - `PayEvaluator.test.ts` protects ways rules.
  - `BonusEngine.test.ts` protects triggers, retriggers, and cash awards.
  - `SwordEngine.test.ts` protects Sword behavior.
- After changing math, run:
  - `npm run test`
  - `npm run analyze`
  - `npm run simulate -- --spins=100000 --seed=12345`
  - `npm run build`
- The simulator report is the practical way to compare RTP, feature rates, bonus share, retriggers, and Sword volatility before and after a tuning change.

`Edge-Cases.md` is the intended public rules contract. When changing math behavior rather than only appearance/timing, update it alongside the config and tests.
