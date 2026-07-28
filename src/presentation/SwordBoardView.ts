import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { BonusSymbolId, CardSymbolId, Position, WaysCell, WaysGrid } from "../core/types";

const WIDTH = 750;
const HEIGHT = 450;
const COLUMNS = 5;
const GAP = 4;
const MARGIN = 8;

type CellAsset = CardSymbolId | BonusSymbolId | "WILD";
type SwordCellStyle = "card" | "wild" | "sword";

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

const CYCLE_CELLS: readonly WaysCell[] = [
  { kind: "card", symbol: "10" },
  { kind: "card", symbol: "J" },
  { kind: "card", symbol: "Q" },
  { kind: "card", symbol: "K" },
  { kind: "card", symbol: "A" },
  { kind: "wild" },
] as const;

interface CellVisual {
  readonly container: Container;
  readonly box: Graphics;
  readonly sprite: Sprite;
}

interface ColumnVisual {
  readonly track: Container;
  readonly cells: CellVisual[];
}

interface SpinState {
  stepStartedAt: number;
  stepDuration: number;
  settling: boolean;
  settleStartY: number;
  settleStartVelocity: number;
  finalQueue: WaysCell[];
  finalSequenceStarted: boolean;
  finalSequenceComplete: boolean;
  locked: boolean;
  cycleIndex: number;
}

export class SwordBoardView {
  private readonly columns: ColumnVisual[] = [];
  private rows = 0;
  private cellWidth = 0;
  private cellHeight = 0;

  private constructor(
    private readonly application: Application,
    private readonly textures: ReadonlyMap<CellAsset, Texture>,
  ) {}

  static async create(host: HTMLElement): Promise<SwordBoardView> {
    const textureEntries = await Promise.all(
      Object.entries(CELL_ASSET_PATHS).map(async ([asset, path]) => [
        asset as CellAsset,
        await Assets.load<Texture>(path),
      ] as const),
    );
    const application = new Application();
    await application.init({ width: WIDTH, height: HEIGHT, backgroundColor: 0x111819, antialias: true });
    application.canvas.setAttribute("role", "img");
    host.append(application.canvas);
    return new SwordBoardView(application, new Map(textureEntries));
  }

  render(grid: WaysGrid, winningPositions: ReadonlyArray<Position> = []): void {
    validateGrid(grid);
    this.buildGrid(grid.length, false);
    const winningKeys = new Set(winningPositions.map((position) => `${position.row}:${position.column}`));
    for (let row = 0; row < grid.length; row += 1) {
      for (let column = 0; column < COLUMNS; column += 1) {
        this.drawCell(row, column, grid[row]![column]!, winningKeys.has(`${row}:${column}`));
      }
    }
    this.application.canvas.setAttribute("aria-label", swordBoardAriaLabel(grid));
  }

  animateSpin(result: WaysGrid, durationMs: number, onColumnLocked?: (column: number) => void): Promise<void> {
    validateGrid(result);
    if (durationMs <= 0 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      this.render(result);
      return Promise.resolve();
    }

    this.buildGrid(result.length, true);
    const pitch = this.cellHeight + GAP;
    this.columns.forEach((column, columnIndex) => {
      column.cells.forEach((cell, row) => {
        this.drawCellVisual(cell, CYCLE_CELLS[(columnIndex + row) % CYCLE_CELLS.length]!);
      });
    });
    const states: SpinState[] = this.columns.map((_column, index) => ({
      stepStartedAt: 0,
      stepDuration: durationMs <= 180 ? 52 : 92,
      settling: false,
      settleStartY: 0,
      settleStartVelocity: 0,
      finalQueue: Array.from({ length: result.length }, (_, row) => result[result.length - row - 1]![index]!),
      finalSequenceStarted: false,
      finalSequenceComplete: false,
      locked: false,
      cycleIndex: index,
    }));

    return new Promise((resolve) => {
      const startedAt = performance.now();
      const frame = (now: number): void => {
        const elapsed = now - startedAt;
        for (let column = 0; column < COLUMNS; column += 1) {
          const visual = this.columns[column];
          const state = states[column];
          if (visual === undefined || state === undefined) {
            throw new Error("Sword animation column was not initialized");
          }

          const stopTime = durationMs * (0.55 + ((column + 1) / COLUMNS) * 0.45);
          const settleDuration = Math.min(320, stopTime * 0.35);
          const settleStart = stopTime - settleDuration;
          if (state.stepStartedAt === 0) {
            state.stepStartedAt = elapsed;
            this.recycleCell(visual, state, (cell, symbol) => this.drawCellVisual(cell, symbol));
          }

          const spinElapsed = Math.min(elapsed, settleStart);
          while (!state.finalSequenceComplete && spinElapsed - state.stepStartedAt >= state.stepDuration) {
            state.stepStartedAt += state.stepDuration;
            if (state.finalSequenceStarted && state.finalQueue.length === 0) {
              state.finalSequenceComplete = true;
              break;
            }
            if (!state.finalSequenceStarted) {
              const remainingSpinTime = settleStart - state.stepStartedAt;
              if (remainingSpinTime <= state.stepDuration + state.stepDuration * result.length) {
                state.finalSequenceStarted = true;
                state.stepDuration = Math.max(remainingSpinTime / result.length, 1);
              } else {
                state.stepDuration = Math.min(state.stepDuration * 1.22, durationMs <= 180 ? 86 : 220);
              }
            }
            this.recycleCell(visual, state, (cell, symbol) => this.drawCellVisual(cell, symbol));
          }

          if (state.finalSequenceComplete) {
            visual.track.y = 0;
          } else {
            const progress = clamp((spinElapsed - state.stepStartedAt) / state.stepDuration, 0, 1);
            visual.track.y = -pitch * (1 - progress);
          }

          if (elapsed >= settleStart) {
            if (!state.settling) {
              state.settling = true;
              state.settleStartY = visual.track.y;
              state.settleStartVelocity = pitch / state.stepDuration;
            }
            const progress = clamp((elapsed - settleStart) / settleDuration, 0, 1);
            visual.track.y = settlePosition(state.settleStartY, state.settleStartVelocity, settleDuration, progress);
            if (elapsed >= stopTime && !state.locked) {
              state.locked = true;
              onColumnLocked?.(column);
            }
          }
        }

        if (elapsed < durationMs) {
          requestAnimationFrame(frame);
        } else {
          this.render(result);
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });
  }

  private buildGrid(rows: number, includeEnteringCell: boolean): void {
    if (this.rows === rows
      && this.columns.length > 0
      && this.columns[0]?.cells.length === rows + (includeEnteringCell ? 1 : 0)) {
      return;
    }

    this.application.stage.removeChildren();
    this.columns.length = 0;
    this.rows = rows;
    const maximumCellWidth = (WIDTH - MARGIN * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
    const maximumCellHeight = (HEIGHT - MARGIN * 2 - GAP * (rows - 1)) / rows;
    const cellSize = Math.min(maximumCellWidth, maximumCellHeight);
    this.cellWidth = cellSize;
    this.cellHeight = cellSize;
    const reelHeight = rows * this.cellHeight + (rows - 1) * GAP;
    const reelWidth = COLUMNS * this.cellWidth + (COLUMNS - 1) * GAP;
    const startX = (WIDTH - reelWidth) / 2;

    for (let column = 0; column < COLUMNS; column += 1) {
      const viewport = new Container({ x: startX + column * (this.cellWidth + GAP), y: MARGIN });
      const mask = new Graphics().rect(0, 0, this.cellWidth, reelHeight).fill(0xffffff);
      const track = new Container();
      const cells: CellVisual[] = [];
      viewport.addChild(mask, track);
      viewport.mask = mask;
      this.application.stage.addChild(viewport);
      for (let row = 0; row < rows + (includeEnteringCell ? 1 : 0); row += 1) {
        const visual = this.createCellVisual(track, row);
        cells.push(visual);
      }
      this.columns.push({ track, cells });
    }
  }

  private createCellVisual(parent: Container, row: number): CellVisual {
    const container = new Container({ y: row * (this.cellHeight + GAP) });
    const box = new Graphics();
    const sprite = new Sprite(Texture.EMPTY);
    sprite.anchor.set(0.5);
    sprite.position.set(this.cellWidth / 2, this.cellHeight / 2);
    container.addChild(box, sprite);
    parent.addChild(container);
    return { container, box, sprite };
  }

  private drawCell(row: number, column: number, cell: WaysCell, winning = false): void {
    const visual = this.columns[column]?.cells[row];
    if (visual === undefined) {
      throw new Error("Sword board cell was not initialized");
    }
    this.drawCellVisual(visual, cell, winning);
  }

  private drawCellVisual(visual: CellVisual, cell: WaysCell, winning = false): void {
    const style = cellStyle(cell);
    const appearance = appearances[style];
    visual.box
      .clear()
      .roundRect(0, 0, this.cellWidth, this.cellHeight, 2)
      .fill(appearance.fill);
    if (winning) {
      visual.box.stroke({ color: 0xd14b37, width: 3 });
    }
    const asset = cellAsset(cell);
    if (asset === null) {
      visual.sprite.texture = Texture.EMPTY;
      return;
    }
    const texture = this.textures.get(asset);
    if (texture === undefined) {
      throw new Error(`Sword board texture ${asset} was not loaded`);
    }
    visual.sprite.texture = texture;
    visual.sprite.scale.set(Math.min((this.cellWidth * 0.92) / texture.width, (this.cellHeight * 0.92) / texture.height));
  }

  private recycleCell(column: ColumnVisual, state: SpinState, draw: (cell: CellVisual, symbol: WaysCell) => void): void {
    const symbol = state.finalSequenceStarted
      ? state.finalQueue.shift()
      : CYCLE_CELLS[state.cycleIndex++ % CYCLE_CELLS.length]!;
    if (symbol === undefined) {
      throw new Error("Sword final animation queue was exhausted");
    }
    const recycled = column.cells.pop();
    if (recycled === undefined) {
      throw new Error("Sword animation cell was not initialized");
    }
    column.cells.unshift(recycled);
    column.cells.forEach((cell, row) => {
      cell.container.y = row * (this.cellHeight + GAP);
    });
    draw(recycled, symbol);
  }
}

const appearances: Record<SwordCellStyle, { readonly fill: number }> = {
  card: { fill: 0xfffbec },
  wild: { fill: 0xfffbec },
  sword: { fill: 0xfffbec },
};

function cellStyle(cell: WaysCell): SwordCellStyle {
  if (cell.kind === "card") {
    return "card";
  }
  if (cell.kind === "wild") {
    return "wild";
  }
  if (cell.kind === "bonus") {
    return "sword";
  }
  throw new Error("Sword board cannot contain blank cells");
}

function cellAsset(cell: WaysCell): CellAsset | null {
  if (cell.kind === "card") {
    return cell.symbol;
  }
  if (cell.kind === "wild") {
    return "WILD";
  }
  if (cell.kind === "bonus") {
    return "SWORD";
  }
  throw new Error("Sword board cannot contain blank cells");
}

function validateGrid(grid: WaysGrid): void {
  if (grid.length < 3
    || grid.length > 6
    || grid.some((row) => row.length !== COLUMNS || row.some((cell) => cell.kind === "blank"))) {
    throw new Error("Sword board must contain three through six non-blank rows and five columns");
  }
}

function swordBoardAriaLabel(grid: WaysGrid): string {
  const rows = grid.map((row, index) =>
    `Row ${index + 1}: ${row.map(cellLabel).join(", ")}`,
  );
  return `Sword Cleave board, five columns by ${grid.length} rows. ${rows.join(". ")}.`;
}

function cellLabel(cell: WaysCell): string {
  if (cell.kind === "card") {
    return cell.symbol;
  }
  if (cell.kind === "wild") {
    return "WILD";
  }
  if (cell.kind === "bonus") {
    return "SWORD";
  }
  throw new Error("Sword board cannot contain blank cells");
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function settlePosition(startY: number, startVelocity: number, duration: number, progress: number): number {
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
