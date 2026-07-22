# Bonus Slot Edge Cases

This document is the authoritative record of clarified behavior for ambiguous or overlapping outcomes in the current bonus design. The old Hold-and-Win mechanic is removed; `Hold-and-Win-Slot-Prototype-Spec.md` is retained only as superseded history.

## Trigger Matching

- A natural trigger requires at least three copies of the same special symbol anywhere on the grid. Three mixed special symbols do not form a trigger. Counts greater than three still produce the same feature type.
- BEER and CIGARETTE can activate by chance only on paid base spins and only when exactly one or two matching symbols are visible.
- No chance roll occurs when zero matching symbols are visible. SWORD never activates by chance.
- The below-threshold BEER and CIGARETTE chance rolls are independent. Both can succeed on the same paid spin and create a combined feature.
- On a paid spin with at least three SWORD symbols, SWORD has priority over BEER, CIGARETTE, and their chance rolls.
- The configured strips structurally prevent a valid result from containing both at least three SWORD symbols and at least three BEER or CIGARETTE symbols. The engine still enforces SWORD priority defensively for malformed or future configurations.

## Initial Awards

- A BEER activation starts 10 free spins at x1.
- A CIGARETTE activation starts 3 free spins and chooses one integer multiplier uniformly from x2 through x10, inclusive.
- A combined BEER and CIGARETTE activation starts 10 free spins, not 13, and chooses one CIGARETTE multiplier uniformly from x2 through x10.
- The active multiplier is applied separately to each free spin's ordinary ways payout. It is not a one-time credit award and does not itself pay anything.

## Free Spins And Retriggers

- A free spin is evaluated with the multiplier that was active at the start of that spin.
- Retrigger changes are applied only after that spin's payout is calculated and after the normal one-spin counter consumption.
- A natural BEER retrigger adds 10 spins to the remaining count; it does not reset or replace the count.
- A natural CIGARETTE retrigger chooses a new integer uniformly from x2 through x10 and multiplies the current multiplier by that value.
- Retriggers are natural-only and require at least three matching symbols. Below-threshold chance activation is never evaluated during free spins.
- Natural BEER and CIGARETTE retriggers on the same free spin both apply: 10 spins are added and the multiplier compounds.
- A BEER-mode feature remains in BEER mode until a CIGARETTE retrigger changes it to combined mode. A CIGARETTE-mode feature similarly becomes combined after a BEER retrigger. Combined mode remains combined.
- There is no configured multiplier cap. Every multiplier, payout, accumulated win, and counter transition must remain a JavaScript safe integer; the engine rejects overflow rather than rounding or silently losing precision.

## Sword Interstitial

- During free spins, a natural SWORD trigger enters the conceptual `JACKPOT` interstitial. SWORD currently awards no credits.
- The triggering free spin is consumed normally. Its ordinary ways result is still evaluated with the multiplier active at the start of the spin, but SWORD adds no payout.
- After the interstitial, the existing free-spin feature resumes with the same mode and multiplier and with no counter change beyond the normally consumed spin.
- SWORD priority suppresses any same-grid BEER or CIGARETTE retrigger defensively.
- When a playable SWORD game is added, it must execute before the existing free-spin feature resumes.
- A paid-spin SWORD feature also awards no credits in the current implementation. Any ordinary card/WILD ways win on the paid result remains independent.

## Ways Evaluation

- BEER, CIGARETTE, and SWORD do not pay as ways symbols and never substitute for card symbols.
- Card symbols `10`, `J`, `Q`, `K`, and `A` use standard left-to-right ways: a win needs matching cells in at least three consecutive columns beginning with the leftmost column. Matching counts in each participating column are multiplied to obtain the number of ways.
- WILD substitutes for every card symbol. A card-symbol award supported by WILD must contain at least one natural instance of that card symbol in its qualifying columns.
- A qualifying result made entirely from WILD cells is paid once using the highest card policy, currently the `A` paytable. It is not paid once for every card symbol.

## Development Triggers

- Development mode exposes forced BEER, CIGARETTE, combined, and SWORD buttons. The panel is hidden by default, removed at runtime outside Vite development mode, and controller actions are independently guarded by `import.meta.env.DEV`.
- A forced feature can start only from `idle`, charges no wager, and uses the current bet for any free-spin payouts.
- CIGARETTE and combined forced features still select their initial multiplier uniformly from x2 through x10. All forced free spins, multipliers, and retriggers consume the active random sequence normally.
- A forced feature clears the previous `lastWin` and bonus summary before play, then records awards exactly like a naturally triggered feature.
