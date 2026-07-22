import { GAME_CONFIG } from "../config/gameConfig";
import type { BonusRespinResult, BonusState, GameViewModel, Grid } from "../core/types";
import { ControlPanel, type ControlActions } from "./ControlPanel";
import { EventLogView } from "./EventLogView";
import { ReelGridView } from "./ReelGridView";

export class GameView {
  private readonly controls = new ControlPanel();
  private readonly log = new EventLogView(requiredElement<HTMLOListElement>("event-log"), GAME_CONFIG.recentEventLimit);
  private readonly bonusStatus = requiredElement<HTMLElement>("bonus-status");

  private constructor(private readonly reels: ReelGridView) {}

  static async create(): Promise<GameView> {
    const reels = await ReelGridView.create(requiredElement<HTMLElement>("reel-grid"));
    return new GameView(reels);
  }

  bindControls(actions: ControlActions): void {
    this.controls.bind(actions);
  }

  render(model: GameViewModel, activeSeed: string | null): void {
    this.controls.update(model, activeSeed);
    if (model.bonus !== null && model.phase !== "idle") {
      this.reels.renderBonus(model.bonus);
      const locked = model.bonus.cells.filter((cell) => cell !== null).length;
      this.bonusStatus.textContent = `Locked ${locked}/15 | Respins ${model.bonus.remainingRespins}`;
      return;
    }

    this.reels.renderGrid(model.grid, model.winningPositions);
    if (model.bonusSummary === null) {
      this.bonusStatus.textContent = "Bonus inactive";
    } else {
      const filledText = model.bonusSummary.filled ? " | Grid filled" : "";
      this.bonusStatus.textContent = `Last bonus: ${model.bonusSummary.symbolCount} symbols | Award ${model.bonusSummary.payout}${filledText}`;
    }
  }

  animateBaseSpin(result: Grid, durationMs: number): Promise<void> {
    return this.reels.animateBaseSpin(result, durationMs);
  }

  animateBonusIntro(state: BonusState, durationMs: number): Promise<void> {
    return this.reels.animateBonusIntro(state, durationMs);
  }

  animateBonusRespin(previousState: BonusState, result: BonusRespinResult, durationMs: number): Promise<void> {
    return this.reels.animateBonusRespin(previousState, result, durationMs);
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
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required element #${id} was not found`);
  }
  return element as T;
}
