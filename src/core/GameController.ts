import { GAME_CONFIG, getAdjacentBetCents } from "../config/gameConfig";
import { PAYTABLE } from "../config/paytable";
import { REEL_STRIPS } from "../config/reelStrips";
import { BonusEngine } from "../math/BonusEngine";
import { CryptoRandomSource } from "../math/CryptoRandomSource";
import { evaluateWays } from "../math/PayEvaluator";
import type { RandomSource } from "../math/RandomSource";
import { ReelEngine } from "../math/ReelEngine";
import { safeAdd } from "../math/safeInteger";
import { SeededRandomSource } from "../math/SeededRandomSource";
import type { GameView } from "../presentation/GameView";
import type { DevelopmentBonusId } from "../presentation/ControlPanel";
import { formatUsd } from "./formatUsd";
import { GameState } from "./GameState";
import type {
  BonusActivation,
  BonusSymbolId,
  BonusTrigger,
  FreeSpinResult,
  Grid,
  Position,
  SpinResult,
} from "./types";

export class GameController {
  private readonly state = new GameState();
  private activeSeed: string | null = null;
  private random: RandomSource = new CryptoRandomSource();
  private reelEngine = this.createReelEngine();
  private bonusEngine = this.createBonusEngine();

  constructor(private readonly view: GameView) {
    view.bindControls({
      spin: () => { void this.spin(); },
      decreaseBet: () => this.adjustBet(-1),
      increaseBet: () => this.adjustBet(1),
      toggleSound: () => this.view.toggleSound(),
      reset: () => this.reset(),
      applySeed: (seed) => this.applySeed(seed),
      clearSeed: () => this.clearSeed(),
      triggerDevelopmentBonus: (bonus) => { void this.triggerDevelopmentBonus(bonus); },
    });
  }

  initialize(): void {
    this.render();
    this.view.addLog("Game ready.");
  }

  private async spin(): Promise<void> {
    if (this.state.phase !== "idle" || this.state.balanceCents < this.state.betCents) {
      return;
    }

    const quickSpin = this.view.isQuickSpinEnabled();
    const spinDuration = quickSpin ? GAME_CONFIG.quickSpinDurationMs : GAME_CONFIG.normalSpinDurationMs;
    const evaluationDelay = quickSpin ? GAME_CONFIG.quickEvaluationDelayMs : GAME_CONFIG.normalEvaluationDelayMs;
    const triggeringBetCents = this.state.betCents;

    try {
      this.state.balanceCents -= triggeringBetCents;
      this.state.lastWinCents = 0;
      this.state.winningPositions = [];
      this.state.freeSpins = null;
      this.state.bonusSummary = null;
      this.state.phase = "base-spinning";
      this.view.addLog(`Bet ${formatUsd(triggeringBetCents)} placed.`);
      this.view.addLog("Base spin started.");
      this.render();
      this.view.playSound("spin");

      // The complete paid-spin outcome, including chance triggers, is fixed before animation.
      const result = this.createPaidSpinResult(triggeringBetCents);
      const bonusSoundGroups = naturalTriggerPositionGroups(result.bonusTrigger);
      await this.view.animateBaseSpin(result.grid, spinDuration, bonusSoundGroups);
      this.state.grid = result.grid;
      this.state.phase = "base-evaluation";
      this.state.winningPositions = result.winningPositions;
      this.awardWin(result.regularWinCents);
      this.view.addLog(result.regularWinCents > 0 ? `Base win: ${formatUsd(result.regularWinCents)}.` : "No base win.");
      this.render();
      await this.view.wait(evaluationDelay);

      if (result.bonusTrigger.kind === "sword") {
        await this.playSwordBonus(evaluationDelay, false, bonusSoundGroups.length > 0);
      } else if (result.bonusTrigger.kind === "free-spins") {
        await this.playFreeSpins(
          result.bonusTrigger,
          triggeringBetCents,
          spinDuration,
          evaluationDelay,
          bonusSoundGroups.length > 0,
        );
      }

      this.state.freeSpins = null;
      this.state.phase = "idle";
      this.render();
    } catch (error: unknown) {
      this.handleGameError(error);
    }
  }

  private async triggerDevelopmentBonus(bonus: DevelopmentBonusId): Promise<void> {
    if (!import.meta.env.DEV || this.state.phase !== "idle") {
      return;
    }

    const quickSpin = this.view.isQuickSpinEnabled();
    const spinDuration = quickSpin ? GAME_CONFIG.quickSpinDurationMs : GAME_CONFIG.normalSpinDurationMs;
    const evaluationDelay = quickSpin ? GAME_CONFIG.quickEvaluationDelayMs : GAME_CONFIG.normalEvaluationDelayMs;
    this.state.lastWinCents = 0;
    this.state.winningPositions = [];
    this.state.freeSpins = null;
    this.state.bonusSummary = null;
    this.view.addLog(`[DEV] Forced ${developmentBonusLabel(bonus)} at bet ${formatUsd(this.state.betCents)}; no wager charged.`);

    try {
      if (bonus === "sword") {
        await this.playSwordBonus(evaluationDelay, false, false);
      } else {
        const includesCigarette = bonus === "cigarette" || bonus === "combined";
        const trigger: Extract<BonusTrigger, { kind: "free-spins" }> = {
          kind: "free-spins",
          mode: bonus,
          startingSpins: bonus === "cigarette" ? GAME_CONFIG.cigaretteFreeSpins : GAME_CONFIG.beerFreeSpins,
          multiplier: includesCigarette ? this.pickDevelopmentMultiplier() : 1,
          beer: null,
          cigarette: null,
        };
        await this.playFreeSpins(trigger, this.state.betCents, spinDuration, evaluationDelay, false);
      }

      this.state.freeSpins = null;
      this.state.phase = "idle";
      this.render();
    } catch (error: unknown) {
      this.handleGameError(error);
    }
  }

  private createPaidSpinResult(betCents: number): SpinResult {
    const grid = this.reelEngine.spin();
    const evaluation = evaluateWays(grid, PAYTABLE, betCents);
    return {
      grid,
      regularWinCents: evaluation.totalWinCents,
      bonusTrigger: this.bonusEngine.resolveBaseTrigger(grid),
      winningPositions: evaluation.winningPositions,
    };
  }

  private async playFreeSpins(
    trigger: Extract<BonusTrigger, { kind: "free-spins" }>,
    triggeringBetCents: number,
    spinDuration: number,
    evaluationDelay: number,
    playWinnerSound: boolean,
  ): Promise<void> {
    this.state.winningPositions = [];
    this.state.freeSpins = this.bonusEngine.startFreeSpins(trigger, triggeringBetCents);
    this.state.phase = "bonus-intro";
    this.logTrigger(trigger.beer);
    this.logTrigger(trigger.cigarette);
    this.view.addLog(`${featureLabel(trigger.mode)} started with ${trigger.startingSpins} free spins at x${trigger.multiplier}.`);
    this.render();
    if (playWinnerSound) {
      this.view.playSound("symbol-winner");
    }
    await this.view.wait(evaluationDelay * 2);

    while (this.state.freeSpins.remainingSpins > 0) {
      const previousState = this.state.freeSpins;
      this.state.phase = "free-spin-spinning";
      this.state.winningPositions = [];
      this.render();

      // Free-spin payout and all retrigger effects are fixed before animation.
      const grid = this.reelEngine.spin();
      const evaluation = evaluateWays(grid, PAYTABLE, previousState.triggeringBetCents);
      const result = this.bonusEngine.applyFreeSpin(previousState, grid, evaluation.totalWinCents);
      const bonusSoundGroups = freeSpinTriggerPositionGroups(grid, result);
      await this.view.animateBaseSpin(grid, spinDuration, bonusSoundGroups);

      this.state.grid = grid;
      this.state.winningPositions = evaluation.winningPositions;
      this.state.freeSpins = result.state;
      this.state.phase = "free-spin-evaluation";
      this.awardWin(result.spinWinCents);
      const spinNumber = result.state.totalSpinsPlayed;
      if (result.spinWinCents > 0) {
        this.view.addLog(
          `Free spin ${spinNumber}: ${formatUsd(evaluation.totalWinCents)} x${previousState.multiplier} = ${formatUsd(result.spinWinCents)}.`,
        );
      } else {
        this.view.addLog(`Free spin ${spinNumber}: no ways win.`);
      }
      if (result.beerRetriggered) {
        this.view.addLog(`Beer retrigger: ${result.addedSpins} spins added.`);
      }
      if (result.cigaretteRetriggered && result.awardedMultiplier !== null) {
        this.view.addLog(`Cigarette retrigger: x${previousState.multiplier} multiplied by x${result.awardedMultiplier} to x${result.state.multiplier}.`);
      }
      this.render();
      if (result.beerRetriggered || result.cigaretteRetriggered) {
        this.view.playSound("symbol-winner");
      }
      await this.view.wait(evaluationDelay);

      if (result.swordTriggered) {
        await this.playSwordBonus(evaluationDelay, true, true);
      }
    }

    const summary = this.bonusEngine.summarize(this.state.freeSpins);
    this.state.bonusSummary = summary;
    this.state.phase = "bonus-complete";
    this.view.addLog(
      `${featureLabel(summary.mode)} complete after ${summary.spinsPlayed} spins. Awarded ${formatUsd(summary.payoutCents)}.`,
    );
    this.render();
    await this.view.wait(evaluationDelay * 2);
  }

  private async playSwordBonus(
    evaluationDelay: number,
    duringFreeSpins: boolean,
    playWinnerSound: boolean,
  ): Promise<void> {
    this.state.phase = "sword-bonus";
    this.view.addLog(duringFreeSpins
      ? "Sword Bonus triggered during free spins. JACKPOT! Free spins will resume."
      : "Sword Bonus triggered. JACKPOT!");
    if (!duringFreeSpins) {
      this.state.bonusSummary = { kind: "sword" };
    }
    this.render();
    if (playWinnerSound) {
      this.view.playSound("symbol-winner");
    }
    await this.view.wait(evaluationDelay * 2);
  }

  private logTrigger(activation: BonusActivation | null): void {
    if (activation === null) {
      return;
    }
    const source = activation.source === "natural" ? "naturally" : "by chance";
    const mode = activation.symbol === "BEER" ? "beer" : "cigarette";
    this.view.addLog(`${featureLabel(mode)} triggered ${source} with ${activation.symbolCount} symbol${activation.symbolCount === 1 ? "" : "s"}.`);
  }

  private awardWin(amountCents: number): void {
    const balanceCents = safeAdd(
      this.state.balanceCents,
      amountCents,
      "Balance exceeds the safe integer range",
    );
    const lastWinCents = safeAdd(
      this.state.lastWinCents,
      amountCents,
      "Round win exceeds the safe integer range",
    );
    this.state.balanceCents = balanceCents;
    this.state.lastWinCents = lastWinCents;
  }

  private pickDevelopmentMultiplier(): number {
    const minimum = GAME_CONFIG.cigaretteMultiplierMinimum;
    const maximum = GAME_CONFIG.cigaretteMultiplierMaximum;
    return this.random.nextInt(maximum - minimum + 1) + minimum;
  }

  private handleGameError(error: unknown): void {
    const message = error instanceof Error ? error.message : "Unknown game error";
    this.view.addLog(`Game error: ${message}`);
    this.state.freeSpins = null;
    this.state.phase = "idle";
    this.render();
  }

  private adjustBet(direction: -1 | 1): void {
    if (this.state.phase !== "idle") {
      return;
    }
    const nextBetCents = getAdjacentBetCents(this.state.betCents, direction);
    if (nextBetCents === this.state.betCents) {
      return;
    }
    this.state.betCents = nextBetCents;
    this.view.playSound(direction > 0 ? "bet-up" : "bet-down");
    this.render();
  }

  private reset(): void {
    if (this.state.phase !== "idle") {
      return;
    }
    this.state.reset();
    this.resetRandomSequence();
    this.view.clearLog();
    this.view.addLog("Game reset.");
    this.render();
  }

  private applySeed(seedInput: string): void {
    if (this.state.phase !== "idle") {
      return;
    }
    const seed = seedInput.trim();
    if (seed.length === 0) {
      this.view.addLog("Seed was not applied: enter a value.");
      return;
    }
    this.activeSeed = seed;
    this.resetRandomSequence();
    this.view.addLog(`Deterministic seed applied: ${seed}.`);
    this.render();
  }

  private clearSeed(): void {
    if (this.state.phase !== "idle") {
      return;
    }
    this.activeSeed = null;
    this.resetRandomSequence();
    this.view.addLog("Seed cleared. Browser crypto randomness restored.");
    this.render();
  }

  private resetRandomSequence(): void {
    this.random = this.activeSeed === null
      ? new CryptoRandomSource()
      : new SeededRandomSource(this.activeSeed);
    this.reelEngine = this.createReelEngine();
    this.bonusEngine = this.createBonusEngine();
  }

  private createReelEngine(): ReelEngine {
    return new ReelEngine(REEL_STRIPS, this.random, GAME_CONFIG.rows);
  }

  private createBonusEngine(): BonusEngine {
    return new BonusEngine(
      this.random,
      GAME_CONFIG.belowThresholdTriggerChances,
      GAME_CONFIG.beerFreeSpins,
      GAME_CONFIG.cigaretteFreeSpins,
      GAME_CONFIG.cigaretteMultiplierMinimum,
      GAME_CONFIG.cigaretteMultiplierMaximum,
    );
  }

  private render(): void {
    this.view.render(this.state.toViewModel(), this.activeSeed);
  }
}

function featureLabel(mode: "beer" | "cigarette" | "combined"): string {
  switch (mode) {
    case "beer":
      return "Beer Bonus";
    case "cigarette":
      return "Cigarette Bonus";
    case "combined":
      return "Beer + Cigarette Bonus";
  }
}

function developmentBonusLabel(bonus: DevelopmentBonusId): string {
  return bonus === "sword" ? "Sword Bonus" : featureLabel(bonus);
}

function naturalTriggerPositionGroups(trigger: BonusTrigger): ReadonlyArray<ReadonlyArray<Position>> {
  if (trigger.kind === "sword") {
    return [trigger.positions];
  }
  if (trigger.kind === "none") {
    return [];
  }

  const groups: Position[][] = [];
  if (trigger.beer?.source === "natural") {
    groups.push(trigger.beer.positions);
  }
  if (trigger.cigarette?.source === "natural") {
    groups.push(trigger.cigarette.positions);
  }
  return groups;
}

function freeSpinTriggerPositionGroups(
  grid: Grid,
  result: FreeSpinResult,
): ReadonlyArray<ReadonlyArray<Position>> {
  if (result.swordTriggered) {
    return [findBonusPositions(grid, "SWORD")];
  }

  const groups: Position[][] = [];
  if (result.beerRetriggered) {
    groups.push(findBonusPositions(grid, "BEER"));
  }
  if (result.cigaretteRetriggered) {
    groups.push(findBonusPositions(grid, "CIGARETTE"));
  }
  return groups;
}

function findBonusPositions(grid: Grid, symbol: BonusSymbolId): Position[] {
  const positions: Position[] = [];
  for (let row = 0; row < grid.length; row += 1) {
    for (let column = 0; column < (grid[row]?.length ?? 0); column += 1) {
      const cell = grid[row]?.[column];
      if (cell?.kind === "bonus" && cell.symbol === symbol) {
        positions.push({ row, column });
      }
    }
  }
  return positions;
}
