# Game Rules and Edge Cases

This document is the authoritative public contract for current game behavior, including ambiguous and overlapping outcomes. The old Hold-and-Win mechanic was removed; `Hold-and-Win-Slot-Prototype-Spec.md` is retained only as superseded history.

## Currency and Rounds

- Monetary values are displayed as US dollars with two decimal places and stored internally as integer cents. Counters and bonus multipliers are integers; paytable multipliers are stored as integer tenths.
- The starting balance is `$1,000.00`, and the default bet is `$10.00`.
- The available bets are `$0.20`, `$0.40`, `$0.60`, `$0.80`, `$1.00`, `$1.20`, `$1.40`, `$1.60`, `$1.80`, `$2.00`, `$2.50`, `$3.00`, `$5.00`, `$10.00`, `$25.00`, `$50.00`, `$75.00`, `$100.00`, `$150.00`, `$200.00`, `$250.00`, `$300.00`, `$400.00`, and `$500.00`.
- A paid spin deducts the selected bet. Triggered free spins place no additional wager and use the triggering bet.
- A paid round awards its ordinary ways win plus every free-spin win from a triggered feature.
- A free-spin ways win is multiplied by the multiplier active at the start of that spin.
- A SWORD trigger starts Sword Cleave, which awards a separate accumulated feature payout. Ordinary regular-symbol/WILD ways on the triggering grid still pay first.
- Values must remain within the JavaScript safe-integer range. An overflow rejects the operation instead of rounding or capping it.

## Reels and Symbols

- The game has five separate 64-stop reel strips. One stop is selected on each reel, then three consecutive entries are read with wraparound; the 15 visible cells are not generated independently.
- Every reel currently contains three BEER entries, one CIGARETTE entry, and one WILD entry.
- SWORD appears once on reels 1, 3, and 5 and does not appear on reels 2 or 4.
- SWORD entries are isolated from other special symbols in their visible windows. This makes a natural SWORD trigger structurally incompatible with a natural BEER or CIGARETTE trigger on the current strips.
- The regular symbols are `10`, `J`, `Q`, `K`, `A`, `COIN`, and `SKULL`. `COIN` ranks directly above `A`, and `SKULL` is the highest-paying regular symbol. `WILD` substitutes for regular symbols. `BEER`, `CIGARETTE`, and `SWORD` neither pay as ways symbols nor substitute for regular symbols.

## Ways Evaluation

A regular symbol wins when that symbol or WILD appears in at least three consecutive columns beginning with the leftmost column. Matching cells in each participating column are multiplied to obtain the number of ways.

```text
award in cents = ways x paytable multiplier tenths x (bet in cents / 10)
```

Paytable values are stored as integer tenths so all configured wagers produce exact cent payouts without rounding. For example, one x0.1 way at a `$0.20` bet awards `$0.02`.

| Symbol | 3 columns | 4 columns | 5 columns |
| --- | ---: | ---: | ---: |
| `10` | x0.1 | x0.1 | x0.1 |
| `J` | x0.1 | x0.1 | x0.2 |
| `Q` | x0.2 | x0.2 | x0.4 |
| `K` | x0.2 | x0.4 | x0.5 |
| `A` | No award | x0.6 | x5.2 |
| `COIN` | x4 | x12 | x80 |
| `SKULL` | x8 | x24 | x160 |

- Multiple regular symbols can win on one result.
- WILD can support each applicable regular symbol, but an award must contain at least one natural instance of that symbol in its qualifying columns.
- A qualifying result made entirely from WILD cells is paid once using the `SKULL` paytable, not once for every regular symbol.
- A matching sequence that does not begin in the leftmost column does not pay.

## Paid-Spin Triggers

A natural feature requires at least three copies of the same special symbol anywhere on the grid. Mixed special symbols are not added together to reach the threshold, and counts above three do not change the feature type.

BEER and CIGARETTE can also activate by chance on paid spins when exactly one or two matching symbols are visible:

| Visible symbols | BEER chance | CIGARETTE chance |
| ---: | ---: | ---: |
| 0 | No roll | No roll |
| 1 | 0.2% | 0.5% |
| 2 | 0.8% | 1.0% |
| 3 or more | Natural trigger | Natural trigger |

- BEER and CIGARETTE chance rolls are independent. Both can activate on the same paid spin, including a mixture of natural and chance activation, and create the combined feature.
- Chance activation is evaluated only on paid spins. Free-spin retriggers are natural-only.
- SWORD never activates by chance.
- At least three SWORD symbols take priority over BEER, CIGARETTE, and their chance rolls. The engine retains this priority even for malformed or future reel configurations where outcomes could overlap.

## Initial Feature Awards

- **BEER:** 10 free spins at the x5 free-spin baseline.
- **CIGARETTE:** 3 free spins with the x5 baseline multiplied by one uniformly selected integer from x2 through x10, producing an initial x10 through x50 multiplier.
- **Combined:** 10 free spins, not 13, with the same x5 baseline and uniformly selected CIGARETTE factor, producing an initial x10 through x50 multiplier.
- **SWORD:** Sword Cleave, described below.

The x5 baseline is applied once when a feature starts and is included in the displayed active multiplier. The active multiplier applies separately to each spin's ordinary ways payout; it is not a one-time award and pays nothing by itself.

## Free Spins and Retriggers

- Free spins use the same reel strips as paid spins.
- A retrigger is natural-only and requires at least three matching BEER or CIGARETTE symbols on the free-spin grid.
- The multiplier active at the start of a free spin determines that spin's payout.
- The normal one-spin counter consumption and ways payout are resolved before retrigger changes take effect.
- A natural BEER retrigger adds 10 to the remaining spins. It does not reset or replace the counter.
- A natural CIGARETTE retrigger uniformly selects a new integer from x2 through x10 and multiplies it into the current effective multiplier. The x5 baseline is not applied again.
- Natural BEER and CIGARETTE retriggers on the same spin both apply: 10 spins are added and the multiplier compounds.
- A BEER feature becomes combined after a CIGARETTE retrigger. A CIGARETTE feature becomes combined after a BEER retrigger. Combined mode never returns to a single-symbol mode.
- There is no arbitrary multiplier cap; only safe-integer limits apply.

## Sword Cleave

- At least three SWORD symbols trigger Sword Cleave and take priority over BEER, CIGARETTE, and their chance rolls. The triggering paid grid's independent regular-symbol/WILD ways still pay.
- Sword Cleave starts with a fresh 5x3 dedicated board, three Cleave Spins, and an active x1 Sword multiplier. Its boards contain `10`, `J`, `Q`, `K`, `A`, WILDs, and at most one non-paying SWORD; COIN and SKULL do not appear, and the boards never create BEER or CIGARETTE triggers. Non-Sword cells use weights `10` 30, `J` 25, `Q` 20, `K` 18, `A` 6, and WILD 1.
- Every Cleave Spin resolves normal left-to-right ways on its current board, multiplies that award by the active Sword multiplier, and adds it to a Sword-only accumulator. The balance is credited once when Sword Cleave completes.
- Before a 5x3, 5x4, or 5x5 board is drawn, there is a 40%, 25%, or 10% chance respectively for exactly one SWORD expansion. The SWORD replaces a drawn card or WILD and does not contribute to that spin's ways payout. It lands before the board changes; after the spin ends, a fully populated bottom row is revealed and the Cleave counter resets to three for the next spin.
- The multiplier selected by an expansion replaces, rather than compounds with, the prior Sword multiplier. The destination-row bands are: 5x4 x5-x10, 5x5 x14-x18, and 5x6 x25-x30.
- The expansion spin uses the multiplier active before its SWORD lands. The selected replacement multiplier begins on the next Cleave Spin.
- At 5x6 no new SWORD can appear. The feature completes after its final three Cleave Spins. If it reaches 5x6, one Final Strike multiplies the entire Sword accumulator: x5 (53%), x10 (21%), x15 (12%), x20 (7%), x30 (4%), x50 (2%), or x100 (1%).
- If a 5x3 through 5x5 feature exhausts three spins without expanding, it ends without a Final Strike and awards its unmodified Sword accumulator.
- During free spins, a natural SWORD trigger consumes the current spin and suppresses same-grid BEER and CIGARETTE retriggers. That triggering spin pays its ordinary ways at the multiplier active when it began; Sword Cleave then completes before the interrupted free-spin state resumes.

## Quick Spin and Deterministic Seeds

- Complete outcomes are fixed before visual animation. Quick Spin changes timing only and cannot change symbols, triggers, multipliers, or payouts.
- Transient scrolling symbols traverse each column's configured reel strip from a presentation-only random offset. They preserve that reel's symbol frequency and ordering but do not select or alter the predetermined final stop.
- The Beer x5 reveal and Cigarette multiplier roll are cosmetic. The displayed Cigarette or combined roll always stops on the multiplier resolved before the bonus-intro animation begins.
- Sword Cleave highlights the evaluated ways on each stopped board. On expansion, it shows the larger populated board and a cosmetic roll through the resolved destination multiplier band before the reset Cleave Spins begin; neither animation rerolls the outcome.
- Normal browser play uses Web Crypto randomness. A non-empty applied seed starts a deterministic sequence.
- The same seed reproduces the same results only with the same code, configuration, starting state, and player actions.
- Reel stops, paid-spin chance checks, multiplier picks, free spins, and retriggers consume one sequence in execution order.
- Resetting while a seed is active restores the initial balance and bet and restarts that seed's sequence. Clearing the seed restores Web Crypto randomness.

## Development Triggers

- Vite development mode exposes forced BEER, CIGARETTE, combined, and SWORD buttons. They are absent from production builds.
- A forced feature can start only while the game is idle, charges no wager, and uses the current selected bet for free-spin payouts.
- Forced CIGARETTE and combined features still select their initial factor uniformly from x2 through x10, then combine it with the x5 baseline for an effective x10 through x50 multiplier.
- Forced multipliers, free spins, reel stops, and retriggers consume the active random sequence normally, so using a development trigger changes subsequent seeded results.
- Starting a forced feature clears the previous last-win value and bonus summary, then records awards like a naturally triggered feature.

## Simulation Interpretation

- The requested spin count includes paid base spins only. The simulator completes every triggered free-spin feature before starting the next paid spin.
- Total, base-game, and free-spin RTP all use paid base-spin wagers as the denominator; free spins do not add wager.
- The configured target is approximately 98% RTP, allocating about 81 points to paid/free-spin ways and about 17 points to Sword Cleave. Sword Cleave, including Final Strike paths, is the highest-return and rarest feature.
- The theoretical target is a design calculation, not a guarantee for a finite session or a regulatory certification. Compounding CIGARETTE multipliers and rare Sword Final Strikes create substantial simulation variance.
- Paid-round hit frequency counts a round as a hit when either the base spin or its complete free-spin feature awards money.
- BEER-only, CIGARETTE-only, combined, and SWORD feature rates are exclusive paid-spin outcomes.
- Results are repeatable for the same spin count, seed, code, and configuration.
- Reports are observed single-threaded samples, not confidence intervals, certification, or a mathematical proof.
