import { BONUS_VALUE_WEIGHTS, GAME_CONFIG } from "../config/gameConfig";
import { PAYTABLE } from "../config/paytable";
import { REEL_STRIPS } from "../config/reelStrips";
import { BonusEngine } from "../math/BonusEngine";
import { CryptoRandomSource } from "../math/CryptoRandomSource";
import { evaluateWays } from "../math/PayEvaluator";
import type { RandomSource } from "../math/RandomSource";
import { ReelEngine } from "../math/ReelEngine";
import { SeededRandomSource } from "../math/SeededRandomSource";
import type { GameView } from "../presentation/GameView";
import { GameState } from "./GameState";
import type { SpinResult } from "./types";

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
      this.state.bonusSummary = null;
      this.state.phase = "base-spinning";
      this.view.addLog(`Bet ${triggeringBet} placed.`);
      this.view.addLog("Base spin started.");
      this.render();

      // The complete outcome exists before its first animation frame.
      const grid = this.reelEngine.spin();
      const evaluation = evaluateWays(grid, PAYTABLE, triggeringBet);
      const triggerPositions = this.bonusEngine.findTriggerPositions(grid);
      const result: SpinResult = {
        grid,
        regularWin: evaluation.totalWin,
        bonusTriggered: triggerPositions.length >= 3,
        triggerPositions,
        winningPositions: evaluation.winningPositions,
      };

      await this.view.animateBaseSpin(result.grid, spinDuration);
      this.state.grid = result.grid;
      this.state.phase = "base-evaluation";
      this.state.winningPositions = result.winningPositions;
      if (result.regularWin > 0) {
        this.state.credits += result.regularWin;
        this.state.lastWin = result.regularWin;
        this.view.addLog(`Regular win: ${result.regularWin}.`);
      } else {
        this.view.addLog("No regular win.");
      }
      this.render();
      await this.view.wait(evaluationDelay);

      if (result.bonusTriggered) {
        await this.playBonus(result, triggeringBet, spinDuration, evaluationDelay);
      }

      this.state.bonus = null;
      this.state.phase = "idle";
      this.render();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown game error";
      this.view.addLog(`Game error: ${message}`);
      this.state.bonus = null;
      this.state.phase = "idle";
      this.render();
    }
  }

  private async playBonus(
    result: SpinResult,
    triggeringBet: number,
    animationDuration: number,
    evaluationDelay: number,
  ): Promise<void> {
    this.state.winningPositions = [];
    this.state.bonus = this.bonusEngine.start(result.grid, triggeringBet);
    this.state.phase = "bonus-intro";
    this.view.addLog(`Bonus triggered with ${result.triggerPositions.length} symbols.`);
    this.render();
    await this.view.animateBonusIntro(this.state.bonus, evaluationDelay);

    let complete = this.bonusEngine.isComplete(this.state.bonus);
    let filled = this.state.bonus.cells.every((cell) => cell !== null);
    while (!complete) {
      const previousState = this.state.bonus;
      if (previousState === null) {
        throw new Error("Bonus state is missing during a respin");
      }

      this.state.phase = "bonus-respin";
      this.render();
      const respinResult = this.bonusEngine.respin(previousState);
      await this.view.animateBonusRespin(previousState, respinResult, animationDuration);
      this.state.bonus = respinResult.state;
      this.state.phase = "bonus-evaluation";
      complete = respinResult.complete;
      filled = respinResult.filled;

      if (respinResult.newPositions.length > 0) {
        this.view.addLog(`Bonus respin landed ${respinResult.newPositions.length} new symbols.`);
        if (!filled) {
          this.view.addLog(`Respins reset to ${respinResult.state.remainingRespins}.`);
        }
      } else {
        this.view.addLog(`No new symbols. ${respinResult.state.remainingRespins} respins remaining.`);
      }
      this.render();
      await this.view.wait(evaluationDelay);
    }

    const finalState = this.state.bonus;
    if (finalState === null) {
      throw new Error("Bonus state is missing at completion");
    }
    const summary = this.bonusEngine.summarize(finalState);
    this.state.bonusSummary = { ...summary, filled };
    this.state.credits += summary.payout;
    this.state.lastWin += summary.payout;
    this.state.phase = "bonus-complete";
    this.view.addLog(`Bonus complete. Awarded ${summary.payout} credits.`);
    this.render();
    await this.view.wait(evaluationDelay * 2);
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
    return new ReelEngine(REEL_STRIPS, BONUS_VALUE_WEIGHTS, this.random, GAME_CONFIG.rows);
  }

  private createBonusEngine(): BonusEngine {
    return new BonusEngine(
      this.random,
      BONUS_VALUE_WEIGHTS,
      GAME_CONFIG.bonusLandingProbability,
      GAME_CONFIG.rows,
      GAME_CONFIG.columns,
      GAME_CONFIG.bonusStartingRespins,
    );
  }

  private render(): void {
    this.view.render(this.state.toViewModel(), this.activeSeed);
  }
}
