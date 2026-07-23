import { GAME_CONFIG } from "../config/gameConfig";
import { formatUsd } from "../core/formatUsd";
import type { GameViewModel } from "../core/types";

export type DevelopmentBonusId = "beer" | "cigarette" | "combined" | "sword";

export interface ControlActions {
  readonly spin: () => void;
  readonly decreaseBet: () => void;
  readonly increaseBet: () => void;
  readonly toggleSound: () => void;
  readonly reset: () => void;
  readonly applySeed: (seed: string) => void;
  readonly clearSeed: () => void;
  readonly triggerDevelopmentBonus: (bonus: DevelopmentBonusId) => void;
}

export class ControlPanel {
  private readonly spinButton = requiredElement<HTMLButtonElement>("spin");
  private readonly decreaseButton = requiredElement<HTMLButtonElement>("bet-down");
  private readonly increaseButton = requiredElement<HTMLButtonElement>("bet-up");
  private readonly soundToggleButton = requiredElement<HTMLButtonElement>("sound-toggle");
  private readonly resetButton = requiredElement<HTMLButtonElement>("reset");
  private readonly quickSpinInput = requiredElement<HTMLInputElement>("quick-spin");
  private readonly seedInput = requiredElement<HTMLInputElement>("seed-input");
  private readonly applySeedButton = requiredElement<HTMLButtonElement>("apply-seed");
  private readonly clearSeedButton = requiredElement<HTMLButtonElement>("clear-seed");
  private readonly balanceValue = requiredElement<HTMLElement>("balance");
  private readonly betValue = requiredElement<HTMLElement>("bet");
  private readonly lastWinValue = requiredElement<HTMLElement>("last-win");
  private readonly phaseValue = requiredElement<HTMLElement>("phase");
  private readonly seedStatus = requiredElement<HTMLElement>("seed-status");
  private readonly developmentPanel = requiredElement<HTMLElement>("development-panel");
  private readonly developmentButtons: ReadonlyArray<readonly [HTMLButtonElement, DevelopmentBonusId]> = [
    [requiredElement<HTMLButtonElement>("dev-beer-bonus"), "beer"],
    [requiredElement<HTMLButtonElement>("dev-cigarette-bonus"), "cigarette"],
    [requiredElement<HTMLButtonElement>("dev-combined-bonus"), "combined"],
    [requiredElement<HTMLButtonElement>("dev-sword-bonus"), "sword"],
  ];

  bind(actions: ControlActions): void {
    this.spinButton.addEventListener("click", actions.spin);
    this.decreaseButton.addEventListener("click", actions.decreaseBet);
    this.increaseButton.addEventListener("click", actions.increaseBet);
    this.soundToggleButton.addEventListener("click", actions.toggleSound);
    this.resetButton.addEventListener("click", actions.reset);
    this.applySeedButton.addEventListener("click", () => actions.applySeed(this.seedInput.value));
    this.clearSeedButton.addEventListener("click", actions.clearSeed);
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
    this.balanceValue.textContent = formatUsd(model.balanceCents);
    this.betValue.textContent = formatUsd(model.betCents);
    this.lastWinValue.textContent = formatUsd(model.lastWinCents);
    this.phaseValue.textContent = formatPhase(model.phase);

    this.spinButton.disabled = !interactive || model.balanceCents < model.betCents;
    this.decreaseButton.disabled = !interactive || model.betCents === GAME_CONFIG.betOptionsCents[0];
    this.increaseButton.disabled = !interactive
      || model.betCents === GAME_CONFIG.betOptionsCents[GAME_CONFIG.betOptionsCents.length - 1];
    this.resetButton.disabled = !interactive;
    this.quickSpinInput.disabled = !interactive;
    this.seedInput.disabled = !interactive;
    this.applySeedButton.disabled = !interactive;
    this.clearSeedButton.disabled = !interactive || activeSeed === null;
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

  setSoundEnabled(enabled: boolean): void {
    this.soundToggleButton.textContent = enabled ? "Sound On" : "Sound Off";
    this.soundToggleButton.setAttribute("aria-pressed", String(enabled));
  }
}

function formatPhase(phase: GameViewModel["phase"]): string {
  return phase
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required element #${id} was not found`);
  }
  return element as T;
}
