import { Application, Container, Graphics, Text } from "pixi.js";
import { GAME_CONFIG } from "../config/gameConfig";
import type { Cell, Grid, Position } from "../core/types";

const WIDTH = 750;
const HEIGHT = 450;
const GAP = 8;
const MARGIN = 12;
const CELL_WIDTH = (WIDTH - MARGIN * 2 - GAP * (GAME_CONFIG.columns - 1)) / GAME_CONFIG.columns;
const CELL_HEIGHT = (HEIGHT - MARGIN * 2 - GAP * (GAME_CONFIG.rows - 1)) / GAME_CONFIG.rows;
const CYCLE_CELLS = [
  { kind: "card", symbol: "10" },
  { kind: "card", symbol: "J" },
  { kind: "card", symbol: "Q" },
  { kind: "card", symbol: "K" },
  { kind: "card", symbol: "A" },
  { kind: "wild" },
  { kind: "bonus", symbol: "BEER" },
  { kind: "bonus", symbol: "CIGARETTE" },
  { kind: "bonus", symbol: "SWORD" },
] as const satisfies readonly Cell[];

interface CellVisual {
  readonly container: Container;
  readonly box: Graphics;
  readonly label: Text;
}

type CellStyle = "card" | "wild" | "beer" | "cigarette" | "sword";

interface CellAppearance {
  readonly fill: number;
  readonly border: number;
  readonly text: number;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: "700" | "800" | "900";
  readonly letterSpacing: number;
}

const CELL_APPEARANCES: Record<CellStyle, CellAppearance> = {
  card: {
    fill: 0xfffbec,
    border: 0x39362f,
    text: 0x211f1b,
    fontFamily: "Georgia, serif",
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: 0,
  },
  wild: {
    fill: 0x202b31,
    border: 0xe7b84b,
    text: 0xfff3cf,
    fontFamily: "Arial, sans-serif",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
  },
  beer: {
    fill: 0xf2bd52,
    border: 0x704719,
    text: 0x40280e,
    fontFamily: "Arial, sans-serif",
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: 1,
  },
  cigarette: {
    fill: 0xf4e8dc,
    border: 0xa34531,
    text: 0x752d24,
    fontFamily: "Arial Narrow, Arial, sans-serif",
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: 0,
  },
  sword: {
    fill: 0xc9d9dc,
    border: 0x38525b,
    text: 0x203b45,
    fontFamily: "Arial, sans-serif",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 1,
  },
};

export class ReelGridView {
  private readonly cells: CellVisual[] = [];

  private constructor(private readonly application: Application) {
    for (let row = 0; row < GAME_CONFIG.rows; row += 1) {
      for (let column = 0; column < GAME_CONFIG.columns; column += 1) {
        const container = new Container({
          x: MARGIN + column * (CELL_WIDTH + GAP),
          y: MARGIN + row * (CELL_HEIGHT + GAP),
        });
        const box = new Graphics();
        const label = new Text({
          text: "",
          style: {
            fill: 0x181b1d,
            fontFamily: "Georgia, serif",
            fontSize: 38,
            fontWeight: "800",
            align: "center",
            lineHeight: 27,
          },
        });
        label.anchor.set(0.5);
        label.position.set(CELL_WIDTH / 2, CELL_HEIGHT / 2);
        container.addChild(box, label);
        this.application.stage.addChild(container);
        this.cells.push({ container, box, label });
      }
    }
  }

  static async create(host: HTMLElement): Promise<ReelGridView> {
    const application = new Application();
    await application.init({ width: WIDTH, height: HEIGHT, backgroundColor: 0x202427, antialias: true });
    application.canvas.setAttribute("aria-label", "Three row by five column slot grid");
    application.canvas.setAttribute("role", "img");
    host.append(application.canvas);
    return new ReelGridView(application);
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

  animateBaseSpin(result: Grid, durationMs: number): Promise<void> {
    validateGrid(result);
    if (durationMs <= 0 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      this.renderGrid(result);
      return Promise.resolve();
    }

    const startTime = performance.now();
    let lastCycle = -1;

    return new Promise((resolve) => {
      const frame = (now: number): void => {
        const elapsed = now - startTime;
        const cycle = Math.floor(elapsed / 55);

        for (let column = 0; column < GAME_CONFIG.columns; column += 1) {
          const stopTime = durationMs * (0.55 + ((column + 1) / GAME_CONFIG.columns) * 0.45);
          for (let row = 0; row < GAME_CONFIG.rows; row += 1) {
            if (elapsed >= stopTime) {
              this.drawCell(row, column, result[row]![column]!, false, false);
            } else if (cycle !== lastCycle) {
              const cell = CYCLE_CELLS[(cycle + row * 2 + column) % CYCLE_CELLS.length]!;
              this.drawCell(row, column, cell, false, true);
            }
          }
        }
        lastCycle = cycle;

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

  private drawCell(row: number, column: number, cell: Cell, winning: boolean, spinning: boolean): void {
    const visual = this.cells[row * GAME_CONFIG.columns + column];
    if (visual === undefined) {
      throw new Error("Cell visual was not initialized");
    }

    const appearance = CELL_APPEARANCES[cellStyle(cell)];
    visual.box
      .clear()
      .roundRect(0, 0, CELL_WIDTH, CELL_HEIGHT, 7)
      .fill(appearance.fill)
      .stroke({ color: winning ? 0xffd35c : appearance.border, width: winning ? 7 : 3 });
    visual.container.alpha = spinning ? 0.88 : 1;
    visual.label.text = cellLabel(cell);
    visual.label.style.fill = appearance.text;
    visual.label.style.fontFamily = appearance.fontFamily;
    visual.label.style.fontSize = appearance.fontSize;
    visual.label.style.fontWeight = appearance.fontWeight;
    visual.label.style.letterSpacing = appearance.letterSpacing;
  }
}

function cellLabel(cell: Cell): string {
  if (cell.kind === "card") {
    return cell.symbol;
  }
  if (cell.kind === "wild") {
    return "WILD";
  }
  return cell.symbol === "CIGARETTE" ? "CIGA\nRETTE" : cell.symbol;
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
