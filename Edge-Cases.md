# Game Rules and Edge Cases

This document is the authoritative public contract for current game behavior, including ambiguous and overlapping outcomes. The old Hold-and-Win mechanic was removed; `Hold-and-Win-Slot-Prototype-Spec.md` is retained only as superseded history.

## Credits and Rounds

- All credits, bets, counters, multipliers, and payouts are integers.
- A paid spin deducts the selected bet. Triggered free spins place no additional wager and use the triggering bet.
- A paid round awards its ordinary ways win plus every free-spin win from a triggered feature.
- A free-spin ways win is multiplied by the multiplier active at the start of that spin.
- SWORD currently adds no credits, but ordinary card/WILD ways on the same grid still pay.
- Values must remain within the JavaScript safe-integer range. An overflow rejects the operation instead of rounding or capping it.

## Reels and Symbols

- The game has five separate 64-stop reel strips. One stop is selected on each reel, then three consecutive entries are read with wraparound; the 15 visible cells are not generated independently.
- Every reel currently contains three BEER entries, one CIGARETTE entry, and one WILD entry.
- SWORD appears once on reels 1, 3, and 5 and does not appear on reels 2 or 4.
- SWORD entries are isolated from other special symbols in their visible windows. This makes a natural SWORD trigger structurally incompatible with a natural BEER or CIGARETTE trigger on the current strips.
- The card symbols are `10`, `J`, `Q`, `K`, and `A`. `WILD` substitutes for cards. `BEER`, `CIGARETTE`, and `SWORD` neither pay as ways symbols nor substitute for cards.

## Ways Evaluation

A card symbol wins when that symbol or WILD appears in at least three consecutive columns beginning with the leftmost column. Matching cells in each participating column are multiplied to obtain the number of ways.

```text
award = ways x paytable multiplier x bet
```

| Symbol | 3 columns | 4 columns | 5 columns |
| --- | ---: | ---: | ---: |
| `10` | x1 | x2 | x5 |
| `J` | x2 | x4 | x8 |
| `Q` | x3 | x6 | x12 |
| `K` | x4 | x8 | x16 |
| `A` | x5 | x10 | x20 |

- Multiple card symbols can win on one result.
- WILD can support each applicable card symbol, but an award must contain at least one natural instance of that card in its qualifying columns.
- A qualifying result made entirely from WILD cells is paid once using the `A` paytable, not once for every card symbol.
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

- **BEER:** 10 free spins at x1.
- **CIGARETTE:** 3 free spins with one uniformly selected integer multiplier from x2 through x10, inclusive.
- **Combined:** 10 free spins, not 13, with one uniformly selected CIGARETTE multiplier from x2 through x10.
- **SWORD:** a placeholder `JACKPOT` interstitial with no credit award.

The active free-spin multiplier applies separately to each spin's ordinary ways payout. It is not a one-time award and pays nothing by itself.

## Free Spins and Retriggers

- Free spins use the same reel strips as paid spins.
- A retrigger is natural-only and requires at least three matching BEER or CIGARETTE symbols on the free-spin grid.
- The multiplier active at the start of a free spin determines that spin's payout.
- The normal one-spin counter consumption and ways payout are resolved before retrigger changes take effect.
- A natural BEER retrigger adds 10 to the remaining spins. It does not reset or replace the counter.
- A natural CIGARETTE retrigger uniformly selects a new integer from x2 through x10 and multiplies it into the current multiplier.
- Natural BEER and CIGARETTE retriggers on the same spin both apply: 10 spins are added and the multiplier compounds.
- A BEER feature becomes combined after a CIGARETTE retrigger. A CIGARETTE feature becomes combined after a BEER retrigger. Combined mode never returns to a single-symbol mode.
- There is no arbitrary multiplier cap; only safe-integer limits apply.

## SWORD Priority

- On a paid spin, a natural SWORD trigger takes feature priority. The paid grid's independent card/WILD ways still pay.
- During free spins, a natural SWORD trigger consumes the current spin and suppresses same-grid BEER and CIGARETTE retriggers.
- The triggering free spin still receives its ordinary ways payout using the multiplier active when the spin began.
- The SWORD interstitial adds no payout and otherwise leaves the existing free-spin mode, multiplier, and counter unchanged beyond the normally consumed spin.
- The interrupted free-spin feature resumes after the interstitial. A future playable SWORD game must complete before that feature resumes.

## Quick Spin and Deterministic Seeds

- Complete outcomes are fixed before visual animation. Quick Spin changes timing only and cannot change symbols, triggers, multipliers, or payouts.
- Normal browser play uses Web Crypto randomness. A non-empty applied seed starts a deterministic sequence.
- The same seed reproduces the same results only with the same code, configuration, starting state, and player actions.
- Reel stops, paid-spin chance checks, multiplier picks, free spins, and retriggers consume one sequence in execution order.
- Resetting while a seed is active restores the initial credits and bet and restarts that seed's sequence. Clearing the seed restores Web Crypto randomness.

## Development Triggers

- Vite development mode exposes forced BEER, CIGARETTE, combined, and SWORD buttons. They are absent from production builds.
- A forced feature can start only while the game is idle, charges no wager, and uses the current selected bet for free-spin payouts.
- Forced CIGARETTE and combined features still select their initial multiplier uniformly from x2 through x10.
- Forced multipliers, free spins, reel stops, and retriggers consume the active random sequence normally, so using a development trigger changes subsequent seeded results.
- Starting a forced feature clears the previous last-win value and bonus summary, then records awards like a naturally triggered feature.

## Simulation Interpretation

- The requested spin count includes paid base spins only. The simulator completes every triggered free-spin feature before starting the next paid spin.
- Total, base-game, and free-spin RTP all use paid base-spin wagers as the denominator; free spins do not add wager.
- Paid-round hit frequency counts a round as a hit when either the base spin or its complete free-spin feature awards credits.
- BEER-only, CIGARETTE-only, combined, and SWORD feature rates are exclusive paid-spin outcomes.
- Results are repeatable for the same spin count, seed, code, and configuration.
- Reports are observed single-threaded samples, not confidence intervals, certification, or a mathematical proof.
