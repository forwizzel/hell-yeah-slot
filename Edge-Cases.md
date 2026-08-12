# Game Rules and Edge Cases

This document is the authoritative public contract for current game behavior, including ambiguous and overlapping outcomes.

## Currency and Rounds

- Monetary values are displayed as US dollars with two decimal places and stored internally as integer cents. Counters and bonus multipliers are integers; paytable multipliers are stored as integer tenths.
- The starting balance is `$450,000.00`, and the default bet is `$500.00`, making the 900x Sword buy available on a fresh launch.
- The available bets are `$0.20`, `$0.40`, `$0.60`, `$0.80`, `$1.00`, `$1.20`, `$1.40`, `$1.60`, `$1.80`, `$2.00`, `$2.50`, `$3.00`, `$5.00`, `$10.00`, `$25.00`, `$50.00`, `$75.00`, `$100.00`, `$150.00`, `$200.00`, `$250.00`, `$300.00`, `$400.00`, and `$500.00`.
- A paid spin deducts the selected bet. Triggered free spins place no additional wager and use the triggering bet.
- A paid round awards its ordinary ways win plus every free-spin win from a triggered feature.
- A free-spin ways win is multiplied by the multiplier active at the start of that spin. BEER and combined spins use x5; CIGARETTE-only spins use x1.
- CIGARETTE and, during combined spins, BEER symbols can award separate cash values. These cash awards are added to the spin payout and are not ways wins.
- A SWORD trigger starts Sword Cleave, which awards a separate accumulated feature payout. Ordinary regular-symbol/WILD ways on the triggering grid still pay first.
- Values must remain within the JavaScript safe-integer range; values are never silently rounded or capped. A validation or overflow error stops the current operation and returns browser play to idle. Browser play is not transactional, so state changes already applied before the error, including a paid wager deduction or completed earlier feature awards, are not automatically rolled back.

## Large-Win Display

- An ordinary ways win or completed free-spin or Sword Cleave payout at least five times its triggering bet shows a large payout count-up after that award resolves. The display does not alter the resolved outcome or award money a second time.
- The labels are `BIG WIN!` from 5x up to 10x, `HUGE WIN!` from 10x up to 25x, `SUPER WIN!` from 25x up to 50x, and `HELL YEAH!` at 50x or more.
- The final payout remains visible after the count-up until the player clicks or taps the game window to dismiss it and continue the current round or feature. The large-win count-up sound loops from the start of the count until that dismissal.

## Reels and Symbols

- The game has five separate 64-stop reel strips. One stop is selected on each reel, then three consecutive entries are read with wraparound; the 15 visible cells are not generated independently.
- The current reel counts are BEER `4/7/9/0/0`, CIGARETTE `0/0/3/3/9`, and SWORD `3/4/0/4/0` across reels 1 through 5. These produce exact aggregate activation rates of approximately 2.6468% BEER, 0.9883% CIGARETTE, and 0.4944% SWORD per paid spin; the approximately 0.2053% combined rate is included in both BEER and CIGARETTE activation rates.
- Every special entry is separated from every other special entry on the same cyclic strip by at least two ordinary stops. A visible column therefore contains at most one BEER, CIGARETTE, or SWORD.
- Each special-symbol type appears on exactly three reel strips, so no grid can contain more than three matching copies. BEER is available on reels 1-3, CIGARETTE on reels 3-5, and SWORD on reels 1, 2, and 4. This keeps both combined layouts reachable while making a natural SWORD trigger structurally incompatible with another feature trigger.
- The regular symbols are `10`, `J`, `Q`, `K`, `A`, `GUN`, and `KNIGHT`. `GUN` ranks directly above `A`, and `KNIGHT` is the highest-paying regular symbol. GUN and KNIGHT are more common than before but remain substantially rarer than the lower symbols. `WILD` substitutes for regular symbols. `BEER`, `CIGARETTE`, and `SWORD` neither pay as ways symbols nor substitute for regular symbols.

## Ways Evaluation

A regular symbol wins when that symbol or WILD appears in at least three consecutive columns beginning with the leftmost column. Matching cells in each participating column are multiplied to obtain the number of ways.

```text
award in cents = ways x paytable multiplier tenths x (bet in cents / 10)
```

Paytable values are stored as integer tenths so all configured wagers produce exact cent payouts without rounding. For example, one x0.1 way at a `$0.20` bet awards `$0.02`.

| Symbol | 3 columns | 4 columns | 5 columns |
| --- | ---: | ---: | ---: |
| `10` | x0.1 | x0.1 | x0.2 |
| `J` | x0.1 | x0.2 | x0.3 |
| `Q` | x0.2 | x0.3 | x0.5 |
| `K` | x0.2 | x0.4 | x0.5 |
| `A` | x0.5 | x0.7 | x5.2 |
| `GUN` | x0.8 | x2.3 | x15 |
| `KNIGHT` | x1.5 | x4.5 | x30 |

- Multiple regular symbols can win on one result.
- WILD can support each applicable regular symbol, but an award must contain at least one natural instance of that symbol in its qualifying columns.
- A qualifying result made entirely from WILD cells is paid once using the `KNIGHT` paytable, not once for every regular symbol.
- A matching sequence that does not begin in the leftmost column does not pay.

## Paid-Spin Triggers

A single-symbol feature requires three matching special symbols in three different columns. The combined feature is the exception: it requires all five columns to contain BEER/CIGARETTE symbols split 3+2 in either direction.

- Three BEER symbols award BEER free spins unless the remaining two columns contain CIGARETTE symbols.
- Three CIGARETTE symbols award CIGARETTE free spins unless the remaining two columns contain BEER symbols.
- Three BEER plus two CIGARETTE, or two BEER plus three CIGARETTE, award the combined feature.
- At least three SWORD symbols take priority over BEER, CIGARETTE, and any other feature trigger. The engine retains this priority even for malformed or future reel configurations where outcomes could overlap.

## Initial Feature Awards

- **BEER:** 10 free spins at x5.
- **CIGARETTE:** 10 free spins at x1. Each CIGARETTE that lands during these spins awards a separate cash value.
- **Combined:** 10 free spins at x5. Each BEER and CIGARETTE that lands awards a separate cash value, then receives the combined feature's x5 multiplier.
- **SWORD:** Sword Cleave, described below.

The x5 Beer multiplier applies separately to each BEER or combined spin's ordinary ways payout. In combined mode it also multiplies each landed BEER/CIGARETTE cash value; it is not a one-time award.

## Feature Buys

- Feature Buy first plays a qualifying purchase spin using the selected feature's bonus symbols, evaluates ordinary ways on that grid, and then waits for the player to press the on-screen start button before the feature begins.
- A BEER, CIGARETTE, or SWORD purchase spin contains three symbols of its selected type in distinct columns. A combined purchase spin randomly selects either three BEER plus two CIGARETTE or two BEER plus three CIGARETTE, filling all five columns.
- Purchased bonus-symbol columns are selected without replacement, while each selected column receives an independently selected row. Placement consumes the active random sequence and remains reproducible under a seed. Selecting a combined 3+2 orientation consumes one additional random choice.
- The current selected bet determines both the price and the feature's payout denomination: BEER costs 23.5x bet, CIGARETTE costs 58.5x, BEER + CIGARETTE costs 58.6x, and SWORD costs 900x.
- The price is deducted once before the feature's multiplier selection or feature play begins. A buy is unavailable when the in-game balance is below its displayed price; it then deducts nothing and consumes no random values.
- These Feature Buy prices are prototype values independent of the current math balance.
- Bought CIGARETTE and combined features use the same free-spin and cash-award rules as their naturally triggered equivalents. A buy uses the selected bet for feature payouts and large-win tiers, not its purchase price.
- The ordinary ways payout from the purchase spin uses the selected bet and is added before the bonus feature payout.

## Free Spins and Retriggers

- Free spins use the same reel strips as paid spins.
- A retrigger requires at least three matching BEER or CIGARETTE symbols on the free-spin grid.
- The multiplier active at the start of a free spin determines that spin's payout.
- The normal one-spin counter consumption and ways payout are resolved before retrigger changes take effect.
- A natural BEER retrigger adds 10 to the remaining spins. It does not reset or replace the counter.
- A natural CIGARETTE retrigger also adds 10 to the remaining spins. It does not select or compound a multiplier.
- Every CIGARETTE on a CIGARETTE-only spin receives one uniformly selected value from x0.5 through x50 in x0.5 steps. Every BEER and CIGARETTE on a combined spin receives one base value: BEER x0.5 through x25 and CIGARETTE x0.5 through x50, both in uniform x0.5 steps. Combined values are then multiplied by x5.
- A CIGARETTE retrigger during a BEER feature adds 10 spins and converts the feature to combined, but the triggering Beer-only spin does not award cash values. A BEER retrigger during a CIGARETTE feature adds 10 spins and converts the feature to combined; its x5 ways and cash behavior begins on the following spin.
- The 3+2 combined rule applies only to initial paid-spin triggers. On a free-spin 3+2 grid, only the symbol appearing three times adds 10 spins; all eligible cash symbols on that spin still award their individual values.
- A BEER feature becomes combined after a CIGARETTE retrigger. A CIGARETTE feature becomes combined after a BEER retrigger. Combined mode never returns to a single-symbol mode.

## Sword Cleave

- At least three SWORD symbols trigger Sword Cleave and take priority over BEER and CIGARETTE. The triggering paid grid's independent regular-symbol/WILD ways still pay.
- Every natural, purchased, or development-triggered bonus pauses after its triggering spin and requires the player to press the on-screen start button before its intro animation and feature spins begin.
- Sword Cleave displays a dedicated 5x6 board, three Cleave Spins, and an active x1 Sword multiplier. Its bottom three rows start unlocked; expansions unlock one row upward until all six rows are active. Every row resolves symbols on every spin, but locked rows are covered and excluded from ways, winning highlights, and feature awards. Boards contain `10`, `J`, `Q`, `K`, `A`, `GUN`, `KNIGHT`, WILDs, and at most one non-paying SWORD; the boards never create BEER or CIGARETTE triggers. Non-Sword cells use weights `10` 28, `J` 23, `Q` 18, `K` 16, `A` 8, `GUN` 5, `KNIGHT` 1, and WILD 1.
- Every Cleave Spin resolves the same left-to-right ways rules and WILD treatment as the base game, but uses the dedicated Sword paytable below and considers only unlocked rows. It multiplies that award by the active Sword multiplier and adds it to a Sword-only accumulator. The balance is credited once when Sword Cleave completes.

| Sword symbol | 3 columns | 4 columns | 5 columns |
| --- | ---: | ---: | ---: |
| `10` | x0.1 | x0.1 | x0.1 |
| `J` | x0.1 | x0.1 | x0.2 |
| `Q` | x0.2 | x0.2 | x0.4 |
| `K` | x0.2 | x0.4 | x0.8 |
| `A` | x0.5 | x0.8 | x5.2 |
| `GUN` | x0.5 | x0.8 | x5.2 |
| `KNIGHT` | x0.5 | x0.8 | x5.2 |

GUN and KNIGHT can now land on valid Sword boards and use the dedicated Sword paytable above. A qualifying all-WILD Sword result is paid once through the internal Sword KNIGHT entry: x0.5 for three columns, x0.8 for four, or x5.2 for five.

- Before a feature with three, four, or five unlocked rows is drawn, there is a 40%, 25%, or 10% chance respectively for exactly one SWORD expansion in an unlocked row. The SWORD replaces a drawn card or WILD and does not contribute to that spin's ways payout. It unlocks the next covered row upward and adds three spins to the remaining Cleave counter. If that in-play expansion roll fails, a second roll at the same chance can place one cosmetic SWORD in a locked row; it is covered and does not unlock a row, add spins, select a multiplier, or affect payout.
- The multiplier selected by an expansion replaces, rather than compounds with, the prior Sword multiplier. The destination-row bands are: 5x4 x5-x10, 5x5 x14-x18, and 5x6 x25-x30.
- The expansion spin uses the multiplier active before its SWORD lands. The selected replacement multiplier begins on the next Cleave Spin.
- At 5x6 no new SWORD can appear. If it reaches 5x6, the feature continues until its remaining Cleave spins expire, then one Final Strike multiplies the entire Sword accumulator: x5 (53%), x10 (21%), x15 (12%), x20 (7%), x30 (4%), x50 (2%), or x100 (1%). The completed Sword payout is capped at 3,750x the triggering bet.
- If a 5x3 through 5x5 feature exhausts its remaining spins without expanding, it ends without a Final Strike and awards its unmodified Sword accumulator.
- During free spins, a natural SWORD trigger consumes the current spin and suppresses same-grid BEER and CIGARETTE retriggers. That triggering spin pays its ordinary ways at the multiplier active when it began; Sword Cleave then completes before the interrupted free-spin state resumes.

## Spin Controls and Auto Spin

- Complete outcomes are fixed before visual animation. Turbo changes timing only and cannot change symbols, triggers, cash awards, or payouts.
- Final bonus symbols are counted independently by type as columns lock from left to right. The first, second, and third copy play their matching numbered sound instead of that column's generic lock click. The third copy of a resolved BEER, CIGARETTE, or SWORD trigger/retrigger also starts that symbol's win sound. Combined triggers play all five numbered hit sounds, then start their combined win stinger after the reels settle.
- A SWORD that causes a Sword Cleave expansion plays the first SWORD hit sound when its column locks but does not play the SWORD feature-win sound.
- During a base, free, or Sword spin animation, clicking the Spin button settles only the current already-resolved spin. It does not place another wager, reroll the outcome, enable Turbo, or skip evaluation and feature sequencing.
- Turbo can be enabled or disabled during an active spin or bonus game. Enabling it accelerates the current animation and applies to future spins until disabled.
- Turbo remains active through the settled triggering spin, then is disabled before the BEER, CIGARETTE, combined, or SWORD feature-start prompt. The player can enable it again during that feature.
- Transient scrolling symbols traverse each column's configured reel strip from a presentation-only random offset. They preserve that reel's symbol frequency and ordering but do not select or alter the predetermined final stop.
- CIGARETTE cash labels show the resolved award on the landed symbol. In combined spins, BEER/CIGARETTE labels begin at their resolved base value after the board settles and count up to their resolved x5 value. Transient non-landing eligible symbols show presentation-only values that never affect the outcome.
- Sword Cleave visually focuses only evaluated ways in its unlocked rows on each stopped 5x6 board. On expansion, it removes the cover from the newly unlocked row and shows a cosmetic roll through the resolved destination multiplier band before the additional Cleave spins begin; neither animation rerolls the outcome.
- Browser play always uses Web Crypto randomness and exposes no deterministic seed control. Seeded reproducibility is limited to the headless simulator.
- Auto Spin accepts a configured bet and 1-1,000 paid spins. Its bet remains fixed for the run, and only paid base spins decrement the remaining count; triggered free spins and Sword spins do not.
- Auto Spin resolves one complete paid round before starting the next. It cannot overlap a manual spin, Feature Buy, development trigger, or another Auto Spin run.
- Stop requests finish the current already-resolved paid spin, then preserve the unplayed count in the status.
- If a paid spin triggers BEER, CIGARETTE, combined, or SWORD, Auto Spin ends after that triggering spin. The feature remains locked in and waits for the normal manual feature-start action.
- Base-game large-win count-ups complete without a dismissal hold during Auto Spin, then the next paid spin begins. Feature large wins retain normal manual dismissal because Auto Spin has already ended at the feature trigger.
- Auto Spin ends before another wager when the balance cannot cover its configured bet. Invalid bets and spin counts do not start a run or consume balance/randomness.

## Reel Lock Animation and SFX Sync

- Base, free-spin, and Sword Cleave columns use the same mechanical reel-lock response. The final cells enter their stopped position, then the column moves 8px past rest, recoils 3px in the opposite direction, makes a 1.5px final rebound, and returns to rest while a warm amber impact flash fades.
- The normal mechanical response lasts 120ms. Turbo uses a 72ms version so the impact remains visible without slowing quick play. The spin animation completes only after the final active impact finishes.
- Column effects begin 28ms before the visual lock to compensate for the approximately 24-31ms leading silence retained in the MP3 effect files. The audible click, symbol hit, or win transient should therefore align with the physical impact rather than the later recoil.
- `src/presentation/ReelLockImpact.ts` owns the pre-roll, duration, offset curve, and flash-alpha tuning values. `ReelGridView` and `SwordBoardView` apply them independently to their columns.
- Manual Settle immediately renders the resolved result and fires any not-yet-started column effects in left-to-right order. It intentionally skips the mechanical slam rather than adding a delay to the player action.
- The slam, flash, and audio pre-roll are presentation-only. They must not alter resolved symbols, payouts, feature triggers, random-call order, or evaluation timing.

## Development Triggers

- Vite development mode exposes forced BEER, CIGARETTE, combined, and SWORD buttons. Production startup removes their panel from the UI, and the controller independently rejects forced triggers outside development mode.
- A development feature can start only while the game is idle. It first plays a qualifying spin using the same symbol construction as the corresponding Feature Buy, then waits for the normal manual feature-start action.
- Development qualifying spins charge no wager, evaluate and credit ordinary ways at the selected bet, and use that bet for all feature payouts and large-win tiers.
- Development combined orientation, guaranteed positions, multipliers, free spins, reel stops, Sword board and feature selections, and retriggers consume browser Web Crypto randomness normally.
- Starting a development feature clears the previous last-win value and bonus summary, then records the qualifying-spin and feature awards like a purchased feature.

## Simulation Interpretation

- The requested spin count includes paid base spins only. The simulator completes every triggered free-spin feature before starting the next paid spin.
- Total, base-game, free-spin, and Sword RTP all use paid base-spin wagers as the denominator; free spins and Sword Cleave do not add wager.
- Cash-symbol awards materially change RTP and should be reviewed through the seeded simulator after any award-range or reel-strip tuning. Sword Cleave, including Final Strike paths, remains the rarest feature.
- The theoretical target is a design calculation, not a guarantee for a finite session or a regulatory certification. Compounding CIGARETTE multipliers and rare Sword Final Strikes create substantial simulation variance.
- Paid-round hit frequency counts a round as a hit when its base spin, complete free-spin feature, or any triggered Sword feature awards money.
- BEER-only, CIGARETTE-only, combined, and SWORD feature rates are exclusive paid-spin outcomes.
- The report separately counts Sword features triggered during free spins, Sword spins, expansions, features reaching 5x6, and the total payout from features that received a Final Strike.
- Maximum observed multiplier refers to the active Beer/combined free-spin multiplier; it does not include Sword stage or Final Strike multipliers.
- Results are repeatable for the same spin count, seed, code, and configuration.
- Reports are observed single-threaded samples, not confidence intervals, certification, or a mathematical proof.
