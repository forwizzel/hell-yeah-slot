import {
  BEER_CASH_AWARDS,
  CIGARETTE_CASH_AWARDS,
  GAME_CONFIG,
  getAdjacentBetCents,
  getFeatureBuyCostCents,
  type FeatureBuyId,
} from "../config/gameConfig";
import { PAYTABLE } from "../config/paytable";
import { REEL_STRIPS } from "../config/reelStrips";
import { BonusEngine } from "../math/BonusEngine";
import { CryptoRandomSource } from "../math/CryptoRandomSource";
import { evaluateWays } from "../math/PayEvaluator";
import type { RandomSource } from "../math/RandomSource";
import { ReelEngine } from "../math/ReelEngine";
import { safeAdd, safeMultiply } from "../math/safeInteger";
import { SwordEngine } from "../math/SwordEngine";
import type { GameView } from "../presentation/GameView";
import type { ControlActions, DevelopmentBonusId } from "../presentation/ControlPanel";
import { getLargeWinTier } from "../presentation/LargeWin";
import { formatUsd } from "./formatUsd";
import { GameState } from "./GameState";
import { createGuaranteedFeatureSymbols } from "./GuaranteedFeatureSymbols";
import type {
  BonusActivation,
  BonusSymbolId,
  BonusTrigger,
  AutoSpinViewState,
  GamePhase,
  SpinResult,
  SwordFeatureState,
} from "./types";

export class GameController {
  private readonly state = new GameState();
  private readonly random: RandomSource = new CryptoRandomSource();
  private readonly reelEngine = this.createReelEngine();
  private readonly bonusEngine = this.createBonusEngine();
  private readonly swordEngine = this.createSwordEngine();
  private autoSpinActive = false;
  private autoSpinStopping = false;
  private autoSpinRemaining = 0;
  private autoSpinStatus = "Ready.";

  constructor(private readonly view: GameView) {
    const actions: ControlActions = {
      spin: () => { void this.spin(); },
      setQuickSpinEnabled: (enabled) => this.view.setQuickSpinEnabled(enabled),
      decreaseBet: () => this.adjustBet(-1),
      increaseBet: () => this.adjustBet(1),
      toggleMusic: () => this.view.toggleMusic(),
      toggleSfx: () => this.view.toggleSfx(),
      reset: () => this.reset(),
      startAutoSpin: (betCents, spins) => this.startAutoSpin(betCents, spins),
      stopAutoSpin: () => this.stopAutoSpin(),
      buyFeature: (feature) => { void this.buyFeature(feature); },
    };
    if (import.meta.env.DEV) {
      actions.triggerDevelopmentBonus = (bonus) => { void this.triggerDevelopmentBonus(bonus); };
    }
    view.bindControls(actions);
  }

  initialize(): void {
    this.render();
    this.view.addLog("Game ready.");
  }

  private async spin(): Promise<void> {
    if (isActiveSpinPhase(this.state.phase)) {
      this.view.settleActiveSpin();
      return;
    }
    if (this.state.phase !== "idle" || this.state.balanceCents < this.state.betCents) {
      return;
    }

    const triggeringBetCents = this.state.betCents;

    try {
      this.state.balanceCents -= triggeringBetCents;
      this.state.lastWinCents = 0;
      this.state.winningPositions = [];
      this.state.winningWins = [];
      this.state.cashAwards = [];
      this.state.freeSpins = null;
      this.state.sword = null;
      this.state.largeWin = null;
      this.view.addLog(`Bet ${formatUsd(triggeringBetCents)} placed.`);

      // The complete paid-spin outcome, including any feature trigger, is fixed before animation.
      const result = this.createPaidSpinResult(triggeringBetCents);
      await this.playTriggeringSpin(
        result,
        triggeringBetCents,
        "Base spin started.",
      );
      if (this.autoSpinActive) {
        this.autoSpinRemaining -= 1;
        if (result.bonusTrigger.kind !== "none") {
          this.finishAutoSpin("Bonus triggered. Auto Spin stopped.");
        } else {
          this.render();
        }
      }
      await this.playResolvedFeature(
        result.bonusTrigger,
        triggeringBetCents,
      );

      this.state.freeSpins = null;
      this.state.phase = "idle";
      this.render();
    } catch (error: unknown) {
      this.handleGameError(error);
    }
  }

  private startAutoSpin(betCents: number, spins: number): void {
    if (this.state.phase !== "idle" || this.autoSpinActive) {
      return;
    }
    if (!GAME_CONFIG.betOptionsCents.some((option) => option === betCents)) {
      this.autoSpinStatus = "Select a valid bet.";
      this.render();
      return;
    }
    if (!Number.isSafeInteger(spins) || spins < 1 || spins > GAME_CONFIG.maximumAutoSpins) {
      this.autoSpinStatus = `Choose 1 to ${GAME_CONFIG.maximumAutoSpins.toLocaleString("en-US")} spins.`;
      this.render();
      return;
    }
    if (this.state.balanceCents < betCents) {
      this.autoSpinStatus = "Balance is too low for the selected bet.";
      this.render();
      return;
    }

    this.state.betCents = betCents;
    this.autoSpinActive = true;
    this.autoSpinStopping = false;
    this.autoSpinRemaining = spins;
    this.autoSpinStatus = "Running.";
    this.view.addLog(`Auto Spin started: ${spins} spins at ${formatUsd(betCents)}.`);
    this.render();
    void this.runAutoSpins();
  }

  private stopAutoSpin(): void {
    if (!this.autoSpinActive || this.autoSpinStopping) {
      return;
    }
    this.autoSpinStopping = true;
    this.autoSpinStatus = "Stopping after the current spin.";
    this.render();
  }

  private async runAutoSpins(): Promise<void> {
    while (this.autoSpinActive && !this.autoSpinStopping && this.autoSpinRemaining > 0) {
      if (this.state.balanceCents < this.state.betCents) {
        this.finishAutoSpin("Balance is too low. Auto Spin stopped.");
        return;
      }
      await this.spin();
    }

    if (!this.autoSpinActive) {
      return;
    }
    if (this.autoSpinStopping) {
      this.finishAutoSpin(`Stopped with ${this.autoSpinRemaining} spins remaining.`);
    } else {
      this.finishAutoSpin("Auto Spin complete.");
    }
  }

  private finishAutoSpin(status: string): void {
    const wasActive = this.autoSpinActive;
    this.autoSpinActive = false;
    this.autoSpinStopping = false;
    this.autoSpinStatus = status;
    if (wasActive) {
      this.view.addLog(status);
    }
    this.render();
  }

  private async triggerDevelopmentBonus(bonus: DevelopmentBonusId): Promise<void> {
    if (!import.meta.env.DEV || this.state.phase !== "idle") {
      return;
    }

    this.state.lastWinCents = 0;
    this.state.winningPositions = [];
    this.state.winningWins = [];
    this.state.cashAwards = [];
    this.state.freeSpins = null;
    this.state.sword = null;
    this.state.largeWin = null;
    this.view.addLog(`[DEV] Forced ${developmentBonusLabel(bonus)} at bet ${formatUsd(this.state.betCents)}; no wager charged.`);

    try {
      const result = this.createGuaranteedSpinResult(bonus, this.state.betCents);
      await this.playTriggeringSpin(
        result,
        this.state.betCents,
        `[DEV] ${developmentBonusLabel(bonus)} qualifying spin started.`,
      );
      await this.playResolvedFeature(result.bonusTrigger, this.state.betCents);

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

    this.state.balanceCents -= costCents;
    this.state.lastWinCents = 0;
    this.state.winningPositions = [];
    this.state.winningWins = [];
    this.state.cashAwards = [];
    this.state.freeSpins = null;
    this.state.sword = null;
    this.state.largeWin = null;
    this.view.addLog(`Feature buy: ${featureBuyLabel(feature)} for ${formatUsd(costCents)} at bet ${formatUsd(triggeringBetCents)}.`);

    try {
      const result = this.createGuaranteedSpinResult(feature, triggeringBetCents);
      await this.playTriggeringSpin(
        result,
        triggeringBetCents,
        `${featureBuyLabel(feature)} purchase spin started.`,
      );
      await this.playResolvedFeature(
        result.bonusTrigger,
        triggeringBetCents,
      );
      this.state.freeSpins = null;
      this.state.phase = "idle";
      this.render();
    } catch (error: unknown) {
      this.handleGameError(error);
    }
  }

  private async playResolvedFeature(
    trigger: BonusTrigger,
    triggeringBetCents: number,
  ): Promise<void> {
    this.disableTurboForFeature(trigger);
    if (trigger.kind === "sword") {
      await this.playSwordFeature(triggeringBetCents, false);
    } else if (trigger.kind === "free-spins") {
      await this.playFreeSpins(trigger, triggeringBetCents);
    }
  }

  private async playTriggeringSpin(
    result: SpinResult,
    triggeringBetCents: number,
    startLog: string,
  ): Promise<void> {
    this.state.winningPositions = [];
    this.state.winningWins = [];
    this.state.cashAwards = [];
    this.state.largeWin = null;
    this.state.phase = "base-spinning";
    this.view.addLog(startLog);
    this.render();
    this.view.playSound("spin");
    await this.view.animateBaseSpin(
      result.grid,
      this.view.isQuickSpinEnabled(),
      triggerWinSymbols(result.bonusTrigger),
    );
    if (isCombinedTrigger(result.bonusTrigger)) {
      this.view.playSound("win-combination");
    }

    this.state.grid = result.grid;
    this.state.phase = "base-evaluation";
    this.state.winningPositions = result.winningPositions;
    this.state.winningWins = result.winningWins;
    this.state.cashAwards = [];
    const awardedCents = this.awardWin(result.regularWinCents, triggeringBetCents);
    this.view.addLog(awardedCents > 0 ? `Base win: ${formatUsd(awardedCents)}.` : "No base win.");
    this.render();
    const timing = this.getSpinTiming();
    await this.view.wait(timing.evaluationDelay);
    await this.playLargeWin(awardedCents, triggeringBetCents, timing.quickSpin);
  }

  private getSpinTiming(): { readonly quickSpin: boolean; readonly evaluationDelay: number } {
    const quickSpin = this.view.isQuickSpinEnabled();
    return {
      quickSpin,
      evaluationDelay: quickSpin ? GAME_CONFIG.quickEvaluationDelayMs : GAME_CONFIG.normalEvaluationDelayMs,
    };
  }

  private disableTurboForFeature(trigger: BonusTrigger): void {
    if (trigger.kind !== "none") {
      this.view.setQuickSpinEnabled(false);
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
      winningWins: evaluation.wins,
    };
  }

  private createGuaranteedSpinResult(feature: FeatureBuyId, betCents: number): SpinResult {
    const symbols = createGuaranteedFeatureSymbols(feature, this.random);
    const grid = this.reelEngine.spinWithGuaranteedBonusSymbols(symbols);
    const evaluation = evaluateWays(grid, PAYTABLE, betCents);
    return {
      grid,
      regularWinCents: evaluation.totalWinCents,
      bonusTrigger: this.bonusEngine.resolveBaseTrigger(grid),
      winningPositions: evaluation.winningPositions,
      winningWins: evaluation.wins,
    };
  }

  private async playFreeSpins(
    trigger: Extract<BonusTrigger, { kind: "free-spins" }>,
    triggeringBetCents: number,
  ): Promise<void> {
    this.view.setQuickSpinEnabled(false);
    this.state.winningPositions = [];
    this.state.winningWins = [];
    this.state.largeWin = null;
    this.state.freeSpins = this.bonusEngine.startFreeSpins(
      trigger,
      triggeringBetCents,
      this.remainingRoundWinCents(triggeringBetCents),
    );
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
    const introTiming = this.getSpinTiming();
    await this.view.playBonusIntroReveal(this.state.freeSpins, introTiming.evaluationDelay * 2);
    let awardedFeatureCents = 0;

    while (this.state.freeSpins.remainingSpins > 0) {
      const previousState = this.state.freeSpins;
      this.state.phase = "free-spin-spinning";
      this.state.winningPositions = [];
      this.state.winningWins = [];
      this.state.cashAwards = [];
      this.render();

      // Free-spin payout and all retrigger effects are fixed before animation.
      const grid = this.reelEngine.spin();
      const evaluation = evaluateWays(grid, PAYTABLE, previousState.triggeringBetCents);
      const result = this.bonusEngine.applyFreeSpin(previousState, grid, evaluation.totalWinCents);
      this.view.playSound("spin");
      await this.view.animateBaseSpin(
        grid,
        this.view.isQuickSpinEnabled(),
        freeSpinWinSymbols(result),
        result.cashAwards,
        cashAwardSymbols(previousState.mode),
        previousState.triggeringBetCents,
      );

      this.state.grid = grid;
      this.state.winningPositions = evaluation.winningPositions;
      this.state.winningWins = evaluation.wins;
      this.state.cashAwards = [...result.cashAwards];
      this.state.freeSpins = result.state;
      this.state.phase = "free-spin-evaluation";
      const awardedCents = this.awardWin(result.spinWinCents, triggeringBetCents);
      awardedFeatureCents = safeAdd(awardedFeatureCents, awardedCents, "Awarded free-spin total exceeds the safe integer range");
      const spinNumber = result.state.totalSpinsPlayed;
      if (awardedCents > 0) {
        this.view.addLog(
          `Free spin ${spinNumber}: ways ${formatUsd(evaluation.totalWinCents)} x${previousState.multiplier} = ${formatUsd(result.waysWinCents)}; cash symbols ${formatUsd(result.cashAwardWinCents)}; awarded ${formatUsd(awardedCents)}.`,
        );
      } else {
        this.view.addLog(`Free spin ${spinNumber}: no ways win.`);
      }
      if (result.beerRetriggered && result.cigaretteRetriggered) {
        this.view.addLog(`Beer + Cigarette retrigger: ${result.addedSpins} spins added.`);
      } else if (result.beerRetriggered) {
        this.view.addLog(`Beer retrigger: ${result.addedSpins} spins added.`);
      } else if (result.cigaretteRetriggered) {
        this.view.addLog(`Cigarette retrigger: ${result.addedSpins} spins added.`);
      }
      this.render();
      const evaluationTiming = this.getSpinTiming();
      await Promise.all([
        this.view.wait(evaluationTiming.evaluationDelay),
        this.view.playFreeSpinRetriggerCounter(
          previousState.remainingSpins - 1,
          result.addedSpins,
          result.state,
          evaluationTiming.evaluationDelay,
        ),
      ]);

      if (result.swordTriggered) {
        const swordAwardedCents = await this.playSwordFeature(previousState.triggeringBetCents, true);
        this.state.freeSpins = {
          ...this.state.freeSpins,
          maximumWinCents: Math.max(
            this.state.freeSpins.accumulatedWinCents,
            this.state.freeSpins.maximumWinCents - swordAwardedCents,
          ),
        };
      }
    }

    this.state.winningPositions = [];
    this.state.winningWins = [];
    const summary = this.bonusEngine.summarize(this.state.freeSpins);
    this.view.addLog(
      `${featureLabel(summary.mode)} complete after ${summary.spinsPlayed} spins. Awarded ${formatUsd(awardedFeatureCents)}.`,
    );
    await this.playLargeWin(
      awardedFeatureCents,
      triggeringBetCents,
      this.getSpinTiming().quickSpin,
    );
  }

  private async playSwordFeature(
    triggeringBetCents: number,
    duringFreeSpins: boolean,
  ): Promise<number> {
    this.view.setQuickSpinEnabled(false);
    this.state.sword = this.swordEngine.start(
      triggeringBetCents,
      this.remainingRoundWinCents(triggeringBetCents),
    );
    this.state.winningPositions = [];
    this.state.winningWins = [];
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
    const introTiming = this.getSpinTiming();
    await this.view.wait(introTiming.evaluationDelay * 2);

    while (this.state.sword.remainingSpins > 0) {
      const previousSwordState: SwordFeatureState = this.state.sword;
      const result = this.swordEngine.playSpin(previousSwordState);
      this.state.phase = "sword-spinning";
      this.state.winningPositions = [];
      this.state.winningWins = [];
      this.render();
      await this.view.animateSwordSpin(
        result.spinBoard,
        previousSwordState.rows,
        this.view.isQuickSpinEnabled(),
        result.expansion?.position ?? null,
      );

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
      this.state.winningWins = result.winningWins;
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
      const evaluationTiming = this.getSpinTiming();
      await this.view.wait(evaluationTiming.evaluationDelay);

      if (result.expansion !== null) {
        this.state.sword = result.state;
        this.state.winningPositions = [];
        this.state.winningWins = [];
        this.render();
        await this.view.wait(evaluationTiming.evaluationDelay);
        const multiplierRevealDuration = evaluationTiming.quickSpin
          ? GAME_CONFIG.quickMultiplierRevealDurationMs
          : GAME_CONFIG.normalMultiplierRevealDurationMs;
        await this.view.playSwordExpansionReveal(result.expansion, multiplierRevealDuration);
      }

      if (result.finalStrikeMultiplier !== null && result.finalPayoutCents !== null) {
        this.state.phase = "sword-final-strike";
        this.view.addLog(`Final Strike x${result.finalStrikeMultiplier}: ${formatUsd(result.finalPayoutCents)} total Sword payout.`);
        this.render();
        await this.view.wait(evaluationTiming.evaluationDelay * 2);
      }
    }

    this.state.winningPositions = [];
    this.state.winningWins = [];
    const summary = this.swordEngine.summarize(this.state.sword);
    const awardedCents = this.awardWin(summary.payoutCents, triggeringBetCents);
    this.view.addLog(`Sword Cleave complete after ${summary.spinsPlayed} spins. Awarded ${formatUsd(awardedCents)}.`);
    await this.playLargeWin(
      awardedCents,
      triggeringBetCents,
      this.getSpinTiming().quickSpin,
    );
    this.state.sword = null;
    return awardedCents;
  }

  private logTrigger(activation: BonusActivation | null): void {
    if (activation === null) {
      return;
    }
    const mode = activation.symbol === "BEER" ? "beer" : "cigarette";
    this.view.addLog(`${featureLabel(mode)} triggered with ${activation.symbolCount} symbols.`);
  }

  private awardWin(amountCents: number, triggeringBetCents: number): number {
    const awardedCents = Math.min(amountCents, this.remainingRoundWinCents(triggeringBetCents));
    const balanceCents = safeAdd(
      this.state.balanceCents,
      awardedCents,
      "Balance exceeds the safe integer range",
    );
    const lastWinCents = safeAdd(
      this.state.lastWinCents,
      awardedCents,
      "Round win exceeds the safe integer range",
    );
    this.state.balanceCents = balanceCents;
    this.state.lastWinCents = lastWinCents;
    return awardedCents;
  }

  private remainingRoundWinCents(triggeringBetCents: number): number {
    const maximumWinCents = safeMultiply(
      triggeringBetCents,
      GAME_CONFIG.maximumPaidRoundWinMultiplier,
      "Maximum paid-round win exceeds the safe integer range",
    );
    return maximumWinCents - this.state.lastWinCents;
  }

  private async playLargeWin(
    payoutCents: number,
    triggeringBetCents: number,
    quickSpin: boolean,
  ): Promise<void> {
    if (getLargeWinTier(payoutCents, triggeringBetCents) === null) {
      return;
    }

    const autoDismiss = this.autoSpinActive && this.state.phase === "base-evaluation";
    this.state.largeWin = { payoutCents, triggeringBetCents };
    this.state.phase = "large-win";
    this.render();
    await this.view.playLargeWinCount(
      payoutCents,
      quickSpin ? GAME_CONFIG.quickLargeWinDurationMs : GAME_CONFIG.normalLargeWinDurationMs,
      autoDismiss,
    );
    this.state.largeWin = null;
  }

  private handleGameError(error: unknown): void {
    const message = error instanceof Error ? error.message : "Unknown game error";
    this.view.addLog(`Game error: ${message}`);
    this.state.freeSpins = null;
    this.state.sword = null;
    this.state.largeWin = null;
    this.state.phase = "idle";
    if (this.autoSpinActive) {
      this.finishAutoSpin("Game error. Auto Spin stopped.");
      return;
    }
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
    this.autoSpinActive = false;
    this.autoSpinStopping = false;
    this.autoSpinRemaining = 0;
    this.autoSpinStatus = "Ready.";
    this.view.clearLog();
    this.view.addLog("Game reset.");
    this.render();
  }

  private createReelEngine(): ReelEngine {
    return new ReelEngine(REEL_STRIPS, this.random, GAME_CONFIG.rows);
  }

  private createBonusEngine(): BonusEngine {
    return new BonusEngine(
      this.random,
      GAME_CONFIG.beerFreeSpins,
      GAME_CONFIG.cigaretteFreeSpins,
      GAME_CONFIG.beerRetriggerSpins,
      GAME_CONFIG.cigaretteRetriggerSpins,
      GAME_CONFIG.beerFreeSpinMultiplier,
      GAME_CONFIG.maximumPaidRoundWinMultiplier,
      CIGARETTE_CASH_AWARDS,
      BEER_CASH_AWARDS,
    );
  }

  private createSwordEngine(): SwordEngine {
    return new SwordEngine(this.random);
  }

  private render(): void {
    const autoSpin: AutoSpinViewState = {
      active: this.autoSpinActive,
      stopping: this.autoSpinStopping,
      remainingSpins: this.autoSpinRemaining,
      status: this.autoSpinStatus,
    };
    this.view.render(this.state.toViewModel(), autoSpin);
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

function triggerWinSymbols(trigger: BonusTrigger): ReadonlyArray<BonusSymbolId> {
  if (trigger.kind === "sword") {
    return ["SWORD"];
  }
  if (trigger.kind !== "free-spins" || trigger.mode === "combined") {
    return [];
  }
  return [trigger.mode === "beer" ? "BEER" : "CIGARETTE"];
}

function isCombinedTrigger(trigger: BonusTrigger): boolean {
  return trigger.kind === "free-spins" && trigger.mode === "combined";
}

function freeSpinWinSymbols(result: ReturnType<BonusEngine["applyFreeSpin"]>): ReadonlyArray<BonusSymbolId> {
  if (result.swordTriggered) {
    return ["SWORD"];
  }
  const symbols: BonusSymbolId[] = [];
  if (result.beerRetriggered) {
    symbols.push("BEER");
  }
  if (result.cigaretteRetriggered) {
    symbols.push("CIGARETTE");
  }
  return symbols;
}

function cashAwardSymbols(mode: "beer" | "cigarette" | "combined"): ReadonlyArray<"BEER" | "CIGARETTE"> {
  if (mode === "cigarette") {
    return ["CIGARETTE"];
  }
  if (mode === "combined") {
    return ["BEER", "CIGARETTE"];
  }
  return [];
}

function isActiveSpinPhase(phase: GamePhase): boolean {
  return phase === "base-spinning" || phase === "free-spin-spinning" || phase === "sword-spinning";
}
