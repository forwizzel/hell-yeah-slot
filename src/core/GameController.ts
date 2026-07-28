import { GAME_CONFIG, getAdjacentBetCents, getFeatureBuyCostCents, type FeatureBuyId } from "../config/gameConfig";
import { PAYTABLE } from "../config/paytable";
import { REEL_STRIPS } from "../config/reelStrips";
import { BonusEngine } from "../math/BonusEngine";
import { CryptoRandomSource } from "../math/CryptoRandomSource";
import { evaluateWays } from "../math/PayEvaluator";
import type { RandomSource } from "../math/RandomSource";
import { ReelEngine } from "../math/ReelEngine";
import { safeAdd } from "../math/safeInteger";
import { SeededRandomSource } from "../math/SeededRandomSource";
import { SwordEngine } from "../math/SwordEngine";
import { bonusLandingSoundGroups } from "../presentation/BonusLandingSoundGroups";
import type { GameView } from "../presentation/GameView";
import type { DevelopmentBonusId } from "../presentation/ControlPanel";
import { getLargeWinTier } from "../presentation/LargeWin";
import { formatUsd } from "./formatUsd";
import { GameState } from "./GameState";
import type {
  BonusActivation,
  BonusSymbolId,
  BonusTrigger,
  SpinResult,
  SwordFeatureState,
} from "./types";

export class GameController {
  private readonly state = new GameState();
  private activeSeed: string | null = null;
  private random: RandomSource = new CryptoRandomSource();
  private reelEngine = this.createReelEngine();
  private bonusEngine = this.createBonusEngine();
  private swordEngine = this.createSwordEngine();

  constructor(private readonly view: GameView) {
    view.bindControls({
      spin: () => { void this.spin(); },
      decreaseBet: () => this.adjustBet(-1),
      increaseBet: () => this.adjustBet(1),
      toggleSound: () => this.view.toggleSound(),
      reset: () => this.reset(),
      applySeed: (seed) => this.applySeed(seed),
      clearSeed: () => this.clearSeed(),
      buyFeature: (feature) => { void this.buyFeature(feature); },
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
      this.state.sword = null;
      this.state.bonusSummary = null;
      this.state.largeWin = null;
      this.view.addLog(`Bet ${formatUsd(triggeringBetCents)} placed.`);

      // The complete paid-spin outcome, including chance triggers, is fixed before animation.
      const result = this.createPaidSpinResult(triggeringBetCents);
      await this.playTriggeringSpin(
        result,
        triggeringBetCents,
        spinDuration,
        evaluationDelay,
        quickSpin,
        "Base spin started.",
      );
      await this.playResolvedFeature(
        result.bonusTrigger,
        triggeringBetCents,
        spinDuration,
        evaluationDelay,
        hasNaturalTriggerSound(result.bonusTrigger),
      );

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
    this.state.sword = null;
    this.state.bonusSummary = null;
    this.state.largeWin = null;
    this.view.addLog(`[DEV] Forced ${developmentBonusLabel(bonus)} at bet ${formatUsd(this.state.betCents)}; no wager charged.`);

    try {
      await this.playDirectFeature(bonus, this.state.betCents, spinDuration, evaluationDelay);

      this.state.freeSpins = null;
      this.state.phase = "idle";
      this.render();
    } catch (error: unknown) {
      this.handleGameError(error);
    }
  }

  private async buyFeature(feature: FeatureBuyId): Promise<void> {
    if (this.state.phase !== "idle") {
      return;
    }

    const triggeringBetCents = this.state.betCents;
    const costCents = getFeatureBuyCostCents(feature, triggeringBetCents);
    if (this.state.balanceCents < costCents) {
      return;
    }

    const quickSpin = this.view.isQuickSpinEnabled();
    const spinDuration = quickSpin ? GAME_CONFIG.quickSpinDurationMs : GAME_CONFIG.normalSpinDurationMs;
    const evaluationDelay = quickSpin ? GAME_CONFIG.quickEvaluationDelayMs : GAME_CONFIG.normalEvaluationDelayMs;
    this.state.balanceCents -= costCents;
    this.state.lastWinCents = 0;
    this.state.winningPositions = [];
    this.state.freeSpins = null;
    this.state.sword = null;
    this.state.bonusSummary = null;
    this.state.largeWin = null;
    this.view.addLog(`Feature buy: ${featureBuyLabel(feature)} for ${formatUsd(costCents)} at bet ${formatUsd(triggeringBetCents)}.`);

    try {
      const result = this.createPurchasedSpinResult(feature, triggeringBetCents);
      await this.playTriggeringSpin(
        result,
        triggeringBetCents,
        spinDuration,
        evaluationDelay,
        quickSpin,
        `${featureBuyLabel(feature)} purchase spin started.`,
      );
      await this.playResolvedFeature(
        result.bonusTrigger,
        triggeringBetCents,
        spinDuration,
        evaluationDelay,
        true,
      );
      this.state.freeSpins = null;
      this.state.phase = "idle";
      this.render();
    } catch (error: unknown) {
      this.handleGameError(error);
    }
  }

  private async playDirectFeature(
    feature: FeatureBuyId,
    triggeringBetCents: number,
    spinDuration: number,
    evaluationDelay: number,
  ): Promise<void> {
    if (feature === "sword") {
      await this.playSwordFeature(triggeringBetCents, false, false, spinDuration, evaluationDelay);
      return;
    }

    const includesCigarette = feature === "cigarette" || feature === "combined";
    const trigger: Extract<BonusTrigger, { kind: "free-spins" }> = {
      kind: "free-spins",
      mode: feature,
      startingSpins: feature === "cigarette" ? GAME_CONFIG.cigaretteFreeSpins : GAME_CONFIG.beerFreeSpins,
      multiplier: includesCigarette ? this.pickFeatureMultiplier() : 1,
      beer: null,
      cigarette: null,
    };
    await this.playFreeSpins(trigger, triggeringBetCents, spinDuration, evaluationDelay, false);
  }

  private async playResolvedFeature(
    trigger: BonusTrigger,
    triggeringBetCents: number,
    spinDuration: number,
    evaluationDelay: number,
    playWinnerSound: boolean,
  ): Promise<void> {
    if (trigger.kind === "sword") {
      await this.playSwordFeature(
        triggeringBetCents,
        false,
        playWinnerSound,
        spinDuration,
        evaluationDelay,
      );
    } else if (trigger.kind === "free-spins") {
      await this.playFreeSpins(
        trigger,
        triggeringBetCents,
        spinDuration,
        evaluationDelay,
        playWinnerSound,
      );
    }
  }

  private async playTriggeringSpin(
    result: SpinResult,
    triggeringBetCents: number,
    spinDuration: number,
    evaluationDelay: number,
    quickSpin: boolean,
    startLog: string,
  ): Promise<void> {
    const bonusSoundGroups = bonusLandingSoundGroups(result.grid);
    this.state.winningPositions = [];
    this.state.bonusSummary = null;
    this.state.largeWin = null;
    this.state.phase = "base-spinning";
    this.view.addLog(startLog);
    this.render();
    this.view.playSound("spin");
    await this.view.animateBaseSpin(result.grid, spinDuration, bonusSoundGroups);

    this.state.grid = result.grid;
    this.state.phase = "base-evaluation";
    this.state.winningPositions = result.winningPositions;
    this.awardWin(result.regularWinCents);
    this.view.addLog(result.regularWinCents > 0 ? `Base win: ${formatUsd(result.regularWinCents)}.` : "No base win.");
    this.render();
    await this.view.wait(evaluationDelay);
    await this.playLargeWin(result.regularWinCents, triggeringBetCents, "base-evaluation", quickSpin);
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

  private createPurchasedSpinResult(feature: FeatureBuyId, betCents: number): SpinResult {
    const symbols: ReadonlyArray<BonusSymbolId> = feature === "combined"
      ? ["BEER", "BEER", "BEER", "CIGARETTE", "CIGARETTE", "CIGARETTE"]
      : feature === "sword"
        ? ["SWORD", "SWORD", "SWORD"]
        : feature === "beer"
          ? ["BEER", "BEER", "BEER"]
          : ["CIGARETTE", "CIGARETTE", "CIGARETTE"];
    const grid = this.reelEngine.spinWithGuaranteedBonusSymbols(symbols);
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
    this.state.bonusSummary = null;
    this.state.largeWin = null;
    this.state.freeSpins = this.bonusEngine.startFreeSpins(trigger, triggeringBetCents);
    this.logTrigger(trigger.beer);
    this.logTrigger(trigger.cigarette);
    this.view.addLog(
      `${featureLabel(trigger.mode)} started with ${trigger.startingSpins} free spins at x${this.state.freeSpins.multiplier}.`,
    );
    const featureStart = this.view.waitForFeatureStart();
    this.state.phase = "bonus-start";
    this.render();
    await featureStart;
    this.state.phase = "bonus-intro";
    this.render();
    if (playWinnerSound) {
      this.view.playSound("symbol-winner");
    }
    const multiplierRevealDuration = trigger.mode === "beer"
      ? evaluationDelay * 2
      : spinDuration <= GAME_CONFIG.quickSpinDurationMs
        ? GAME_CONFIG.quickMultiplierRevealDurationMs
        : GAME_CONFIG.normalMultiplierRevealDurationMs;
    await this.view.playBonusIntroReveal(this.state.freeSpins, multiplierRevealDuration);

    while (this.state.freeSpins.remainingSpins > 0) {
      const previousState = this.state.freeSpins;
      this.state.phase = "free-spin-spinning";
      this.state.winningPositions = [];
      this.render();

      // Free-spin payout and all retrigger effects are fixed before animation.
      const grid = this.reelEngine.spin();
      const evaluation = evaluateWays(grid, PAYTABLE, previousState.triggeringBetCents);
      const result = this.bonusEngine.applyFreeSpin(previousState, grid, evaluation.totalWinCents);
      const bonusSoundGroups = bonusLandingSoundGroups(grid);
      this.view.playSound("spin");
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
        await this.playSwordFeature(
          previousState.triggeringBetCents,
          true,
          true,
          spinDuration,
          evaluationDelay,
        );
      }
    }

    this.state.winningPositions = [];
    const summary = this.bonusEngine.summarize(this.state.freeSpins);
    this.state.bonusSummary = summary;
    this.state.phase = "bonus-complete";
    this.view.addLog(
      `${featureLabel(summary.mode)} complete after ${summary.spinsPlayed} spins. Awarded ${formatUsd(summary.payoutCents)}.`,
    );
    this.render();
    await this.view.wait(evaluationDelay * 2);
    await this.playLargeWin(
      summary.payoutCents,
      triggeringBetCents,
      "bonus-complete",
      spinDuration <= GAME_CONFIG.quickSpinDurationMs,
    );
  }

  private async playSwordFeature(
    triggeringBetCents: number,
    duringFreeSpins: boolean,
    playWinnerSound: boolean,
    spinDuration: number,
    evaluationDelay: number,
  ): Promise<void> {
    this.state.sword = this.swordEngine.start(triggeringBetCents);
    this.state.winningPositions = [];
    this.state.bonusSummary = null;
    this.state.largeWin = null;
    this.view.addLog(duringFreeSpins
      ? "Sword Cleave triggered during free spins. Free spins will resume after the feature."
      : "Sword Cleave triggered.");
    const featureStart = this.view.waitForFeatureStart();
    this.state.phase = "bonus-start";
    this.render();
    await featureStart;
    this.state.phase = "sword-intro";
    this.render();
    if (playWinnerSound) {
      this.view.playSound("symbol-winner");
    }
    await this.view.wait(evaluationDelay * 2);

    while (this.state.sword.remainingSpins > 0) {
      const previousSwordState: SwordFeatureState = this.state.sword;
      const result = this.swordEngine.playSpin(previousSwordState);
      this.state.phase = "sword-spinning";
      this.state.winningPositions = [];
      this.render();
      await this.view.animateSwordSpin(result.spinBoard, spinDuration, result.expansion?.position ?? null);

      // Keep the evaluated board visible before an expansion replaces it with the taller next-spin board.
      this.state.sword = result.expansion === null
        ? result.state
        : {
            ...result.state,
            rows: previousSwordState.rows,
            activeMultiplier: previousSwordState.activeMultiplier,
            board: result.spinBoard,
          };
      this.state.winningPositions = result.winningPositions;
      this.state.phase = "sword-evaluation";
      this.view.addLog(
        `Sword spin ${result.state.totalSpinsPlayed}: ${formatUsd(result.baseWinCents)} x${previousSwordState.activeMultiplier} = ${formatUsd(result.spinWinCents)}.`,
      );
      if (result.expansion !== null) {
        this.view.addLog(
          `Sword cleave: board expands to 5x${result.expansion.destinationRows}; x${result.expansion.destinationMultiplier} is active next spin.`,
        );
      }
      this.render();
      await this.view.wait(evaluationDelay);

      if (result.expansion !== null) {
        this.state.sword = result.state;
        this.state.winningPositions = [];
        this.render();
        await this.view.wait(evaluationDelay);
        const multiplierRevealDuration = spinDuration <= GAME_CONFIG.quickSpinDurationMs
          ? GAME_CONFIG.quickMultiplierRevealDurationMs
          : GAME_CONFIG.normalMultiplierRevealDurationMs;
        await this.view.playSwordExpansionReveal(result.expansion, multiplierRevealDuration);
      }

      if (result.finalStrikeMultiplier !== null && result.finalPayoutCents !== null) {
        this.state.phase = "sword-final-strike";
        this.view.addLog(`Final Strike x${result.finalStrikeMultiplier}: ${formatUsd(result.finalPayoutCents)} total Sword payout.`);
        this.render();
        await this.view.wait(evaluationDelay * 2);
      }
    }

    this.state.winningPositions = [];
    const summary = this.swordEngine.summarize(this.state.sword);
    this.awardWin(summary.payoutCents);
    if (!duringFreeSpins) {
      this.state.bonusSummary = summary;
    }
    this.state.phase = "sword-complete";
    this.view.addLog(`Sword Cleave complete after ${summary.spinsPlayed} spins. Awarded ${formatUsd(summary.payoutCents)}.`);
    this.render();
    await this.view.wait(evaluationDelay * 2);
    await this.playLargeWin(
      summary.payoutCents,
      triggeringBetCents,
      "sword-complete",
      spinDuration <= GAME_CONFIG.quickSpinDurationMs,
    );
    this.state.sword = null;
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

  private async playLargeWin(
    payoutCents: number,
    triggeringBetCents: number,
    resumePhase: "base-evaluation" | "bonus-complete" | "sword-complete",
    quickSpin: boolean,
  ): Promise<void> {
    if (getLargeWinTier(payoutCents, triggeringBetCents) === null) {
      return;
    }

    this.state.largeWin = { payoutCents, triggeringBetCents };
    this.state.phase = "large-win";
    this.render();
    await this.view.playLargeWinCount(
      payoutCents,
      quickSpin ? GAME_CONFIG.quickLargeWinDurationMs : GAME_CONFIG.normalLargeWinDurationMs,
    );
    this.state.largeWin = null;
    this.state.phase = resumePhase;
    this.render();
  }

  private pickFeatureMultiplier(): number {
    const minimum = GAME_CONFIG.cigaretteMultiplierMinimum;
    const maximum = GAME_CONFIG.cigaretteMultiplierMaximum;
    return this.random.nextInt(maximum - minimum + 1) + minimum;
  }

  private handleGameError(error: unknown): void {
    const message = error instanceof Error ? error.message : "Unknown game error";
    this.view.addLog(`Game error: ${message}`);
    this.state.freeSpins = null;
    this.state.sword = null;
    this.state.largeWin = null;
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
    this.swordEngine = this.createSwordEngine();
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
      GAME_CONFIG.freeSpinBaseMultiplier,
      GAME_CONFIG.cigaretteMultiplierMinimum,
      GAME_CONFIG.cigaretteMultiplierMaximum,
    );
  }

  private createSwordEngine(): SwordEngine {
    return new SwordEngine(this.random);
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

function featureBuyLabel(feature: FeatureBuyId): string {
  return feature === "sword" ? "Sword" : featureLabel(feature);
}

function hasNaturalTriggerSound(trigger: BonusTrigger): boolean {
  if (trigger.kind === "sword") {
    return true;
  }
  if (trigger.kind === "none") {
    return false;
  }

  return trigger.beer?.source === "natural" || trigger.cigarette?.source === "natural";
}
