import { GAME_CONFIG } from "../config/gameConfig";
import { SWORD_CONFIG, type SwordStageRows } from "../config/swordConfig";
import { formatUsd } from "../core/formatUsd";
import type { BonusSummary, FreeSpinMode, FreeSpinState, GameViewModel, Grid, Position, SwordExpansion, WaysGrid } from "../core/types";
import { ControlPanel, type ControlActions } from "./ControlPanel";
import { createBandMultiplierRollValues, createMultiplierRollValues } from "./BonusMultiplierReveal";
import { EventLogView } from "./EventLogView";
import { GameAudio, type GameSoundEffect } from "./GameAudio";
import { getLargeWinTier } from "./LargeWin";
import { ReelGridView } from "./ReelGridView";
import { SwordBoardView } from "./SwordBoardView";

const SYMBOL_REVEAL_EFFECTS = [
  "symbol-first",
  "symbol-second",
  "symbol-third",
] as const satisfies readonly GameSoundEffect[];

export class GameView {
  private readonly controls = new ControlPanel();
  private readonly audio = new GameAudio();
  private readonly log = new EventLogView(requiredElement<HTMLOListElement>("event-log"), GAME_CONFIG.recentEventLimit);
  private readonly bonusStatus = requiredElement<HTMLElement>("bonus-status");
  private readonly featureOverlay = requiredElement<HTMLElement>("feature-overlay");
  private readonly featureKicker = requiredElement<HTMLElement>("feature-kicker");
  private readonly featureTitle = requiredElement<HTMLElement>("feature-title");
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

  render(model: GameViewModel, activeSeed: string | null): void {
    this.controls.update(model, activeSeed);
    const swordActive = model.sword !== null && model.sword.board.length > 0;
    this.reelHost.hidden = swordActive;
    this.swordHost.hidden = !swordActive;
    if (model.sword === null) {
      this.reels.renderGrid(model.grid, model.winningPositions);
    } else if (model.sword.board.length > 0) {
      this.swordBoard.render(model.sword.board, model.winningPositions);
    }
    this.reelHost.setAttribute(
      "aria-busy",
      String(model.phase === "base-spinning" || model.phase === "free-spin-spinning" || model.phase === "sword-spinning"),
    );
    this.bonusStatus.textContent = statusText(model);
    this.renderFeatureOverlay(model);
  }

  animateBaseSpin(
    result: Grid,
    durationMs: number,
    bonusSoundGroups: ReadonlyArray<ReadonlyArray<Position>> = [],
  ): Promise<void> {
    const revealedCounts = bonusSoundGroups.map(() => 0);
    return this.reels.animateBaseSpin(result, durationMs, (column) => {
      this.audio.play("click");
      bonusSoundGroups.forEach((positions, groupIndex) => {
        const positionsInColumn = positions
          .filter((position) => position.column === column)
          .sort((left, right) => left.row - right.row);
        for (const _position of positionsInColumn) {
          const revealedCount = revealedCounts[groupIndex];
          if (revealedCount === undefined) {
            throw new Error("Bonus sound group was not initialized");
          }
          const effect = SYMBOL_REVEAL_EFFECTS[revealedCount];
          if (effect !== undefined) {
            this.audio.play(effect);
          }
          revealedCounts[groupIndex] = revealedCount + 1;
        }
      });
    });
  }

  wait(durationMs: number): Promise<void> {
    return this.reels.wait(durationMs);
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

  toggleSound(): void {
    this.controls.setSoundEnabled(this.audio.toggle());
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

  animateSwordSpin(result: WaysGrid, durationMs: number, swordPosition: Position | null = null): Promise<void> {
    this.reelHost.hidden = true;
    this.swordHost.hidden = false;
    this.audio.play("spin");
    const reducedMotion = durationMs <= 0 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion && swordPosition !== null) {
      this.audio.play("symbol-winner");
    }
    return this.swordBoard.animateSpin(result, durationMs, (column) => {
      this.audio.play("click");
      if (swordPosition?.column === column) {
        this.audio.play("symbol-winner");
      }
    });
  }

  async playSwordExpansionReveal(expansion: SwordExpansion, durationMs: number): Promise<void> {
    const band = SWORD_CONFIG.multiplierBands[expansion.destinationRows as SwordStageRows];
    if (band === undefined) {
      throw new Error("Sword expansion multiplier band is missing");
    }
    const skipRoll = durationMs <= GAME_CONFIG.quickMultiplierRevealDurationMs
      || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.showFeatureOverlay(
      "Sword Cleave",
      `BOARD EXPANDS TO 5X${expansion.destinationRows}`,
      "Three Cleave Spins reset. The selected multiplier applies on the next spin.",
      "intro",
      "feature-overlay--sword",
    );
    this.featureMultiplier.hidden = false;
    this.featureMultiplier.className = "feature-overlay__multiplier feature-overlay__multiplier--rolling";

    if (skipRoll) {
      this.featureMultiplier.textContent = `X${expansion.destinationMultiplier}`;
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
      this.featureMultiplier.textContent = `X${multiplier}`;
      await this.wait(rollStepDuration);
    }
    this.featureMultiplier.className = "feature-overlay__multiplier feature-overlay__multiplier--locked";
    const remainingDuration = Math.max(durationMs - rollStepDuration * rollValues.length, 0);
    await this.wait(remainingDuration);
  }

  async playBonusIntroReveal(state: FreeSpinState, durationMs: number): Promise<void> {
    const isBeer = state.mode === "beer";
    const skipRoll = durationMs <= GAME_CONFIG.quickMultiplierRevealDurationMs
      || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const title = `${state.remainingSpins} FREE SPINS`;
    const message = isBeer
      ? `Beer free spins start at an X${state.multiplier} multiplier.`
      : `X${GAME_CONFIG.freeSpinBaseMultiplier} baseline x selected multiplier = X${state.multiplier}.`;
    this.showFeatureOverlay(
      isBeer ? "Beer bonus" : state.mode === "cigarette" ? "Cigarette bonus" : "Beer + Cigarette bonus",
      title,
      message,
      "intro",
      `feature-overlay--${state.mode}`,
    );
    this.featureMultiplier.hidden = false;

    if (isBeer) {
      this.featureMultiplier.textContent = `X${state.multiplier}`;
      this.featureMultiplier.className = "feature-overlay__multiplier feature-overlay__multiplier--impact";
      await this.wait(durationMs);
      return;
    }

    const rollValues = createMultiplierRollValues(state.multiplier);
    this.featureMultiplier.className = "feature-overlay__multiplier feature-overlay__multiplier--rolling";
    if (skipRoll) {
      this.featureMultiplier.textContent = `X${state.multiplier}`;
      this.featureMultiplier.className = "feature-overlay__multiplier feature-overlay__multiplier--locked";
      await this.wait(durationMs);
      return;
    }

    const rollStepDuration = Math.max(45, Math.floor((durationMs * 0.78) / rollValues.length));
    for (const multiplier of rollValues) {
      this.featureMultiplier.textContent = `X${multiplier}`;
      await this.wait(rollStepDuration);
    }
    this.featureMultiplier.className = "feature-overlay__multiplier feature-overlay__multiplier--locked";
    const remainingDuration = Math.max(durationMs - rollStepDuration * rollValues.length, 0);
    await this.wait(remainingDuration);
  }

  playLargeWinCount(payoutCents: number, durationMs: number): Promise<void> {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      this.featureMultiplier.textContent = formatUsd(payoutCents);
      return this.holdLargeWinFinalPayout();
    }

    return new Promise((resolve) => {
      let animationFrame = 0;
      let complete = false;
      const startedAt = performance.now();
      const finishCount = () => {
        if (complete) {
          return;
        }
        complete = true;
        cancelAnimationFrame(animationFrame);
        this.featureMultiplier.textContent = formatUsd(payoutCents);
        void this.holdLargeWinFinalPayout().then(resolve);
      };
      const tick = (now: number) => {
        const progress = Math.min((now - startedAt) / durationMs, 1);
        this.featureMultiplier.textContent = formatUsd(Math.floor(payoutCents * progress));
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
      let timeout: number | null = null;
      const finish = () => {
        if (complete) {
          return;
        }
        complete = true;
        if (timeout !== null) {
          window.clearTimeout(timeout);
        }
        this.largeWinSkip = null;
        resolve();
      };

      timeout = window.setTimeout(finish, GAME_CONFIG.largeWinFinalHoldDurationMs);
      this.largeWinSkip = finish;
    });
  }

  private renderFeatureOverlay(model: GameViewModel): void {
    if (model.phase === "large-win" && model.largeWin !== null) {
      const tier = getLargeWinTier(model.largeWin.payoutCents, model.largeWin.triggeringBetCents);
      if (tier === null) {
        throw new Error("Large-win phase requires a qualifying payout");
      }
      this.showFeatureOverlay(
        `${tier.minimumMultiplier}X BET PAYOUT`,
        tier.label,
        `Payout ${formatUsd(model.largeWin.payoutCents)}. Click or tap to finish.`,
        "jackpot",
        "feature-overlay--big-win",
      );
      this.featureMultiplier.hidden = false;
      this.featureMultiplier.textContent = formatUsd(0);
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
      this.featureStartButton.textContent = `Press to Start ${label} Feature`;
      return;
    }

    if (model.phase === "sword-intro") {
      this.showFeatureOverlay("Sword feature", "CLEAVE SPINS", "Three spins. Each Sword adds a row and resets the counter.", "intro", "feature-overlay--sword");
      return;
    }

    const sword = model.sword;
    if (model.phase === "sword-final-strike" && sword !== null && sword.finalStrikeMultiplier !== null) {
      this.showFeatureOverlay("Sword feature", `FINAL STRIKE X${sword.finalStrikeMultiplier}`, "The Final Strike applies to every accumulated Sword win.", "jackpot");
      return;
    }

    if (model.phase === "sword-complete") {
      const summary = model.bonusSummary?.kind === "sword" ? model.bonusSummary : null;
      this.showFeatureOverlay(
        "Sword feature",
        "CLEAVE COMPLETE",
        summary === null ? "Sword feature complete" : swordSummaryText(summary),
        "complete",
      );
      return;
    }

    if (model.phase === "bonus-intro") {
      const message = model.freeSpins === null
        ? "The bonus feature is starting."
        : `${modeLabel(model.freeSpins.mode)} // ${model.freeSpins.remainingSpins} spins // x${model.freeSpins.multiplier} multiplier`;
      this.showFeatureOverlay("Feature unlocked", "FREE SPINS", message, "intro");
      return;
    }

    if (model.phase === "bonus-complete") {
      this.showFeatureOverlay("Feature result", "BONUS COMPLETE", completionText(model.bonusSummary), "complete");
      return;
    }

    this.featureOverlay.hidden = true;
    this.featureOverlay.className = "feature-overlay";
    this.featureMultiplier.hidden = true;
    this.largeWinSkip = null;
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
    this.featureMultiplier.hidden = true;
    this.featureMultiplier.className = "feature-overlay__multiplier";
    this.featureMessage.textContent = message;
    this.featureStartButton.hidden = true;
    this.featureOverlay.className = `feature-overlay feature-overlay--${variant}${modifier.length > 0 ? ` ${modifier}` : ""}`;
    this.featureOverlay.setAttribute("aria-live", variant === "jackpot" ? "assertive" : "polite");
    this.featureOverlay.hidden = false;
  }
}

function statusText(model: GameViewModel): string {
  if (model.phase === "idle" && model.bonusSummary !== null) {
    return `Last feature · ${summaryText(model.bonusSummary)}`;
  }

  if (model.sword !== null) {
    return `Sword Cleave // 5x${model.sword.rows} rig // ${model.sword.remainingSpins} cuts left // x${model.sword.activeMultiplier} multiplier // ${formatUsd(model.sword.accumulatedWinCents)} banked`;
  }

  if (model.phase === "bonus-intro") {
    return "Feature mechanism engaged";
  }

  if (model.phase === "bonus-start") {
    const label = model.sword !== null
      ? "Sword"
      : model.freeSpins === null
        ? "Bonus"
        : startFeatureLabel(model.freeSpins.mode);
    return `Press to start ${label} feature`;
  }

  if (model.phase === "bonus-complete") {
    return completionText(model.bonusSummary);
  }

  if (model.freeSpins !== null) {
    return freeSpinStatus(model.freeSpins);
  }

  if (model.phase === "base-spinning") {
    return "Reels in motion";
  }

  if (model.phase === "base-evaluation") {
    return "Reels locked · reading result";
  }

  return "Machine ready";
}

function freeSpinStatus(state: FreeSpinState): string {
  return `${modeLabel(state.mode)} // ${state.remainingSpins} spins left // x${state.multiplier} multiplier // ${formatUsd(state.accumulatedWinCents)} banked`;
}

function completionText(summary: BonusSummary | null): string {
  return summary === null ? "Feature complete" : summaryText(summary);
}

function summaryText(summary: BonusSummary): string {
  if (summary.kind === "sword") {
    return swordSummaryText(summary);
  }

  return `${modeLabel(summary.mode)} // ${summary.spinsPlayed} spins // ${formatUsd(summary.payoutCents)} paid // final x${summary.finalMultiplier}`;
}

function swordSummaryText(summary: Extract<BonusSummary, { kind: "sword" }>): string {
  const finalStrike = summary.finalStrikeMultiplier === null
    ? "no Final Strike"
    : `Final Strike x${summary.finalStrikeMultiplier}`;
  return `Sword Cleave // ${summary.spinsPlayed} spins // ${formatUsd(summary.payoutCents)} paid // ${finalStrike}`;
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

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required element #${id} was not found`);
  }
  return element as T;
}
