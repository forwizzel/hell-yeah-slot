import { GAME_CONFIG } from "../config/gameConfig";
import type { BonusSummary, FreeSpinMode, FreeSpinState, GameViewModel, Grid } from "../core/types";
import { ControlPanel, type ControlActions } from "./ControlPanel";
import { EventLogView } from "./EventLogView";
import { ReelGridView } from "./ReelGridView";

export class GameView {
  private readonly controls = new ControlPanel();
  private readonly log = new EventLogView(requiredElement<HTMLOListElement>("event-log"), GAME_CONFIG.recentEventLimit);
  private readonly bonusStatus = requiredElement<HTMLElement>("bonus-status");
  private readonly featureOverlay = requiredElement<HTMLElement>("feature-overlay");
  private readonly featureKicker = requiredElement<HTMLElement>("feature-kicker");
  private readonly featureTitle = requiredElement<HTMLElement>("feature-title");
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

  animateBaseSpin(result: Grid, durationMs: number): Promise<void> {
    return this.reels.animateBaseSpin(result, durationMs);
  }

  wait(durationMs: number): Promise<void> {
    return this.reels.wait(durationMs);
  }

  isQuickSpinEnabled(): boolean {
    return this.controls.isQuickSpinEnabled();
  }

  addLog(message: string): void {
    this.log.add(message);
  }

  clearLog(): void {
    this.log.clear();
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
  }

  private showFeatureOverlay(
    kicker: string,
    title: string,
    message: string,
    variant: "intro" | "jackpot" | "complete",
  ): void {
    this.featureKicker.textContent = kicker;
    this.featureTitle.textContent = title;
    this.featureMessage.textContent = message;
    this.featureOverlay.className = `feature-overlay feature-overlay--${variant}`;
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
  return `${modeLabel(state.mode)} | ${state.remainingSpins} spins remaining | ${state.multiplier}x multiplier | ${state.accumulatedWin} won`;
}

function completionText(summary: BonusSummary | null): string {
  return summary === null ? "Feature complete" : summaryText(summary);
}

function summaryText(summary: BonusSummary): string {
  if (summary.kind === "sword") {
    return "Sword JACKPOT displayed | No award";
  }

  return `${modeLabel(summary.mode)} | ${summary.spinsPlayed} spins | ${summary.payout} won | final ${summary.finalMultiplier}x`;
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
