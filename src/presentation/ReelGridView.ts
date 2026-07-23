import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { GAME_CONFIG } from "../config/gameConfig";
import { REEL_STRIPS } from "../config/reelStrips";
import type { CardSymbolId, BonusSymbolId, Cell, Grid, Position } from "../core/types";
import { ReelStripCycle } from "./ReelStripCycle";

const WIDTH = 750;
const HEIGHT = 450;
const GAP = 4;
const MARGIN = 8;
const CELL_WIDTH = (WIDTH - MARGIN * 2 - GAP * (GAME_CONFIG.columns - 1)) / GAME_CONFIG.columns;
const CELL_HEIGHT = (HEIGHT - MARGIN * 2 - GAP * (GAME_CONFIG.rows - 1)) / GAME_CONFIG.rows;
type CellAsset = CardSymbolId | BonusSymbolId | "WILD";

const CELL_ASSET_PATHS: Record<CellAsset, string> = {
  "10": new URL("../../graphics/10.png", import.meta.url).href,
  J: new URL("../../graphics/J.png", import.meta.url).href,
  Q: new URL("../../graphics/Q.png", import.meta.url).href,
  K: new URL("../../graphics/K.png", import.meta.url).href,
  A: new URL("../../graphics/A.png", import.meta.url).href,
  COIN: new URL("../../graphics/COIN.png", import.meta.url).href,
  SKULL: new URL("../../graphics/SKULL.png", import.meta.url).href,
  WILD: new URL("../../graphics/WILD.png", import.meta.url).href,
  BEER: new URL("../../graphics/BEER.png", import.meta.url).href,
  CIGARETTE: new URL("../../graphics/CIGARETTE.png", import.meta.url).href,
  SWORD: new URL("../../graphics/SWORD.png", import.meta.url).href,
};

interface CellVisual {
  readonly container: Container;
  readonly box: Graphics;
  readonly sprite: Sprite;
}

interface ReelVisual {
  readonly track: Container;
  readonly cells: CellVisual[];
}

interface ReelSpinState {
  stepStartedAt: number;
  stepDuration: number;
  settling: boolean;
  settleStartY: number;
  settleStartVelocity: number;
  finalQueue: Cell[];
  finalSequenceStarted: boolean;
  finalSequenceComplete: boolean;
  locked: boolean;
  readonly stripCycle: ReelStripCycle;
}

type CellStyle = "card" | "wild" | "beer" | "cigarette" | "sword";

interface CellAppearance {
  readonly fill: number;
}

const CELL_APPEARANCES: Record<CellStyle, CellAppearance> = {
  card: {
    fill: 0xfffbec,
  },
  wild: {
    fill: 0x202b31,
  },
  beer: {
    fill: 0xf2bd52,
  },
  cigarette: {
    fill: 0xf4e8dc,
  },
  sword: {
    fill: 0xc9d9dc,
  },
};

export class ReelGridView {
  private readonly reels: ReelVisual[] = [];

  private constructor(
    private readonly application: Application,
    private readonly textures: ReadonlyMap<CellAsset, Texture>,
  ) {
    const reelHeight = GAME_CONFIG.rows * CELL_HEIGHT + (GAME_CONFIG.rows - 1) * GAP;
    for (let column = 0; column < GAME_CONFIG.columns; column += 1) {
      const viewport = new Container({
        x: MARGIN + column * (CELL_WIDTH + GAP),
        y: MARGIN,
      });
      const mask = new Graphics().rect(0, 0, CELL_WIDTH, reelHeight).fill(0xffffff);
      const track = new Container();
      const reelCells: CellVisual[] = [];

      viewport.addChild(mask, track);
      viewport.mask = mask;
      this.application.stage.addChild(viewport);

      for (let row = 0; row <= GAME_CONFIG.rows; row += 1) {
        const visual = this.createCellVisual(track, row);
        reelCells.push(visual);
      }
      this.reels.push({ track, cells: reelCells });
    }
  }

  static async create(host: HTMLElement): Promise<ReelGridView> {
    const textureEntries = await Promise.all(
      Object.entries(CELL_ASSET_PATHS).map(async ([asset, path]) => [
        asset as CellAsset,
        await Assets.load<Texture>(path),
      ] as const),
    );
    const application = new Application();
    await application.init({ width: WIDTH, height: HEIGHT, backgroundColor: 0x111819, antialias: true });
    application.canvas.setAttribute("aria-label", "Three row by five column slot grid");
    application.canvas.setAttribute("role", "img");
    host.append(application.canvas);
    return new ReelGridView(application, new Map(textureEntries));
  }

  renderGrid(grid: Grid, winningPositions: ReadonlyArray<Position> = []): void {
    validateGrid(grid);
    const winningKeys = new Set(winningPositions.map((position) => `${position.row}:${position.column}`));
    for (let row = 0; row < GAME_CONFIG.rows; row += 1) {
      for (let column = 0; column < GAME_CONFIG.columns; column += 1) {
        const cell = grid[row]![column]!;
        this.drawCell(row, column, cell, winningKeys.has(`${row}:${column}`), false);
      }
    }
    this.application.canvas.setAttribute("aria-label", gridAriaLabel(grid));
  }

  animateBaseSpin(result: Grid, durationMs: number, onColumnLocked?: (column: number) => void): Promise<void> {
    validateGrid(result);
    if (durationMs <= 0 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      this.renderGrid(result);
      return Promise.resolve();
    }

    const startTime = performance.now();
    const quickSpin = durationMs <= GAME_CONFIG.quickSpinDurationMs;
    const stepDuration = quickSpin
      ? GAME_CONFIG.quickReelStepDurationMs
      : GAME_CONFIG.normalReelStepDurationMs;
    const spinStates: ReelSpinState[] = this.reels.map((_reel, column) => ({
      stepStartedAt: 0,
      stepDuration,
      settling: false,
      settleStartY: 0,
      settleStartVelocity: 0,
      finalQueue: [
        result[GAME_CONFIG.rows - 1]![column]!,
        result[GAME_CONFIG.rows - 2]![column]!,
        result[GAME_CONFIG.rows - 3]![column]!,
      ],
      finalSequenceStarted: false,
      finalSequenceComplete: false,
      locked: false,
      stripCycle: createStripCycle(column),
    }));

    return new Promise((resolve) => {
      const frame = (now: number): void => {
        const elapsed = now - startTime;

        for (let column = 0; column < GAME_CONFIG.columns; column += 1) {
          const stopTime = durationMs * (0.55 + ((column + 1) / GAME_CONFIG.columns) * 0.45);
          const reel = this.reels[column];
          const state = spinStates[column];
          if (reel === undefined) {
            throw new Error("Reel visual was not initialized");
          }
          if (state === undefined) {
            throw new Error("Reel spin state was not initialized");
          }

          const settleDuration = Math.min(GAME_CONFIG.reelSettleDurationMs, stopTime * 0.35);
          const settleStart = stopTime - settleDuration;

          if (state.stepStartedAt === 0) {
            state.stepStartedAt = elapsed;
            recycleSpinCell(reel, state, (cell, symbol) =>
              this.drawCellVisual(cell, symbol, false, true));
          }

          const spinElapsed = Math.min(elapsed, settleStart);
          while (!state.finalSequenceComplete && spinElapsed - state.stepStartedAt >= state.stepDuration) {
            state.stepStartedAt += state.stepDuration;
            if (state.finalSequenceStarted && state.finalQueue.length === 0) {
              state.finalSequenceComplete = true;
              break;
            }

            if (!state.finalSequenceStarted) {
              const decelerationProgress = clamp(
                (state.stepStartedAt - durationMs * 0.3) / Math.max(settleStart - durationMs * 0.3, 1),
                0,
                1,
              );
              const nextStepDuration = stepDuration * (1 + decelerationProgress * 1.4);
              const remainingSpinTime = settleStart - state.stepStartedAt;
              if (remainingSpinTime <= nextStepDuration + stepDuration * GAME_CONFIG.rows) {
                state.finalSequenceStarted = true;
                state.stepDuration = Math.max(remainingSpinTime / GAME_CONFIG.rows, 1);
              } else {
                state.stepDuration = nextStepDuration;
              }
            }

            recycleSpinCell(reel, state, (cell, symbol) =>
              this.drawCellVisual(cell, symbol, false, true));
          }

          if (state.finalSequenceComplete) {
            reel.track.y = 0;
          } else {
            const stepProgress = clamp((spinElapsed - state.stepStartedAt) / state.stepDuration, 0, 1);
            reel.track.y = -(CELL_HEIGHT + GAP) * (1 - stepProgress);
          }

          if (elapsed >= settleStart) {
            if (!state.settling) {
              state.settling = true;
              state.settleStartY = reel.track.y;
              state.settleStartVelocity = (CELL_HEIGHT + GAP) / state.stepDuration;
              if (quickSpin && !state.finalSequenceComplete) {
                for (let row = 0; row < GAME_CONFIG.rows; row += 1) {
                  this.drawCell(row, column, result[row]![column]!, false, true);
                }
                state.finalQueue.length = 0;
                state.finalSequenceComplete = true;
              }
              for (let row = 0; row < GAME_CONFIG.rows; row += 1) {
                this.setSpinningState(row, column, true);
              }
            }
            const settleProgress = clamp((elapsed - settleStart) / settleDuration, 0, 1);
            reel.track.y = settleTrackPosition(state.settleStartY, state.settleStartVelocity, settleDuration, settleProgress);
            if (elapsed >= stopTime && !state.locked) {
              for (let row = 0; row < GAME_CONFIG.rows; row += 1) {
                this.drawCell(row, column, result[row]![column]!, false, false);
              }
              state.locked = true;
              onColumnLocked?.(column);
            }
            continue;
          }
        }

        if (elapsed < durationMs) {
          requestAnimationFrame(frame);
        } else {
          this.renderGrid(result);
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });
  }

  wait(durationMs: number): Promise<void> {
    return wait(durationMs);
  }

  private createCellVisual(parent: Container, row: number): CellVisual {
    const container = new Container({ y: row * (CELL_HEIGHT + GAP) });
    const box = new Graphics();
    const sprite = new Sprite(Texture.EMPTY);
    sprite.anchor.set(0.5);
    sprite.position.set(CELL_WIDTH / 2, CELL_HEIGHT / 2);
    container.addChild(box, sprite);
    parent.addChild(container);
    return { container, box, sprite };
  }

  private drawCell(row: number, column: number, cell: Cell, winning: boolean, spinning: boolean): void {
    const reel = this.reels[column];
    const visual = reel?.cells[row];
    if (visual === undefined) {
      throw new Error("Cell visual was not initialized");
    }
    this.drawCellVisual(visual, cell, winning, spinning);
  }

  private setSpinningState(row: number, column: number, spinning: boolean): void {
    const reel = this.reels[column];
    const visual = reel?.cells[row];
    if (visual === undefined) {
      throw new Error("Cell visual was not initialized");
    }
    visual.container.alpha = spinning ? 0.88 : 1;
  }

  private drawCellVisual(visual: CellVisual, cell: Cell, winning: boolean, spinning: boolean): void {
    const appearance = CELL_APPEARANCES[cellStyle(cell)];
    visual.box
      .clear()
      .roundRect(0, 0, CELL_WIDTH, CELL_HEIGHT, 2)
      .fill(winning ? 0xffd889 : appearance.fill);
    visual.container.alpha = spinning ? 0.88 : 1;
    const texture = this.textures.get(cellAsset(cell));
    if (texture === undefined) {
      throw new Error(`No texture was loaded for ${cellAsset(cell)}`);
    }
    visual.sprite.texture = texture;
    visual.sprite.scale.set(Math.min((CELL_WIDTH * 0.82) / texture.width, (CELL_HEIGHT * 0.82) / texture.height));
  }
}

function cellAsset(cell: Cell): CellAsset {
  if (cell.kind === "card") {
    return cell.symbol;
  }
  if (cell.kind === "wild") {
    return "WILD";
  }
  return cell.symbol;
}

function recycleReelCell(reel: ReelVisual, draw: (cell: CellVisual) => void): void {
  const recycled = reel.cells.pop();
  if (recycled === undefined) {
    throw new Error("Reel cell was not initialized");
  }
  reel.cells.unshift(recycled);
  reel.cells.forEach((cell, row) => {
    cell.container.y = row * (CELL_HEIGHT + GAP);
  });
  draw(recycled);
}

function recycleSpinCell(
  reel: ReelVisual,
  state: ReelSpinState,
  draw: (cell: CellVisual, symbol: Cell) => void,
): void {
  const symbol = state.finalSequenceStarted ? state.finalQueue.shift() : state.stripCycle.takeNextCell();
  if (symbol === undefined) {
    throw new Error("Final reel sequence was exhausted before settling");
  }
  recycleReelCell(reel, (cell) => draw(cell, symbol));
}

function createStripCycle(column: number): ReelStripCycle {
  const strip = REEL_STRIPS[column];
  if (strip === undefined) {
    throw new Error("Animated reel strip was not configured");
  }
  return new ReelStripCycle(strip, Math.floor(Math.random() * strip.length));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function settleTrackPosition(startY: number, startVelocity: number, duration: number, progress: number): number {
  const distance = -startY;
  if (distance <= 0) {
    return 0;
  }
  const normalizedVelocity = clamp((startVelocity * duration) / distance, 0, 3);
  const cubic = (normalizedVelocity - 2) * progress ** 3
    + (3 - 2 * normalizedVelocity) * progress ** 2
    + normalizedVelocity * progress;
  return startY + distance * cubic;
}

function cellStyle(cell: Cell): CellStyle {
  if (cell.kind === "card") {
    return "card";
  }
  if (cell.kind === "wild") {
    return "wild";
  }
  switch (cell.symbol) {
    case "BEER":
      return "beer";
    case "CIGARETTE":
      return "cigarette";
    case "SWORD":
      return "sword";
  }
}

function validateGrid(grid: Grid): void {
  if (grid.length !== GAME_CONFIG.rows || grid.some((row) => row.length !== GAME_CONFIG.columns)) {
    throw new Error("Grid dimensions do not match the renderer");
  }
}

function gridAriaLabel(grid: Grid): string {
  const rows = grid.map((row, index) =>
    `Row ${index + 1}: ${row.map(accessibleCellLabel).join(", ")}`,
  );
  return `Three row by five column slot grid. ${rows.join(". ")}.`;
}

function accessibleCellLabel(cell: Cell): string {
  if (cell.kind === "wild") {
    return "WILD";
  }
  return cell.symbol;
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}
