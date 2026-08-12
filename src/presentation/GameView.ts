import { GAME_CONFIG } from "../config/gameConfig";
import { SWORD_CONFIG, type SwordStageRows } from "../config/swordConfig";
import { formatCompactUsd, formatUsd } from "../core/formatUsd";
import type { AutoSpinViewState, BonusSummary, BonusSymbolId, CashAwardSymbolId, FreeSpinCashAward, FreeSpinMode, FreeSpinState, GameViewModel, Grid, Position, SwordExpansion, WaysGrid } from "../core/types";
import { createBonusLandingAudioPlan, swordColumnAudioEffect } from "./BonusLandingAudio";
import { ControlPanel, type ControlActions } from "./ControlPanel";
import { createBandMultiplierRollValues } from "./BonusMultiplierReveal";
import { EventLogView } from "./EventLogView";
import { GameAudio, type GameSoundEffect } from "./GameAudio";
import { formatLargeWinMultiplier, getLargeWinTier } from "./LargeWin";
import { setFittedNumericText } from "./FittedText";
import { ReelGridView } from "./ReelGridView";
import { SwordBoardView } from "./SwordBoardView";

export class GameView {
  private readonly controls = new ControlPanel();
  private readonly audio = new GameAudio();
  private readonly log = new EventLogView(requiredElement<HTMLOListElement>("event-log"), GAME_CONFIG.recentEventLimit);
  private readonly gamePanel = requiredElement<HTMLElement>("game-panel");
  private readonly bonusMetrics = requiredElement<HTMLElement>("bonus-metrics");
  private readonly bonusSpins = requiredElement<HTMLElement>("bonus-spins");
  private readonly bonusMultiplierLabel = requiredElement<HTMLElement>("bonus-multiplier-label");
  private readonly bonusMultiplier = requiredElement<HTMLElement>("bonus-multiplier");
  private readonly bonusBank = requiredElement<HTMLElement>("bonus-bank");
  private readonly bonusRetrigger = requiredElement<HTMLElement>("bonus-retrigger");
  private readonly swordMetrics = requiredElement<HTMLElement>("sword-metrics");
  private readonly swordBank = requiredElement<HTMLElement>("sword-bank");
  private readonly swordCuts = requiredElement<HTMLElement>("sword-cuts");
  private readonly swordBoardSize = requiredElement<HTMLElement>("sword-board-size");
  private readonly swordMultiplier = requiredElement<HTMLElement>("sword-multiplier");
  private readonly featureOverlay = requiredElement<HTMLElement>("feature-overlay");
  private readonly featureKicker = requiredElement<HTMLElement>("feature-kicker");
  private readonly featureTitle = requiredElement<HTMLElement>("feature-title");
  private readonly featureDetail = requiredElement<HTMLElement>("feature-detail");
  private readonly featureMultiplier = requiredElement<HTMLElement>("feature-multiplier");
  private readonly featureMessage = requiredElement<HTMLElement>("feature-message");
  private readonly featureStartButton = requiredElement<HTMLButtonElement>("feature-start");
  private largeWinSkip: (() => void) | null = null;
  private featureStartResolver: (() => void) | null = null;

  private constructor(
    private readonly reels: ReelGridView,
    private readonly reelHost: HTMLElement,
    private readonly swordBoard: SwordBoardView,
    private readonly swordHost: HTMLElement,
  ) {
    this.featureOverlay.addEventListener("click", () => this.largeWinSkip?.());
    this.featureStartButton.addEventListener("click", () => {
      const resolve = this.featureStartResolver;
      this.featureStartResolver = null;
      resolve?.();
    });
  }

  static async create(): Promise<GameView> {
    const reelHost = requiredElement<HTMLElement>("reel-grid");
    const swordHost = requiredElement<HTMLElement>("sword-board");
    const [reels, swordBoard] = await Promise.all([
      ReelGridView.create(reelHost),
      SwordBoardView.create(swordHost),
    ]);
    return new GameView(reels, reelHost, swordBoard, swordHost);
  }

  bindControls(actions: ControlActions): void {
    this.controls.bind(actions);
  }

  render(model: GameViewModel, autoSpin: AutoSpinViewState): void {
    this.controls.update(model, autoSpin);
    const swordActive = model.sword !== null;
    this.gamePanel.classList.toggle("game-panel--sword", swordActive);
    this.reelHost.hidden = swordActive;
    this.swordHost.hidden = !swordActive;
    if (model.sword === null) {
      this.reels.renderGrid(model.grid, model.winningWins, model.cashAwards);
    } else if (model.sword.board.length > 0) {
      this.swordBoard.render(model.sword.board, model.sword.rows, model.winningWins);
    } else {
      this.swordBoard.renderPlaceholder(model.sword.rows);
    }
    this.reelHost.setAttribute(
      "aria-busy",
      String(model.phase === "base-spinning" || model.phase === "free-spin-spinning" || model.phase === "sword-spinning"),
    );
    this.renderFeatureMetrics(model);
    this.renderFeatureOverlay(model);
  }

  animateBaseSpin(
    result: Grid,
    turboEnabled: boolean,
    winSymbols: ReadonlyArray<BonusSymbolId> = [],
    cashAwards: ReadonlyArray<FreeSpinCashAward> = [],
    transientCashAwardSymbols: ReadonlyArray<CashAwardSymbolId> = [],
    triggeringBetCents = 0,
  ): Promise<void> {
    const audioPlan = createBonusLandingAudioPlan(result, winSymbols);
    return this.reels.animateBaseSpin(
      result,
      turboEnabled,
      (column) => {
      for (const effect of audioPlan[column] ?? []) {
        this.audio.play(effect);
      }
      },
      cashAwards,
      transientCashAwardSymbols,
      triggeringBetCents,
    ).then(() => this.reels.animateCashAwardCount(cashAwards, this.isQuickSpinEnabled()));
  }

  wait(durationMs: number): Promise<void> {
    return this.reels.wait(durationMs);
  }

  playFreeSpinRetriggerCounter(
    beforeAwardRemainingSpins: number,
    addedSpins: number,
    finalState: FreeSpinState,
    durationMs: number,
  ): Promise<void> {
    if (addedSpins <= 0 || durationMs <= 0) {
      return Promise.resolve();
    }
    this.bonusSpins.textContent = String(beforeAwardRemainingSpins);
    this.bonusRetrigger.textContent = `+${addedSpins} SPINS`;
    this.bonusRetrigger.hidden = false;
    this.bonusMetrics.classList.remove("bonus-metrics--retrigger");
    void this.bonusMetrics.offsetWidth;
    this.bonusMetrics.classList.add("bonus-metrics--retrigger");

    return new Promise((resolve) => {
      const startedAt = performance.now();
      const tick = (now: number): void => {
        const progress = Math.min((now - startedAt) / durationMs, 1);
        const currentSpins = Math.round(
          beforeAwardRemainingSpins + (finalState.remainingSpins - beforeAwardRemainingSpins) * progress,
        );
        this.bonusSpins.textContent = String(currentSpins);
        if (progress === 1) {
          this.bonusSpins.textContent = String(finalState.remainingSpins);
          this.bonusRetrigger.hidden = true;
          this.bonusMetrics.classList.remove("bonus-metrics--retrigger");
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  waitForFeatureStart(): Promise<void> {
    if (this.featureStartResolver !== null) {
      throw new Error("A feature start prompt is already active");
    }
    return new Promise((resolve) => {
      this.featureStartResolver = resolve;
    });
  }

  isQuickSpinEnabled(): boolean {
    return this.controls.isQuickSpinEnabled();
  }

  setQuickSpinEnabled(enabled: boolean): void {
    this.controls.setQuickSpinEnabled(enabled);
    this.reels.setTurboEnabled(enabled);
    this.swordBoard.setTurboEnabled(enabled);
  }

  settleActiveSpin(): void {
    this.reels.settleActiveSpin();
    this.swordBoard.settleActiveSpin();
  }

  toggleMusic(): void {
    this.controls.setMusicEnabled(this.audio.toggleMusic());
  }

  toggleSfx(): void {
    this.controls.setSfxEnabled(this.audio.toggleSfx());
  }

  playSound(effect: GameSoundEffect): void {
    this.audio.play(effect);
  }

  addLog(message: string): void {
    this.log.add(message);
  }

  clearLog(): void {
    this.log.clear();
  }

  animateSwordSpin(
    result: WaysGrid,
    unlockedRows: number,
    turboEnabled: boolean,
    expansionPosition: Position | null,
  ): Promise<void> {
    this.reelHost.hidden = true;
    this.swordHost.hidden = false;
    this.audio.play("spin");
    return this.swordBoard.animateSpin(result, unlockedRows, turboEnabled, (column) => {
      this.audio.play(swordColumnAudioEffect(column, expansionPosition));
    });
  }

  async playSwordExpansionReveal(expansion: SwordExpansion, durationMs: number): Promise<void> {
    const band = SWORD_CONFIG.multiplierBands[expansion.destinationRows as SwordStageRows];
    if (band === undefined) {
      throw new Error("Sword expansion multiplier band is missing");
    }
    const skipRoll = durationMs <= GAME_CONFIG.quickMultiplierRevealDurationMs;
    this.showFeatureOverlay(
      "Sword Cleave",
      "BOARD EXPANDS",
      "Three Cleave Spins reset. The selected multiplier applies on the next spin.",
      "intro",
      "feature-overlay--sword",
    );
    this.setFeatureDetail(`TO 5X${expansion.destinationRows}`);
    this.featureMultiplier.hidden = false;
    this.featureMultiplier.className = "feature-overlay__multiplier feature-overlay__multiplier--rolling";

    if (skipRoll) {
      setFittedNumericText(this.featureMultiplier, `X${expansion.destinationMultiplier}`);
      this.featureMultiplier.className = "feature-overlay__multiplier feature-overlay__multiplier--locked";
      await this.wait(durationMs);
      return;
    }

    const rollValues = createBandMultiplierRollValues(
      expansion.destinationMultiplier,
      band.minimum,
      band.maximum,
    );
    const rollStepDuration = Math.max(45, Math.floor((durationMs * 0.78) / rollValues.length));
    for (const multiplier of rollValues) {
      setFittedNumericText(this.featureMultiplier, `X${multiplier}`);
      await this.wait(rollStepDuration);
    }
    this.featureMultiplier.className = "feature-overlay__multiplier feature-overlay__multiplier--locked";
    const remainingDuration = Math.max(durationMs - rollStepDuration * rollValues.length, 0);
    await this.wait(remainingDuration);
  }

  async playBonusIntroReveal(state: FreeSpinState, durationMs: number): Promise<void> {
    const isBeer = state.mode === "beer";
    const title = `${state.remainingSpins} FREE SPINS`;
    const message = isBeer
      ? `Beer free spins start at an X${state.multiplier} multiplier.`
      : state.mode === "combined"
        ? "Beer X5 applies to ways and every Beer or Cigarette cash award."
        : "Cigarette cash awards land from 0.5X to 50X bet.";
    this.showFeatureOverlay(
      isBeer ? "Beer bonus" : state.mode === "cigarette" ? "Cigarette bonus" : "Beer + Cigarette bonus",
      title,
      message,
      "intro",
      `feature-overlay--${state.mode}`,
    );
    this.featureMultiplier.hidden = false;

    if (!isBeer) {
      this.featureMultiplier.hidden = true;
      await this.wait(durationMs);
      return;
    }

    setFittedNumericText(this.featureMultiplier, `X${state.multiplier}`);
    this.featureMultiplier.className = "feature-overlay__multiplier feature-overlay__multiplier--impact";
    await this.wait(durationMs);
  }

  playLargeWinCount(payoutCents: number, durationMs: number, autoDismiss = false): Promise<void> {
    return new Promise((resolve) => {
      let animationFrame = 0;
      let complete = false;
      const startedAt = performance.now();
      const restoreSoundtrack = this.audio.suppressSoundtrack();
      const stopCountWin = this.audio.play("count-win", true);
      const finishCount = () => {
        if (complete) {
          return;
        }
        complete = true;
        cancelAnimationFrame(animationFrame);
        setFittedNumericText(this.featureMultiplier, formatUsd(payoutCents), formatCompactUsd(payoutCents));
        if (autoDismiss) {
          stopCountWin?.();
          restoreSoundtrack();
          resolve();
          return;
        }
        void this.holdLargeWinFinalPayout().then(() => {
          stopCountWin?.();
          restoreSoundtrack();
          resolve();
        });
      };
      const tick = (now: number) => {
        const progress = Math.min((now - startedAt) / durationMs, 1);
        const currentPayoutCents = Math.floor(payoutCents * progress);
        setFittedNumericText(this.featureMultiplier, formatUsd(currentPayoutCents), formatCompactUsd(currentPayoutCents));
        if (progress === 1) {
          finishCount();
          return;
        }
        animationFrame = requestAnimationFrame(tick);
      };

      this.largeWinSkip = null;
      animationFrame = requestAnimationFrame(tick);
    });
  }

  private holdLargeWinFinalPayout(): Promise<void> {
    return new Promise((resolve) => {
      let complete = false;
      const finish = () => {
        if (complete) {
          return;
        }
        complete = true;
        this.largeWinSkip = null;
        resolve();
      };

      this.largeWinSkip = finish;
    });
  }

  private renderFeatureOverlay(model: GameViewModel): void {
    if (model.phase === "large-win" && model.largeWin !== null) {
      const tier = getLargeWinTier(model.largeWin.payoutCents, model.largeWin.triggeringBetCents);
      if (tier === null) {
        throw new Error("Large-win phase requires a qualifying payout");
      }
      const payoutMultiplier = formatLargeWinMultiplier(model.largeWin.payoutCents, model.largeWin.triggeringBetCents);
      this.showFeatureOverlay(
        "Bet payout",
        tier.label,
        `Pays ${formatUsd(model.largeWin.payoutCents)} at ${payoutMultiplier}X your bet. Click or tap to finish.`,
        "jackpot",
        "feature-overlay--big-win",
      );
      this.featureMultiplier.hidden = false;
      setFittedNumericText(this.featureMultiplier, formatUsd(0));
      this.featureMultiplier.className = "feature-overlay__multiplier feature-overlay__multiplier--big-win";
      return;
    }

    if (model.phase === "bonus-start") {
      const label = model.sword !== null
        ? "Sword"
        : model.freeSpins === null
          ? "Bonus"
          : startFeatureLabel(model.freeSpins.mode);
      this.showFeatureOverlay(
        "Feature ready",
        "PRESS TO START",
        `${label} feature is locked in. Click the button to begin.`,
        "intro",
        "feature-overlay--start",
      );
      this.featureStartButton.hidden = false;
      this.featureStartButton.textContent = `Start ${label}`;
      this.featureStartButton.setAttribute("aria-label", `Start ${label} feature`);
      return;
    }

    if (model.phase === "sword-intro") {
      this.showFeatureOverlay("Sword feature", "CLEAVE SPINS", "Three spins. Each Sword adds a row and resets the counter.", "intro", "feature-overlay--sword");
      return;
    }

    const sword = model.sword;
    if (model.phase === "sword-final-strike" && sword !== null && sword.finalStrikeMultiplier !== null) {
      this.showFeatureOverlay("Sword feature", "FINAL STRIKE", "The Final Strike applies to every accumulated Sword win.", "jackpot");
      this.setFeatureDetail(`X${sword.finalStrikeMultiplier}`);
      return;
    }

    if (model.phase === "sword-complete") {
      const summary = model.bonusSummary?.kind === "sword" ? model.bonusSummary : null;
      this.showFeatureOverlay("Sword feature", "CLEAVE COMPLETE", "", "complete");
      this.renderCompletionSummary(summary);
      return;
    }

    if (model.phase === "bonus-intro") {
      const message = model.freeSpins === null
        ? "The bonus feature is starting."
        : freeSpinIntroText(model.freeSpins);
      this.showFeatureOverlay("Feature unlocked", "FREE SPINS", message, "intro");
      return;
    }

    if (model.phase === "bonus-complete") {
      this.showFeatureOverlay("Feature result", "BONUS COMPLETE", "", "complete");
      this.renderCompletionSummary(model.bonusSummary);
      return;
    }

    this.featureOverlay.hidden = true;
    this.featureOverlay.className = "feature-overlay";
    this.featureMultiplier.hidden = true;
    this.largeWinSkip = null;
  }

  private renderFeatureMetrics(model: GameViewModel): void {
    const state = model.sword === null ? model.freeSpins : null;
    const active = state !== null && isActiveFreeSpinPhase(model.phase);
    this.bonusMetrics.hidden = !active;
    this.swordMetrics.hidden = model.sword === null;
    this.bonusRetrigger.hidden = true;
    this.bonusMetrics.classList.remove("bonus-metrics--retrigger");

    if (state !== null) {
      this.bonusSpins.textContent = String(state.remainingSpins);
      this.bonusMultiplierLabel.textContent = state.mode === "cigarette" ? "Cash Awards" : "Multiplier";
      this.bonusMultiplier.textContent = state.mode === "cigarette" ? "LIVE" : `X${state.multiplier}`;
      setFittedNumericText(this.bonusBank, formatUsd(state.accumulatedWinCents), formatCompactUsd(state.accumulatedWinCents));
    }

    if (model.sword !== null) {
      setFittedNumericText(this.swordBank, formatUsd(model.sword.accumulatedWinCents), formatCompactUsd(model.sword.accumulatedWinCents));
      this.swordCuts.textContent = String(model.sword.remainingSpins);
      this.swordBoardSize.textContent = `5X${model.sword.rows}`;
      this.swordMultiplier.textContent = `X${model.sword.activeMultiplier}`;
    }
  }

  private showFeatureOverlay(
    kicker: string,
    title: string,
    message: string,
    variant: "intro" | "jackpot" | "complete",
    modifier = "",
  ): void {
    this.featureKicker.textContent = kicker;
    this.featureTitle.textContent = title;
    this.setFeatureDetail("");
    this.featureMultiplier.hidden = true;
    this.featureMultiplier.className = "feature-overlay__multiplier";
    setFittedNumericText(this.featureMultiplier, "");
    this.featureMessage.textContent = message;
    this.featureStartButton.hidden = true;
    this.featureOverlay.className = `feature-overlay feature-overlay--${variant}${modifier.length > 0 ? ` ${modifier}` : ""}`;
    this.featureOverlay.setAttribute("aria-live", variant === "jackpot" ? "assertive" : "polite");
    this.featureOverlay.hidden = false;
  }

  private setFeatureDetail(detail: string): void {
    this.featureDetail.textContent = detail;
    this.featureDetail.hidden = detail.length === 0;
  }

  private renderCompletionSummary(summary: BonusSummary | null): void {
    if (summary === null) {
      this.featureMessage.textContent = "Feature complete.";
      return;
    }

    const rows: ReadonlyArray<readonly [string, string]> = summary.kind === "sword"
      ? [
        ["Spins", String(summary.spinsPlayed)],
        ["Paid", formatUsd(summary.payoutCents)],
        ["Final strike", summary.finalStrikeMultiplier === null ? "None" : `X${summary.finalStrikeMultiplier}`],
      ]
      : [
        ["Feature", modeLabel(summary.mode)],
        ["Spins", String(summary.spinsPlayed)],
        ["Paid", formatUsd(summary.payoutCents)],
        [summary.mode === "cigarette" ? "Awards" : "Multiplier", summary.mode === "cigarette" ? "Cash awards" : `X${summary.finalMultiplier}`],
      ];
    const summaryList = document.createElement("dl");
    summaryList.className = "feature-summary";
    for (const [label, value] of rows) {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      summaryList.append(term, description);
    }
    this.featureMessage.replaceChildren(summaryList);
  }
}

function modeLabel(mode: FreeSpinMode): string {
  switch (mode) {
    case "beer":
      return "Beer free spins";
    case "cigarette":
      return "Cigarette free spins";
    case "combined":
      return "Combined free spins";
  }
}

function startFeatureLabel(mode: FreeSpinMode): string {
  switch (mode) {
    case "beer":
      return "Beer";
    case "cigarette":
      return "Cigarette";
    case "combined":
      return "Beer + Cigarette";
  }
}

function freeSpinIntroText(state: FreeSpinState): string {
  if (state.mode === "cigarette") {
    return `${modeLabel(state.mode)} // ${state.remainingSpins} spins // cash awards active`;
  }
  return `${modeLabel(state.mode)} // ${state.remainingSpins} spins // x${state.multiplier} multiplier`;
}

function isActiveFreeSpinPhase(phase: GameViewModel["phase"]): boolean {
  return phase === "bonus-start"
    || phase === "bonus-intro"
    || phase === "free-spin-spinning"
    || phase === "free-spin-evaluation";
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required element #${id} was not found`);
  }
  return element as T;
}
