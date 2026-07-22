# Hold-and-Win Slot Machine Prototype Specification

> **Superseded:** This is the historical specification for the removed Hold-and-Win design. It is retained for project history only and must not be treated as the current game contract. See `README.md` for the current Beer, Cigarette, and Sword design and `Edge-Cases.md` for its clarified behavior.

You are a senior TypeScript game developer. Build a complete, runnable browser-based slot machine prototype in the current VS Code workspace.
Create the project files directly, install dependencies, run the tests, and fix any errors you encounter. Do not only describe the solution.

## Objective
Create a clean, theme-free skeleton for a 3-row × 5-column Hold-and-Win slot game.
This is a technical prototype for local development only. It must not use real money, payments, accounts, external services, or gambling-platform integrations.
The project should be easy to understand, test, modify, and expand with artwork and more advanced mathematics later.

## Technology stack
**Use:**
* TypeScript
* Vite
* PixiJS
* HTML and CSS for the surrounding controls
* Vitest for unit tests
* npm
* Browser-native Web Crypto API where random values are needed

**Do not use:**
* React
* Vue
* Angular
* A backend
* A database
* Canvas libraries other than PixiJS
* External images, fonts, sounds, APIs, or CDN assets
* `Math.random()` directly inside game logic

## Project requirements
Initialize a Vite TypeScript project in the current directory.
The following commands must work:
* `npm install`
* `npm run dev`
* `npm run build`
* `npm run test`
* `npm run simulate`

The production build must complete without TypeScript errors.

## Visual design
The game must have absolutely no theme.

**Use only:**
* Rectangles
* Borders
* Plain text
* Neutral colors
* Basic CSS transitions or PixiJS movement

**Do not add:**
* Character artwork
* Background artwork
* Decorative symbols
* Particle effects
* Music
* Sound effects
* Gradients
* Casino branding
* Styled currency graphics

Each symbol should be represented by a plain box containing text such as:
* A
* B
* C
* D
* BONUS 1
* BONUS 2
* BONUS 5
* BONUS 10

The interface should be functional and intentionally plain.

## Main screen
Create a responsive single-page application containing:
* A heading: Hold and Win Prototype
* Current credits
* Current bet
* Last win
* Current game phase
* A 3-row × 5-column reel grid
* A Spin button
* Bet decrease and increase buttons
* A Reset Game button
* A compact event log
* A checkbox or toggle for quick-spin mode
* A seed input for deterministic testing
* An Apply Seed button
* A Clear Seed button

The application must remain usable at approximately 320 pixels wide.

## Initial values
Use these defaults:
* Starting credits: 1,000
* Default bet: 10
* Minimum bet: 1
* Maximum bet: 100
* Bet increment: 1
* Grid size: 3 rows × 5 columns
* Bonus starting respins: 3

Use integer credits only. Do not display a currency symbol.

Disable Spin when:
* A spin or bonus sequence is already running
* Credits are lower than the selected bet
* The game is in a non-interactive state

## Game phases
Model the game with an explicit state machine.
Use phases similar to:
```typescript
type GamePhase =
  | "idle"
  | "base-spinning"
  | "base-evaluation"
  | "bonus-intro"
  | "bonus-respin"
  | "bonus-evaluation"
  | "bonus-complete";
```
Do not represent the game phase using loosely related booleans.
The user interface must display the current phase.

## Base-game symbols
Create these regular symbols:
* A
* B
* C
* D

Create one special symbol type:
* BONUS

Every BONUS symbol must contain a credit value.
Use this weighted bonus-value table:
```json
[
  { "value": 1, "weight": 40 },
  { "value": 2, "weight": 30 },
  { "value": 5, "weight": 20 },
  { "value": 10, "weight": 8 },
  { "value": 25, "weight": 2 }
]
```
Treat each bonus value as a multiplier of the current bet.
For example, a BONUS value of 5 at a bet of 10 is worth 50 credits.
Keep all probabilities and symbol weights in configuration files rather than scattering numbers through the code.

## Base-game generation
Create five configurable reel strips, one per column.
Each reel strip should contain regular symbols and BONUS entries.
Generate a base-game result by selecting one stop position on each reel and taking three consecutive symbols from that reel, wrapping around when necessary.
Do not generate all 15 cells independently.
The random-number source must be injected into the reel engine.

## Base-game wins
Implement a simple ways-style evaluation for regular symbols.
A regular-symbol win occurs when the same symbol appears in three or more consecutive columns starting from the leftmost column.
For each qualifying symbol:
* Count how many instances of that symbol appear in each consecutive column.
* Multiply those counts together to determine the number of ways.
* Multiply the ways by the configured payout and current bet.

Use this paytable:
```typescript
const PAYTABLE = {
  A: { 3: 1, 4: 2, 5: 5 },
  B: { 3: 2, 4: 4, 5: 8 },
  C: { 3: 3, 4: 6, 5: 12 },
  D: { 3: 5, 4: 10, 5: 20 }
};
```
Payout values are bet multipliers.
BONUS symbols do not participate in regular-symbol wins.
Show winning cells using a plain border or outline after evaluation.
Keep the win-evaluation logic independent from PixiJS.

## Hold-and-Win trigger
Trigger the Hold-and-Win feature when three or more BONUS symbols appear anywhere in the 3 × 5 base-game result.
When triggered:
* Copy all triggering BONUS symbols into the bonus grid.
* Lock those positions.
* Clear all non-BONUS positions.
* Set remaining respins to 3.
* Do not charge another bet for bonus respins.
* Display the number of locked positions and remaining respins.

The base-game win and bonus win should both be awarded when applicable.

## Hold-and-Win behavior
The bonus grid also contains 15 positions.
During each bonus respin:
* Every unlocked position independently has a configurable chance to land a new BONUS symbol.
* Use a default landing probability of 12 percent per empty position.
* A new BONUS symbol receives a weighted value from the configured bonus-value table.
* Newly landed BONUS symbols become locked.
* Existing locked symbols never move or change.
* If one or more new symbols land, reset remaining respins to 3.
* If no new symbols land, reduce remaining respins by 1.
* End the feature when remaining respins reach 0.
* End the feature immediately when all 15 positions are filled.

At the end of the feature:
* Sum the values of all locked BONUS symbols.
* Multiply the total by the bet used to trigger the feature.
* Add the resulting credits to the player balance.
* Display a clear bonus summary.
* Return the game to the idle phase.

Do not add jackpots, collectors, multipliers, mystery symbols, or other bonus mechanics.

## Animation
The game result must be calculated before the visual animation begins.
The renderer must not decide outcomes.

For a normal spin:
* Visually cycle symbol labels in each column.
* Stop columns sequentially from left to right.
* Use a short duration suitable for development.
* Quick-spin mode should substantially shorten the animation.

For a bonus respin:
* Locked positions must remain visible.
* Empty positions should briefly animate or flash before revealing their result.
* Keep the animation simple and functional.

All animations must return Promises so the controller can await them.

## Random-number architecture
Create this interface:
```typescript
export interface RandomSource {
  nextFloat(): number;
  nextInt(maxExclusive: number): number;
}
```
Provide two implementations:
1. **CryptoRandomSource**
   * Uses `crypto.getRandomValues()`
   * Used for normal browser play
2. **SeededRandomSource**
   * Deterministic
   * Accepts a string or numeric seed
   * Used by tests, simulations, and the seed controls

All game logic must receive a `RandomSource` dependency.
Do not access randomness directly from rendering code.
Validate arguments such as `maxExclusive`.

## Architecture
Separate the mathematical game logic from presentation.
Use a structure close to:
```
src/
  main.ts
  styles.css

  config/
    gameConfig.ts
    paytable.ts
    reelStrips.ts

  core/
    types.ts
    GameController.ts
    GameState.ts

  math/
    RandomSource.ts
    CryptoRandomSource.ts
    SeededRandomSource.ts
    WeightedPicker.ts
    ReelEngine.ts
    PayEvaluator.ts
    BonusEngine.ts

  presentation/
    GameView.ts
    ReelGridView.ts
    ControlPanel.ts
    EventLogView.ts

  simulation/
    runSimulation.ts

  tests/
    SeededRandomSource.test.ts
    WeightedPicker.test.ts
    ReelEngine.test.ts
    PayEvaluator.test.ts
    BonusEngine.test.ts
```
Minor changes to the structure are acceptable when they improve clarity, but preserve separation between:
* Configuration
* Game mathematics
* State management
* Rendering
* Simulation
* Tests

## Type requirements
Create clear types for at least:
```typescript
type RegularSymbolId = "A" | "B" | "C" | "D";

interface RegularCell {
  kind: "regular";
  symbol: RegularSymbolId;
}

interface BonusCell {
  kind: "bonus";
  value: number;
}

type Cell = RegularCell | BonusCell;

type Grid = Cell[][];

interface Position {
  row: number;
  column: number;
}

interface SpinResult {
  grid: Grid;
  regularWin: number;
  bonusTriggered: boolean;
  triggerPositions: Position[];
}

interface BonusState {
  cells: Array<BonusCell | null>;
  remainingRespins: number;
  totalRespinsPlayed: number;
  triggeringBet: number;
}
```
Use discriminated unions instead of optional properties when practical.
Do not use `any`.
Enable strict TypeScript settings.

## Controller behavior
The `GameController` should coordinate:
* Deducting the bet
* Requesting an outcome from the math engine
* Playing the visual spin
* Evaluating and displaying wins
* Starting the bonus
* Executing bonus respins
* Awarding credits
* Updating the event log
* Preventing overlapping actions
* Resetting the game
* Switching between crypto and seeded randomness

The controller should not contain reel-generation or payout mathematics.

## Event log
Display recent events such as:
* Bet 10 placed.
* Base spin started.
* Regular win: 20.
* Bonus triggered with 4 symbols.
* Bonus respin landed 2 new symbols.
* Respins reset to 3.
* No new symbols. 2 respins remaining.
* Bonus complete. Awarded 180 credits.

Keep only the most recent 30 entries.
The newest event may appear at the top or bottom, but be consistent.

## Simulation command
Create a Node-compatible, headless simulation script.
`npm run simulate` should run at least 100,000 base-game spins without rendering.
It should use a seeded random source by default and print:
* Number of spins
* Total amount wagered
* Total amount won
* Estimated RTP
* Base-game RTP
* Bonus-feature RTP
* Hit frequency
* Bonus-trigger frequency
* Average bonus payout
* Maximum observed total spin win
* Average number of bonus respins
* Percentage of bonuses that fill all 15 positions

Use the exact same math modules and configuration as the browser game.
Do not duplicate the game mathematics inside the simulation script.
Allow optional command-line arguments similar to:
`npm run simulate -- --spins=1000000 --seed=12345`
Validate argument values and provide sensible fallbacks.
The simulator does not need to reproduce animation or UI state.

## Tests
Write meaningful unit tests for the mathematical components.
At minimum, test:
* **SeededRandomSource**
  * The same seed produces the same sequence.
  * Different seeds generally produce different sequences.
  * `nextInt()` stays within bounds.
  * Invalid bounds throw an error.
* **WeightedPicker**
  * It rejects invalid or empty weighted collections.
  * It returns deterministic results with a stubbed or seeded RNG.
  * Zero or negative weights are handled explicitly.
* **ReelEngine**
  * It always creates a 3 × 5 grid.
  * Reel wrapping works correctly.
  * Outcomes are deterministic with a seeded source.
  * Each column comes from the corresponding reel strip.
* **PayEvaluator**
  * No win when a matching symbol does not start in column one.
  * Correct payout for three, four, and five consecutive columns.
  * Correct multiplication when multiple matching symbols occur in a column.
  * Multiple different symbol wins can be awarded in one result.
  * BONUS symbols are ignored.
* **BonusEngine**
  * Initial triggering symbols are locked.
  * Existing symbols survive every respin.
  * New symbols lock correctly.
  * A hit resets respins to 3.
  * A miss reduces respins by 1.
  * The feature ends at zero respins.
  * The feature ends when all 15 cells are filled.
  * Final payout is calculated correctly.
  * Bonus behavior is deterministic with a controlled random source.

Do not write tests that only confirm that functions exist.

## Development tools
Configure:
* TypeScript strict mode
* Vitest
* A useful `.gitignore`
* npm scripts
* Basic formatting consistency

Avoid unnecessary dependencies.

## README
Write a complete `README.md` containing:
* Project purpose
* Technology stack
* Installation instructions
* Development commands
* Test commands
* Simulation command and arguments
* Explanation of the base-game mechanics
* Explanation of the Hold-and-Win mechanics
* Architecture overview
* Instructions for replacing text symbols with artwork later
* Instructions for changing reel strips, paytable, bonus values, and probabilities
* A note that this is a local technical prototype, not certified gambling software
* Known limitations

## Code quality
Follow these requirements:
* Keep functions focused.
* Prefer pure functions in math modules.
* Avoid hidden global state.
* Do not use `any`.
* Do not suppress TypeScript errors.
* Do not leave placeholder functions.
* Do not leave major TODO comments.
* Do not put all logic in one file.
* Add comments where they explain non-obvious game mathematics.
* Use descriptive names.
* Validate configuration where practical.
* Ensure rendering code cannot alter mathematical outcomes.
* Ensure a seeded game can be reproduced.

## Acceptance criteria
The task is complete only when all of the following are true:
* `npm install` succeeds.
* `npm run dev` starts the browser game.
* The page displays a responsive 3 × 5 grid.
* The player can adjust the bet and spin.
* Credits are deducted correctly.
* Regular wins are evaluated and awarded.
* Three or more BONUS symbols trigger the feature.
* Trigger symbols transfer to locked bonus positions.
* Bonus respins work according to the specified reset rules.
* The bonus payout is awarded correctly.
* The full game returns to the idle state.
* The seed controls produce reproducible outcomes.
* `npm run test` passes.
* `npm run simulate` prints the requested statistics.
* `npm run build` succeeds without errors.
* No external visual or audio assets are used.
* The code is divided into clear math, controller, configuration, presentation, and simulation modules.

## Execution process
Perform the work in this order:
1. Inspect the current directory.
2. Initialize the project if necessary.
3. Install the minimum required dependencies.
4. Create the configuration and type definitions.
5. Build and test the random-number utilities.
6. Implement the reel and payout engines.
7. Implement and test the bonus engine.
8. Implement the state and controller.
9. Implement the PixiJS presentation and HTML controls.
10. Implement the simulator.
11. Write the README.
12. Run all tests.
13. Run the production build.
14. Fix every error found.
15. Provide a concise final summary listing:
    * Files and modules created
    * Commands executed
    * Test results
    * Build results
    * Any remaining limitations

Do not stop after scaffolding. Deliver a functioning end-to-end prototype.
