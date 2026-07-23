import { GAME_CONFIG } from "../config/gameConfig";
import { formatUsd } from "../core/formatUsd";
import type { BonusSummary, FreeSpinMode, FreeSpinState, GameViewModel, Grid, Position } from "../core/types";
import { ControlPanel, type ControlActions } from "./ControlPanel";
import { createMultiplierRollValues } from "./BonusMultiplierReveal";
import { EventLogView } from "./EventLogView";
import { GameAudio, type GameSoundEffect } from "./GameAudio";
import { ReelGridView } from "./ReelGridView";

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

  private constructor(
    private readonly reels: ReelGridView,
    private readonly reelHost: HTMLElement,
  ) {}

  static async create(): Promise<GameView> {
    const reelHost = requiredElement<HTMLElement>("reel-grid");
    const reels = await ReelGridView.create(reelHost);
    return new GameView(reels, reelHost);
  }

  bindControls(actions: ControlActions): void {
    this.controls.bind(actions);
  }

  render(model: GameViewModel, activeSeed: string | null): void {
    this.controls.update(model, activeSeed);
    this.reels.renderGrid(model.grid, model.winningPositions);
    this.reelHost.setAttribute("aria-busy", String(model.phase === "base-spinning" || model.phase === "free-spin-spinning"));
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

  private renderFeatureOverlay(model: GameViewModel): void {
    if (model.phase === "sword-bonus") {
      this.showFeatureOverlay("Sword feature", "JACKPOT!", "Jackpot interstitial", "jackpot");
      return;
    }

    if (model.phase === "bonus-intro") {
      const message = model.freeSpins === null
        ? "The bonus feature is starting."
        : `${modeLabel(model.freeSpins.mode)} | ${model.freeSpins.remainingSpins} spins | ${model.freeSpins.multiplier}x multiplier`;
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
    this.featureOverlay.className = `feature-overlay feature-overlay--${variant}${modifier.length > 0 ? ` ${modifier}` : ""}`;
    this.featureOverlay.setAttribute("aria-live", variant === "jackpot" ? "assertive" : "polite");
    this.featureOverlay.hidden = false;
  }
}

function statusText(model: GameViewModel): string {
  if (model.phase === "idle" && model.bonusSummary !== null) {
    return `Last feature: ${summaryText(model.bonusSummary)}`;
  }

  if (model.phase === "sword-bonus") {
    return "Sword bonus active | Jackpot interstitial";
  }

  if (model.phase === "bonus-intro") {
    return "Bonus feature starting";
  }

  if (model.phase === "bonus-complete") {
    return completionText(model.bonusSummary);
  }

  if (model.freeSpins !== null) {
    return freeSpinStatus(model.freeSpins);
  }

  return "No active bonus";
}

function freeSpinStatus(state: FreeSpinState): string {
  return `${modeLabel(state.mode)} | ${state.remainingSpins} spins remaining | ${state.multiplier}x multiplier | ${formatUsd(state.accumulatedWinCents)} won`;
}

function completionText(summary: BonusSummary | null): string {
  return summary === null ? "Feature complete" : summaryText(summary);
}

function summaryText(summary: BonusSummary): string {
  if (summary.kind === "sword") {
    return "Sword JACKPOT displayed | No award";
  }

  return `${modeLabel(summary.mode)} | ${summary.spinsPlayed} spins | ${formatUsd(summary.payoutCents)} won | final ${summary.finalMultiplier}x`;
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

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required element #${id} was not found`);
  }
  return element as T;
}
