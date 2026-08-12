import { GAME_CONFIG, getFeatureBuyCostCents, type FeatureBuyId } from "../config/gameConfig";
import { formatCompactUsd, formatUsd } from "../core/formatUsd";
import type { AutoSpinViewState, GameViewModel } from "../core/types";
import { setFittedNumericText } from "./FittedText";

export type DevelopmentBonusId = FeatureBuyId;

export interface ControlActions {
  readonly spin: () => void;
  readonly setQuickSpinEnabled: (enabled: boolean) => void;
  readonly decreaseBet: () => void;
  readonly increaseBet: () => void;
  readonly toggleMusic: () => void;
  readonly toggleSfx: () => void;
  readonly reset: () => void;
  readonly startAutoSpin: (betCents: number, spins: number) => void;
  readonly stopAutoSpin: () => void;
  readonly buyFeature: (feature: FeatureBuyId) => void;
  triggerDevelopmentBonus?: (bonus: DevelopmentBonusId) => void;
}

export class ControlPanel {
  private readonly spinButton = requiredElement<HTMLButtonElement>("spin");
  private readonly decreaseButton = requiredElement<HTMLButtonElement>("bet-down");
  private readonly increaseButton = requiredElement<HTMLButtonElement>("bet-up");
  private readonly musicToggleButton = requiredElement<HTMLButtonElement>("music-toggle");
  private readonly sfxToggleButton = requiredElement<HTMLButtonElement>("sfx-toggle");
  private readonly resetButton = requiredElement<HTMLButtonElement>("reset");
  private readonly quickSpinInput = requiredElement<HTMLInputElement>("quick-spin");
  private readonly autoSpinBet = requiredElement<HTMLSelectElement>("auto-spin-bet");
  private readonly autoSpinCount = requiredElement<HTMLSelectElement>("auto-spin-count");
  private readonly autoSpinCustomLabel = requiredElement<HTMLLabelElement>("auto-spin-custom-label");
  private readonly autoSpinCustom = requiredElement<HTMLInputElement>("auto-spin-custom");
  private readonly autoSpinStart = requiredElement<HTMLButtonElement>("auto-spin-start");
  private readonly autoSpinStop = requiredElement<HTMLButtonElement>("auto-spin-stop");
  private readonly autoSpinStatus = requiredElement<HTMLElement>("auto-spin-status");
  private readonly balanceValue = requiredElement<HTMLElement>("balance");
  private readonly betValue = requiredElement<HTMLElement>("bet");
  private readonly lastWinValue = requiredElement<HTMLElement>("last-win");
  private readonly featureBuyButtons: ReadonlyArray<readonly [HTMLButtonElement, FeatureBuyId]> = [
    [requiredElement<HTMLButtonElement>("buy-beer-bonus"), "beer"],
    [requiredElement<HTMLButtonElement>("buy-cigarette-bonus"), "cigarette"],
    [requiredElement<HTMLButtonElement>("buy-combined-bonus"), "combined"],
    [requiredElement<HTMLButtonElement>("buy-sword-bonus"), "sword"],
  ];
  private developmentButtons: ReadonlyArray<readonly [HTMLButtonElement, DevelopmentBonusId]> = [];

  bind(actions: ControlActions): void {
    for (const betCents of GAME_CONFIG.betOptionsCents) {
      this.autoSpinBet.add(new Option(formatUsd(betCents), String(betCents)));
    }
    this.autoSpinBet.value = String(GAME_CONFIG.defaultBetCents);
    this.spinButton.addEventListener("click", actions.spin);
    this.quickSpinInput.addEventListener("change", () => actions.setQuickSpinEnabled(this.quickSpinInput.checked));
    this.decreaseButton.addEventListener("click", actions.decreaseBet);
    this.increaseButton.addEventListener("click", actions.increaseBet);
    this.musicToggleButton.addEventListener("click", actions.toggleMusic);
    this.sfxToggleButton.addEventListener("click", actions.toggleSfx);
    this.resetButton.addEventListener("click", actions.reset);
    this.autoSpinCount.addEventListener("change", () => {
      this.autoSpinCustomLabel.hidden = this.autoSpinCount.value !== "custom";
      if (!this.autoSpinCustomLabel.hidden) {
        this.autoSpinCustom.focus();
      }
    });
    this.autoSpinStart.addEventListener("click", () => {
      const spins = this.autoSpinCount.value === "custom"
        ? this.autoSpinCustom.valueAsNumber
        : Number(this.autoSpinCount.value);
      actions.startAutoSpin(Number(this.autoSpinBet.value), spins);
    });
    this.autoSpinStop.addEventListener("click", actions.stopAutoSpin);
    for (const [button, feature] of this.featureBuyButtons) {
      button.addEventListener("click", () => actions.buyFeature(feature));
    }
    if (import.meta.env.DEV) {
      const triggerDevelopmentBonus = actions.triggerDevelopmentBonus;
      if (triggerDevelopmentBonus === undefined) {
        throw new Error("Development bonus action was not provided");
      }
      this.developmentButtons = createDevelopmentPanel();
      for (const [button, bonus] of this.developmentButtons) {
        button.addEventListener("click", () => triggerDevelopmentBonus(bonus));
      }
    }
  }

  update(model: GameViewModel, autoSpin: AutoSpinViewState): void {
    const interactive = model.phase === "idle";
    const spinning = model.phase === "base-spinning"
      || model.phase === "free-spin-spinning"
      || model.phase === "sword-spinning";
    setFittedNumericText(this.balanceValue, formatUsd(model.balanceCents), formatCompactUsd(model.balanceCents));
    setFittedNumericText(this.betValue, formatUsd(model.betCents));
    setFittedNumericText(this.lastWinValue, formatUsd(model.lastWinCents), formatCompactUsd(model.lastWinCents));

    this.spinButton.disabled = spinning ? false : !interactive || autoSpin.active || model.balanceCents < model.betCents;
    this.spinButton.textContent = spinning ? "Settle" : "Spin";
    this.spinButton.setAttribute("aria-label", spinning ? "Settle current spin" : "Start spin");
    this.decreaseButton.disabled = !interactive || autoSpin.active || model.betCents === GAME_CONFIG.betOptionsCents[0];
    this.increaseButton.disabled = !interactive || autoSpin.active
      || model.betCents === GAME_CONFIG.betOptionsCents[GAME_CONFIG.betOptionsCents.length - 1];
    this.resetButton.disabled = !interactive;
    this.quickSpinInput.disabled = model.phase === "large-win";
    this.autoSpinBet.disabled = !interactive || autoSpin.active;
    this.autoSpinCount.disabled = !interactive || autoSpin.active;
    this.autoSpinCustom.disabled = !interactive || autoSpin.active;
    this.autoSpinStart.disabled = !interactive || autoSpin.active;
    this.autoSpinStop.disabled = !autoSpin.active || autoSpin.stopping;
    this.autoSpinStatus.textContent = autoSpin.active
      ? `${autoSpin.remainingSpins} paid spin${autoSpin.remainingSpins === 1 ? "" : "s"} remaining. ${autoSpin.status}`
      : autoSpin.status;
    for (const [button, feature] of this.featureBuyButtons) {
      const costCents = getFeatureBuyCostCents(feature, model.betCents);
      button.textContent = `${featureBuyLabel(feature)} ${formatUsd(costCents)}`;
      button.setAttribute("aria-label", `Buy ${featureBuyLabel(feature)} for ${formatUsd(costCents)}`);
      button.disabled = !interactive || autoSpin.active || model.balanceCents < costCents;
    }
    for (const [button] of this.developmentButtons) {
      button.disabled = !interactive || autoSpin.active;
    }
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

function createDevelopmentPanel(): ReadonlyArray<readonly [HTMLButtonElement, DevelopmentBonusId]> {
  const panel = document.createElement("section");
  panel.className = "development-panel auxiliary-panel";
  panel.setAttribute("aria-labelledby", "development-title");
  panel.innerHTML = `
    <div class="auxiliary-panel__intro">
      <p class="auxiliary-panel__eyebrow">Development only</p>
      <h2 id="development-title">Feature Service</h2>
      <p>Starts a feature at the current bet without placing a wager.</p>
    </div>
    <div class="development-controls"></div>
  `;
  const controls = panel.querySelector<HTMLElement>(".development-controls");
  if (controls === null) {
    throw new Error("Development controls could not be created");
  }
  const bonuses: ReadonlyArray<readonly [DevelopmentBonusId, string]> = [
    ["beer", "Beer"],
    ["cigarette", "Cigarette"],
    ["combined", "Beer + Cigarette"],
    ["sword", "Sword"],
  ];
  const buttons = bonuses.map(([bonus, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    controls.append(button);
    return [button, bonus] as const;
  });
  requiredElement("feature-buy-panel").insertAdjacentElement("afterend", panel);
  return buttons;
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
