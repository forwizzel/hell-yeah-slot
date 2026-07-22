import { GAME_CONFIG } from "../config/gameConfig";
import type { GameViewModel } from "../core/types";

export interface ControlActions {
  readonly spin: () => void;
  readonly decreaseBet: () => void;
  readonly increaseBet: () => void;
  readonly reset: () => void;
  readonly applySeed: (seed: string) => void;
  readonly clearSeed: () => void;
}

export class ControlPanel {
  private readonly spinButton = requiredElement<HTMLButtonElement>("spin");
  private readonly decreaseButton = requiredElement<HTMLButtonElement>("bet-down");
  private readonly increaseButton = requiredElement<HTMLButtonElement>("bet-up");
  private readonly resetButton = requiredElement<HTMLButtonElement>("reset");
  private readonly quickSpinInput = requiredElement<HTMLInputElement>("quick-spin");
  private readonly seedInput = requiredElement<HTMLInputElement>("seed-input");
  private readonly applySeedButton = requiredElement<HTMLButtonElement>("apply-seed");
  private readonly clearSeedButton = requiredElement<HTMLButtonElement>("clear-seed");
  private readonly creditsValue = requiredElement<HTMLElement>("credits");
  private readonly betValue = requiredElement<HTMLElement>("bet");
  private readonly lastWinValue = requiredElement<HTMLElement>("last-win");
  private readonly phaseValue = requiredElement<HTMLElement>("phase");
  private readonly seedStatus = requiredElement<HTMLElement>("seed-status");

  bind(actions: ControlActions): void {
    this.spinButton.addEventListener("click", actions.spin);
    this.decreaseButton.addEventListener("click", actions.decreaseBet);
    this.increaseButton.addEventListener("click", actions.increaseBet);
    this.resetButton.addEventListener("click", actions.reset);
    this.applySeedButton.addEventListener("click", () => actions.applySeed(this.seedInput.value));
    this.clearSeedButton.addEventListener("click", actions.clearSeed);
    this.seedInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        actions.applySeed(this.seedInput.value);
      }
    });
  }

  update(model: GameViewModel, activeSeed: string | null): void {
    const interactive = model.phase === "idle";
    this.creditsValue.textContent = String(model.credits);
    this.betValue.textContent = String(model.bet);
    this.lastWinValue.textContent = String(model.lastWin);
    this.phaseValue.textContent = model.phase;

    this.spinButton.disabled = !interactive || model.credits < model.bet;
    this.decreaseButton.disabled = !interactive || model.bet <= GAME_CONFIG.minimumBet;
    this.increaseButton.disabled = !interactive || model.bet >= GAME_CONFIG.maximumBet;
    this.resetButton.disabled = !interactive;
    this.seedInput.disabled = !interactive;
    this.applySeedButton.disabled = !interactive;
    this.clearSeedButton.disabled = !interactive || activeSeed === null;
    this.seedStatus.textContent = activeSeed === null
      ? "Using browser crypto randomness."
      : `Using deterministic seed: ${activeSeed}`;
  }

  isQuickSpinEnabled(): boolean {
    return this.quickSpinInput.checked;
  }
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required element #${id} was not found`);
  }
  return element as T;
}
