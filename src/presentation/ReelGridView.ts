import { Application, Container, Graphics, Text } from "pixi.js";
import { GAME_CONFIG } from "../config/gameConfig";
import type { BonusRespinResult, BonusState, Cell, Grid, Position, RegularSymbolId } from "../core/types";

const WIDTH = 750;
const HEIGHT = 450;
const GAP = 8;
const MARGIN = 12;
const CELL_WIDTH = (WIDTH - MARGIN * 2 - GAP * (GAME_CONFIG.columns - 1)) / GAME_CONFIG.columns;
const CELL_HEIGHT = (HEIGHT - MARGIN * 2 - GAP * (GAME_CONFIG.rows - 1)) / GAME_CONFIG.rows;
const CYCLE_SYMBOLS: readonly RegularSymbolId[] = ["A", "B", "C", "D"];

interface CellVisual {
  readonly container: Container;
  readonly box: Graphics;
  readonly label: Text;
}

type CellStyle = "regular" | "bonus" | "empty" | "flash" | "winning" | "new";

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
            fontFamily: "Arial, sans-serif",
            fontSize: 25,
            fontWeight: "600",
            align: "center",
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
    await application.init({ width: WIDTH, height: HEIGHT, backgroundColor: 0xe4e6e5, antialias: true });
    application.canvas.setAttribute("aria-label", "Three row by five column slot grid");
    application.canvas.setAttribute("role", "img");
    host.append(application.canvas);
    return new ReelGridView(application);
  }

  renderGrid(grid: Grid, winningPositions: ReadonlyArray<Position> = []): void {
    const winningKeys = new Set(winningPositions.map((position) => `${position.row}:${position.column}`));
    for (let row = 0; row < GAME_CONFIG.rows; row += 1) {
      for (let column = 0; column < GAME_CONFIG.columns; column += 1) {
        const cell = grid[row]?.[column];
        if (cell === undefined) {
          throw new Error("Grid dimensions do not match the renderer");
        }
        const style = winningKeys.has(`${row}:${column}`)
          ? "winning"
          : cell.kind === "bonus" ? "bonus" : "regular";
        this.drawCell(row, column, cellLabel(cell), style);
      }
    }
  }

  renderBonus(state: BonusState, highlightedPositions: ReadonlyArray<Position> = []): void {
    const highlightedKeys = new Set(highlightedPositions.map((position) => `${position.row}:${position.column}`));
    for (let index = 0; index < state.cells.length; index += 1) {
      const position = this.toPosition(index);
      const cell = state.cells[index];
      if (cell === undefined) {
        throw new Error("Bonus state dimensions do not match the renderer");
      }
      const style = highlightedKeys.has(`${position.row}:${position.column}`) ? "new" : cell === null ? "empty" : "bonus";
      this.drawCell(position.row, position.column, cell === null ? "" : cellLabel(cell), style);
    }
  }

  animateBaseSpin(result: Grid, durationMs: number): Promise<void> {
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
              const cell = result[row]?.[column];
              if (cell !== undefined) {
                this.drawCell(row, column, cellLabel(cell), cell.kind === "bonus" ? "bonus" : "regular");
              }
            } else if (cycle !== lastCycle) {
              const symbol = CYCLE_SYMBOLS[(cycle + row + column) % CYCLE_SYMBOLS.length]!;
              this.drawCell(row, column, symbol, "flash");
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

  async animateBonusIntro(state: BonusState, durationMs: number): Promise<void> {
    this.renderBonus(state);
    await wait(durationMs);
  }

  async animateBonusRespin(
    previousState: BonusState,
    result: BonusRespinResult,
    durationMs: number,
  ): Promise<void> {
    const cycles = 4;
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      this.renderBonusPreview(previousState, cycle % 2 === 0);
      await wait(durationMs / cycles);
    }
    this.renderBonus(result.state, result.newPositions);
  }

  wait(durationMs: number): Promise<void> {
    return wait(durationMs);
  }

  private renderBonusPreview(state: BonusState, flash: boolean): void {
    for (let index = 0; index < state.cells.length; index += 1) {
      const position = this.toPosition(index);
      const cell = state.cells[index];
      if (cell === undefined) {
        throw new Error("Bonus state dimensions do not match the renderer");
      }
      if (cell === null) {
        this.drawCell(position.row, position.column, flash ? "..." : "", flash ? "flash" : "empty");
      } else {
        this.drawCell(position.row, position.column, cellLabel(cell), "bonus");
      }
    }
  }

  private drawCell(row: number, column: number, text: string, style: CellStyle): void {
    const visual = this.cells[row * GAME_CONFIG.columns + column];
    if (visual === undefined) {
      throw new Error("Cell visual was not initialized");
    }

    const fill = style === "bonus" || style === "new" ? 0xc9cdcb : style === "flash" ? 0xd5d8d7 : 0xf1f2f1;
    const border = style === "winning" ? 0x202425 : style === "new" ? 0x454b4d : 0x777d7e;
    const borderWidth = style === "winning" || style === "new" ? 5 : 2;
    visual.box.clear().rect(0, 0, CELL_WIDTH, CELL_HEIGHT).fill(fill).stroke({ color: border, width: borderWidth });
    visual.label.text = text;
    visual.label.style.fontWeight = style === "bonus" || style === "new" ? "700" : "600";
  }

  private toPosition(index: number): Position {
    return { row: Math.floor(index / GAME_CONFIG.columns), column: index % GAME_CONFIG.columns };
  }
}

function cellLabel(cell: Cell): string {
  return cell.kind === "bonus" ? `BONUS ${cell.value}` : cell.symbol;
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}
