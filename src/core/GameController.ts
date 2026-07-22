import { GAME_CONFIG } from "../config/gameConfig";
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
import { GameState } from "./GameState";
import type { BonusActivation, BonusTrigger, SpinResult } from "./types";

export class GameController {
  private readonly state = new GameState();
  private activeSeed: string | null = null;
  private random: RandomSource = new CryptoRandomSource();
  private reelEngine = this.createReelEngine();
  private bonusEngine = this.createBonusEngine();

  constructor(private readonly view: GameView) {
    view.bindControls({
      spin: () => { void this.spin(); },
      decreaseBet: () => this.adjustBet(-GAME_CONFIG.betIncrement),
      increaseBet: () => this.adjustBet(GAME_CONFIG.betIncrement),
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
    if (this.state.phase !== "idle" || this.state.credits < this.state.bet) {
      return;
    }

    const quickSpin = this.view.isQuickSpinEnabled();
    const spinDuration = quickSpin ? GAME_CONFIG.quickSpinDurationMs : GAME_CONFIG.normalSpinDurationMs;
    const evaluationDelay = quickSpin ? GAME_CONFIG.quickEvaluationDelayMs : GAME_CONFIG.normalEvaluationDelayMs;
    const triggeringBet = this.state.bet;

    try {
      this.state.credits -= triggeringBet;
      this.state.lastWin = 0;
      this.state.winningPositions = [];
      this.state.freeSpins = null;
      this.state.bonusSummary = null;
      this.state.phase = "base-spinning";
      this.view.addLog(`Bet ${triggeringBet} placed.`);
      this.view.addLog("Base spin started.");
      this.render();

      // The complete paid-spin outcome, including chance triggers, is fixed before animation.
      const result = this.createPaidSpinResult(triggeringBet);
      await this.view.animateBaseSpin(result.grid, spinDuration);
      this.state.grid = result.grid;
      this.state.phase = "base-evaluation";
      this.state.winningPositions = result.winningPositions;
      this.awardWin(result.regularWin);
      this.view.addLog(result.regularWin > 0 ? `Base win: ${result.regularWin}.` : "No base win.");
      this.render();
      await this.view.wait(evaluationDelay);

      if (result.bonusTrigger.kind === "sword") {
        await this.playSwordBonus(evaluationDelay, false);
      } else if (result.bonusTrigger.kind === "free-spins") {
        await this.playFreeSpins(result.bonusTrigger, spinDuration, evaluationDelay);
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
    this.state.lastWin = 0;
    this.state.winningPositions = [];
    this.state.freeSpins = null;
    this.state.bonusSummary = null;
    this.view.addLog(`[DEV] Forced ${developmentBonusLabel(bonus)} at bet ${this.state.bet}; no wager charged.`);

    try {
      if (bonus === "sword") {
        await this.playSwordBonus(evaluationDelay, false);
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
        await this.playFreeSpins(trigger, spinDuration, evaluationDelay);
      }

      this.state.freeSpins = null;
      this.state.phase = "idle";
      this.render();
    } catch (error: unknown) {
      this.handleGameError(error);
    }
  }

  private createPaidSpinResult(bet: number): SpinResult {
    const grid = this.reelEngine.spin();
    const evaluation = evaluateWays(grid, PAYTABLE, bet);
    return {
      grid,
      regularWin: evaluation.totalWin,
      bonusTrigger: this.bonusEngine.resolveBaseTrigger(grid),
      winningPositions: evaluation.winningPositions,
    };
  }

  private async playFreeSpins(
    trigger: Extract<BonusTrigger, { kind: "free-spins" }>,
    spinDuration: number,
    evaluationDelay: number,
  ): Promise<void> {
    this.state.winningPositions = [];
    this.state.freeSpins = this.bonusEngine.startFreeSpins(trigger, this.state.bet);
    this.state.phase = "bonus-intro";
    this.logTrigger(trigger.beer);
    this.logTrigger(trigger.cigarette);
    this.view.addLog(`${featureLabel(trigger.mode)} started with ${trigger.startingSpins} free spins at x${trigger.multiplier}.`);
    this.render();
    await this.view.wait(evaluationDelay * 2);

    while (this.state.freeSpins.remainingSpins > 0) {
      const previousState = this.state.freeSpins;
      this.state.phase = "free-spin-spinning";
      this.state.winningPositions = [];
      this.render();

      // Free-spin payout and all retrigger effects are fixed before animation.
      const grid = this.reelEngine.spin();
      const evaluation = evaluateWays(grid, PAYTABLE, previousState.triggeringBet);
      const result = this.bonusEngine.applyFreeSpin(previousState, grid, evaluation.totalWin);
      await this.view.animateBaseSpin(grid, spinDuration);

      this.state.grid = grid;
      this.state.winningPositions = evaluation.winningPositions;
      this.state.freeSpins = result.state;
      this.state.phase = "free-spin-evaluation";
      this.awardWin(result.spinWin);
      const spinNumber = result.state.totalSpinsPlayed;
      if (result.spinWin > 0) {
        this.view.addLog(`Free spin ${spinNumber}: ${evaluation.totalWin} x${previousState.multiplier} = ${result.spinWin}.`);
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
      await this.view.wait(evaluationDelay);

      if (result.swordTriggered) {
        await this.playSwordBonus(evaluationDelay, true);
      }
    }

    const summary = this.bonusEngine.summarize(this.state.freeSpins);
    this.state.bonusSummary = summary;
    this.state.phase = "bonus-complete";
    this.view.addLog(`${featureLabel(summary.mode)} complete after ${summary.spinsPlayed} spins. Awarded ${summary.payout}.`);
    this.render();
    await this.view.wait(evaluationDelay * 2);
  }

  private async playSwordBonus(evaluationDelay: number, duringFreeSpins: boolean): Promise<void> {
    this.state.phase = "sword-bonus";
    this.view.addLog(duringFreeSpins
      ? "Sword Bonus triggered during free spins. JACKPOT! Free spins will resume."
      : "Sword Bonus triggered. JACKPOT!");
    if (!duringFreeSpins) {
      this.state.bonusSummary = { kind: "sword" };
    }
    this.render();
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

  private awardWin(amount: number): void {
    const credits = safeAdd(this.state.credits, amount, "Credit balance exceeds the safe integer range");
    const lastWin = safeAdd(this.state.lastWin, amount, "Round win exceeds the safe integer range");
    this.state.credits = credits;
    this.state.lastWin = lastWin;
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

  private adjustBet(change: number): void {
    if (this.state.phase !== "idle") {
      return;
    }
    this.state.bet = Math.min(
      GAME_CONFIG.maximumBet,
      Math.max(GAME_CONFIG.minimumBet, this.state.bet + change),
    );
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
