import { GAME_CONFIG, getFeatureBuyCostCents, type FeatureBuyId } from "../config/gameConfig";
import { formatUsd } from "../core/formatUsd";
import type { GameViewModel } from "../core/types";

export type DevelopmentBonusId = FeatureBuyId;

export interface ControlActions {
  readonly spin: () => void;
  readonly setQuickSpinEnabled: (enabled: boolean) => void;
  readonly decreaseBet: () => void;
  readonly increaseBet: () => void;
  readonly toggleMusic: () => void;
  readonly toggleSfx: () => void;
  readonly reset: () => void;
  readonly applySeed: (seed: string) => void;
  readonly clearSeed: () => void;
  readonly buyFeature: (feature: FeatureBuyId) => void;
  readonly triggerDevelopmentBonus: (bonus: DevelopmentBonusId) => void;
}

export class ControlPanel {
  private readonly spinButton = requiredElement<HTMLButtonElement>("spin");
  private readonly decreaseButton = requiredElement<HTMLButtonElement>("bet-down");
  private readonly increaseButton = requiredElement<HTMLButtonElement>("bet-up");
  private readonly musicToggleButton = requiredElement<HTMLButtonElement>("music-toggle");
  private readonly sfxToggleButton = requiredElement<HTMLButtonElement>("sfx-toggle");
  private readonly resetButton = requiredElement<HTMLButtonElement>("reset");
  private readonly quickSpinInput = requiredElement<HTMLInputElement>("quick-spin");
  private readonly seedInput = requiredElement<HTMLInputElement>("seed-input");
  private readonly applySeedButton = requiredElement<HTMLButtonElement>("apply-seed");
  private readonly clearSeedButton = requiredElement<HTMLButtonElement>("clear-seed");
  private readonly balanceValue = requiredElement<HTMLElement>("balance");
  private readonly betValue = requiredElement<HTMLElement>("bet");
  private readonly lastWinValue = requiredElement<HTMLElement>("last-win");
  private readonly seedStatus = requiredElement<HTMLElement>("seed-status");
  private readonly featureBuyButtons: ReadonlyArray<readonly [HTMLButtonElement, FeatureBuyId]> = [
    [requiredElement<HTMLButtonElement>("buy-beer-bonus"), "beer"],
    [requiredElement<HTMLButtonElement>("buy-cigarette-bonus"), "cigarette"],
    [requiredElement<HTMLButtonElement>("buy-combined-bonus"), "combined"],
    [requiredElement<HTMLButtonElement>("buy-sword-bonus"), "sword"],
  ];
  private readonly developmentPanel = requiredElement<HTMLElement>("development-panel");
  private readonly developmentButtons: ReadonlyArray<readonly [HTMLButtonElement, DevelopmentBonusId]> = [
    [requiredElement<HTMLButtonElement>("dev-beer-bonus"), "beer"],
    [requiredElement<HTMLButtonElement>("dev-cigarette-bonus"), "cigarette"],
    [requiredElement<HTMLButtonElement>("dev-combined-bonus"), "combined"],
    [requiredElement<HTMLButtonElement>("dev-sword-bonus"), "sword"],
  ];

  bind(actions: ControlActions): void {
    this.spinButton.addEventListener("click", actions.spin);
    this.quickSpinInput.addEventListener("change", () => actions.setQuickSpinEnabled(this.quickSpinInput.checked));
    this.decreaseButton.addEventListener("click", actions.decreaseBet);
    this.increaseButton.addEventListener("click", actions.increaseBet);
    this.musicToggleButton.addEventListener("click", actions.toggleMusic);
    this.sfxToggleButton.addEventListener("click", actions.toggleSfx);
    this.resetButton.addEventListener("click", actions.reset);
    this.applySeedButton.addEventListener("click", () => actions.applySeed(this.seedInput.value));
    this.clearSeedButton.addEventListener("click", actions.clearSeed);
    for (const [button, feature] of this.featureBuyButtons) {
      button.addEventListener("click", () => actions.buyFeature(feature));
    }
    this.seedInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        actions.applySeed(this.seedInput.value);
      }
    });
    if (import.meta.env.DEV) {
      this.developmentPanel.hidden = false;
      for (const [button, bonus] of this.developmentButtons) {
        button.addEventListener("click", () => actions.triggerDevelopmentBonus(bonus));
      }
    } else {
      this.developmentPanel.remove();
    }
  }

  update(model: GameViewModel, activeSeed: string | null): void {
    const interactive = model.phase === "idle";
    const spinning = model.phase === "base-spinning"
      || model.phase === "free-spin-spinning"
      || model.phase === "sword-spinning";
    this.balanceValue.textContent = formatUsd(model.balanceCents);
    this.betValue.textContent = formatUsd(model.betCents);
    this.lastWinValue.textContent = formatUsd(model.lastWinCents);

    this.spinButton.disabled = spinning ? false : !interactive || model.balanceCents < model.betCents;
    this.spinButton.textContent = spinning ? "Settle" : "Spin";
    this.spinButton.setAttribute("aria-label", spinning ? "Settle current spin" : "Start spin");
    this.decreaseButton.disabled = !interactive || model.betCents === GAME_CONFIG.betOptionsCents[0];
    this.increaseButton.disabled = !interactive
      || model.betCents === GAME_CONFIG.betOptionsCents[GAME_CONFIG.betOptionsCents.length - 1];
    this.resetButton.disabled = !interactive;
    this.quickSpinInput.disabled = model.phase === "large-win";
    this.seedInput.disabled = !interactive;
    this.applySeedButton.disabled = !interactive;
    this.clearSeedButton.disabled = !interactive || activeSeed === null;
    for (const [button, feature] of this.featureBuyButtons) {
      const costCents = getFeatureBuyCostCents(feature, model.betCents);
      button.textContent = `${featureBuyLabel(feature)} ${formatUsd(costCents)}`;
      button.setAttribute("aria-label", `Buy ${featureBuyLabel(feature)} for ${formatUsd(costCents)}`);
      button.disabled = !interactive || model.balanceCents < costCents;
    }
    for (const [button] of this.developmentButtons) {
      button.disabled = !interactive;
    }
    this.seedStatus.textContent = activeSeed === null
      ? "Using browser crypto randomness."
      : `Using deterministic seed: ${activeSeed}`;
  }

  isQuickSpinEnabled(): boolean {
    return this.quickSpinInput.checked;
  }

  setQuickSpinEnabled(enabled: boolean): void {
    this.quickSpinInput.checked = enabled;
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicToggleButton.textContent = enabled ? "Music On" : "Music Off";
    this.musicToggleButton.setAttribute("aria-pressed", String(enabled));
  }

  setSfxEnabled(enabled: boolean): void {
    this.sfxToggleButton.textContent = enabled ? "SFX On" : "SFX Off";
    this.sfxToggleButton.setAttribute("aria-pressed", String(enabled));
  }
}

function featureBuyLabel(feature: FeatureBuyId): string {
  switch (feature) {
    case "beer":
      return "Beer";
    case "cigarette":
      return "Cigarette";
    case "combined":
      return "Beer + Cigarette";
    case "sword":
      return "Sword";
  }
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required element #${id} was not found`);
  }
  return element as T;
}
