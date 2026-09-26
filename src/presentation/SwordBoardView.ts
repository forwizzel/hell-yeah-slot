import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { GAME_CONFIG } from "../config/gameConfig";
import type { BonusSymbolId, CardSymbolId, SymbolWin, WaysCell, WaysGrid } from "../core/types";
import {
  REEL_LOCK_SOUND_PREROLL_MS,
  reelLockFlashAlpha,
  reelLockImpactDurationMs,
  reelLockImpactOffset,
} from "./ReelLockImpact";
import { activePayingCellGroupIndex, allPayingPositionKeys, createPayingCellGroups, positionKey, type PayingCellGroup } from "./PayingCells";

const WIDTH = 750;
const HEIGHT = 600;
const COLUMNS = 5;
const ROWS = 6;
const GAP = 4;
const MARGIN = 8;
const SYMBOL_SCALE = 0.98;
const FOCUS_GROUP_DURATION_MS = 620;
const FOCUS_COLORS = [0xffc55c, 0x79c9ba, 0xf5e4bc, 0xdf6551] as const;

type CellAsset = CardSymbolId | BonusSymbolId | "WILD";

const CELL_ASSET_PATHS: Record<CellAsset, string> = {
  "10": new URL("../../graphics/10.png", import.meta.url).href,
  J: new URL("../../graphics/J.png", import.meta.url).href,
  Q: new URL("../../graphics/Q.png", import.meta.url).href,
  K: new URL("../../graphics/K.png", import.meta.url).href,
  A: new URL("../../graphics/A.png", import.meta.url).href,
  GUN: new URL("../../graphics/GUN.png", import.meta.url).href,
  KNIGHT: new URL("../../graphics/KNIGHT.png", import.meta.url).href,
  WILD: new URL("../../graphics/WILD.png", import.meta.url).href,
  BEER: new URL("../../graphics/BEER.png", import.meta.url).href,
  CIGARETTE: new URL("../../graphics/CIGARETTE.png", import.meta.url).href,
  SWORD: new URL("../../graphics/SWORD.png", import.meta.url).href,
};
const CHAIN_OVERLAY_PATH = new URL("../../graphics/CHAIN_OVERLAY.png", import.meta.url).href;

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
  readonly winFocus: Graphics;
}

interface ColumnVisual {
  readonly track: Container;
  readonly cells: CellVisual[];
  readonly impactFlash: Graphics;
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
  soundTriggered: boolean;
  impactStartedAt: number | null;
  impactDurationMs: number;
  cycleIndex: number;
}

interface ActiveAnimation {
  readonly settle: () => void;
  readonly setTurbo: (enabled: boolean) => void;
}

export class SwordBoardView {
  private readonly columns: ColumnVisual[] = [];
  private activeAnimation: ActiveAnimation | null = null;
  private lockedRowsOverlay: Graphics | null = null;
  private lockedRowsChains: Container | null = null;
  private hasEnteringCell = false;
  private cellWidth = 0;
  private cellHeight = 0;
  private focusActive = false;
  private focusStartedAt = 0;
  private focusGroups: ReadonlyArray<PayingCellGroup> = [];
  private payingKeys: ReadonlySet<string> = new Set();
  private activeFocusGroup = -1;
  private focusUnlockedRows = ROWS;

  private constructor(
    private readonly application: Application,
    private readonly textures: ReadonlyMap<CellAsset, Texture>,
    private readonly chainOverlayTexture: Texture,
  ) {
    this.application.ticker.add(() => this.updateWinFocus());
  }

  static async create(host: HTMLElement): Promise<SwordBoardView> {
    const [textureEntries, chainOverlayTexture] = await Promise.all([
      Promise.all(
        Object.entries(CELL_ASSET_PATHS).map(async ([asset, path]) => [
          asset as CellAsset,
          await Assets.load<Texture>(path),
        ] as const),
      ),
      Assets.load<Texture>(CHAIN_OVERLAY_PATH),
    ]);
    const application = new Application();
    await application.init({ width: WIDTH, height: HEIGHT, backgroundColor: 0x111819, antialias: true });
    application.canvas.setAttribute("role", "img");
    host.append(application.canvas);
    return new SwordBoardView(application, new Map(textureEntries), chainOverlayTexture);
  }

  render(grid: WaysGrid, unlockedRows: number, winningWins: ReadonlyArray<SymbolWin> = []): void {
    validateGrid(grid);
    validateUnlockedRows(unlockedRows);
    this.buildGrid(false);
    this.clearWinFocus();
    this.drawLockedRows(unlockedRows);
    for (const column of this.columns) {
      column.track.y = 0;
      column.impactFlash.alpha = 0;
    }
    for (let row = 0; row < grid.length; row += 1) {
      for (let column = 0; column < COLUMNS; column += 1) {
        this.drawCell(row, column, grid[row]![column]!);
      }
    }
    this.applyWinFocus(createPayingCellGroups(winningWins), unlockedRows);
    this.application.canvas.setAttribute("aria-label", swordBoardAriaLabel(grid, unlockedRows));
  }

  renderPlaceholder(unlockedRows: number): void {
    validateUnlockedRows(unlockedRows);
    this.buildGrid(false);
    this.clearWinFocus();
    this.drawLockedRows(unlockedRows);
    for (const column of this.columns) {
      column.track.y = 0;
      column.impactFlash.alpha = 0;
      for (const cell of column.cells) {
        cell.box.clear().roundRect(0, 0, this.cellWidth, this.cellHeight, 2).fill(0x28302d);
        cell.sprite.texture = Texture.EMPTY;
      }
    }
    this.application.canvas.setAttribute(
      "aria-label",
      `Sword Cleave board, five columns by six rows. Bottom ${unlockedRows} rows are unlocked. Awaiting spin.`,
    );
  }

  setTurboEnabled(enabled: boolean): void {
    this.activeAnimation?.setTurbo(enabled);
  }

  settleActiveSpin(): void {
    this.activeAnimation?.settle();
  }

  animateSpin(
    result: WaysGrid,
    unlockedRows: number,
    turboEnabled: boolean,
    onColumnLocked?: (column: number) => void,
    reduceMotion = false,
  ): Promise<void> {
    validateGrid(result);
    validateUnlockedRows(unlockedRows);
    if (reduceMotion) {
      this.render(result, unlockedRows);
      for (let column = 0; column < COLUMNS; column += 1) {
        onColumnLocked?.(column);
      }
      return Promise.resolve();
    }
    this.buildGrid(true);
    this.clearWinFocus();
    this.drawLockedRows(unlockedRows);
    const pitch = this.cellHeight + GAP;
    const normalDuration = GAME_CONFIG.normalSpinDurationMs;
    const quickDuration = GAME_CONFIG.quickSpinDurationMs;
    this.columns.forEach((column, columnIndex) => {
      column.cells.forEach((cell, row) => {
        this.drawCellVisual(cell, CYCLE_CELLS[(columnIndex + row) % CYCLE_CELLS.length]!);
      });
    });
    const states: SpinState[] = this.columns.map((_column, index) => ({
      stepStartedAt: 0,
      stepDuration: 92,
      settling: false,
      settleStartY: 0,
      settleStartVelocity: 0,
      finalQueue: Array.from({ length: result.length }, (_, row) => result[result.length - row - 1]![index]!),
      finalSequenceStarted: false,
      finalSequenceComplete: false,
      locked: false,
      soundTriggered: false,
      impactStartedAt: null,
      impactDurationMs: 0,
      cycleIndex: index,
    }));

    return new Promise((resolve) => {
      let turbo = turboEnabled;
      let virtualElapsed = 0;
      let lastFrameTime = performance.now();
      let animationFrame = 0;
      let complete = false;
      const finish = (): void => {
        if (complete) {
          return;
        }
        complete = true;
        cancelAnimationFrame(animationFrame);
        this.render(result, unlockedRows);
        for (let column = 0; column < COLUMNS; column += 1) {
          const state = states[column];
          if (state !== undefined && !state.soundTriggered) {
            state.soundTriggered = true;
            onColumnLocked?.(column);
          }
          if (state !== undefined && !state.locked) {
            state.locked = true;
          }
        }
        this.activeAnimation = null;
        resolve();
      };
      this.activeAnimation = {
        settle: finish,
        setTurbo: (enabled) => { turbo = enabled; },
      };
      const frame = (now: number): void => {
        const realDelta = now - lastFrameTime;
        lastFrameTime = now;
        virtualElapsed += realDelta * (turbo ? normalDuration / quickDuration : 1);
        const elapsed = Math.min(virtualElapsed, normalDuration);
        for (let column = 0; column < COLUMNS; column += 1) {
          const visual = this.columns[column];
          const state = states[column];
          if (visual === undefined || state === undefined) {
            throw new Error("Sword animation column was not initialized");
          }
          if (state.locked) {
            updateColumnLockImpact(visual, state, now);
            continue;
          }

          const stopTime = normalDuration * (0.55 + ((column + 1) / COLUMNS) * 0.45);
          const settleDuration = Math.min(320, stopTime * 0.35);
          const settleStart = stopTime - settleDuration;
          const soundPreroll = REEL_LOCK_SOUND_PREROLL_MS * (turbo ? normalDuration / quickDuration : 1);
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
                state.stepDuration = Math.min(state.stepDuration * 1.22, turbo ? 86 : 220);
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

          if (elapsed >= stopTime - soundPreroll && !state.soundTriggered) {
            state.soundTriggered = true;
            onColumnLocked?.(column);
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
              state.impactStartedAt = now;
              state.impactDurationMs = reelLockImpactDurationMs(turbo);
              updateColumnLockImpact(visual, state, now);
            }
          }
        }

        const impactActive = states.some((state) => state.impactStartedAt !== null);
        if (elapsed < normalDuration || impactActive) {
          animationFrame = requestAnimationFrame(frame);
        } else {
          finish();
        }
      };
      animationFrame = requestAnimationFrame(frame);
    });
  }

  private buildGrid(includeEnteringCell: boolean): void {
    if (this.columns.length > 0 && this.hasEnteringCell === includeEnteringCell) {
      return;
    }

    this.application.stage.removeChildren();
    this.columns.length = 0;
    this.lockedRowsOverlay = null;
    this.lockedRowsChains = null;
    this.hasEnteringCell = includeEnteringCell;
    const maximumCellHeight = (HEIGHT - MARGIN * 2 - GAP * (ROWS - 1)) / ROWS;
    this.cellHeight = maximumCellHeight;
    this.cellWidth = maximumCellHeight;
    const reelHeight = ROWS * this.cellHeight + (ROWS - 1) * GAP;
    const reelWidth = COLUMNS * this.cellWidth + (COLUMNS - 1) * GAP;
    const startX = (WIDTH - reelWidth) / 2;

    for (let column = 0; column < COLUMNS; column += 1) {
      const viewport = new Container({ x: startX + column * (this.cellWidth + GAP), y: MARGIN });
      const mask = new Graphics().rect(0, 0, this.cellWidth, reelHeight).fill(0xffffff);
      const track = new Container();
      const impactFlash = new Graphics()
        .roundRect(1, 1, this.cellWidth - 2, reelHeight - 2, 3)
        .fill({ color: 0xe7a53a, alpha: 0.18 })
        .stroke({ color: 0xffcf71, width: 4, alpha: 0.9 });
      impactFlash.alpha = 0;
      const cells: CellVisual[] = [];
      viewport.addChild(mask, track, impactFlash);
      viewport.mask = mask;
      this.application.stage.addChild(viewport);
      for (let row = 0; row < ROWS + (includeEnteringCell ? 1 : 0); row += 1) {
        const visual = this.createCellVisual(track, row);
        cells.push(visual);
      }
      this.columns.push({ track, cells, impactFlash });
    }
    this.lockedRowsOverlay = new Graphics();
    this.lockedRowsChains = new Container();
    this.application.stage.addChild(this.lockedRowsOverlay, this.lockedRowsChains);
  }

  private drawLockedRows(unlockedRows: number): void {
    const overlay = this.lockedRowsOverlay;
    const chains = this.lockedRowsChains;
    if (overlay === null || chains === null) {
      throw new Error("Sword locked-row layers were not initialized");
    }
    const lockedRows = ROWS - unlockedRows;
    const reelWidth = COLUMNS * this.cellWidth + (COLUMNS - 1) * GAP;
    const startX = (WIDTH - reelWidth) / 2;
    const pitch = this.cellHeight + GAP;
    overlay.clear();
    for (const chain of chains.removeChildren()) {
      chain.destroy();
    }
    if (lockedRows > 0) {
      overlay
        .rect(startX, MARGIN, reelWidth, lockedRows * pitch - GAP)
        .fill({ color: 0x000000, alpha: 0.62 });
      for (let row = 0; row < lockedRows; row += 1) {
        const chain = new Sprite(this.chainOverlayTexture);
        chain.position.set(startX, MARGIN + row * pitch);
        chain.width = reelWidth;
        chain.height = this.cellHeight;
        chains.addChild(chain);
      }
    }
  }

  private createCellVisual(parent: Container, row: number): CellVisual {
    const container = new Container({ y: row * (this.cellHeight + GAP) });
    const box = new Graphics();
    const sprite = new Sprite(Texture.EMPTY);
    const winFocus = new Graphics()
      .roundRect(3, 3, this.cellWidth - 6, this.cellHeight - 6, 2)
      .fill({ color: 0xffc55c, alpha: 0.72 });
    winFocus.visible = false;
    sprite.anchor.set(0.5);
    sprite.position.set(this.cellWidth / 2, this.cellHeight / 2);
    container.addChild(box, sprite, winFocus);
    parent.addChild(container);
    return { container, box, sprite, winFocus };
  }

  private drawCell(row: number, column: number, cell: WaysCell): void {
    const visual = this.columns[column]?.cells[row];
    if (visual === undefined) {
      throw new Error("Sword board cell was not initialized");
    }
    this.drawCellVisual(visual, cell);
  }

  private drawCellVisual(visual: CellVisual, cell: WaysCell): void {
    visual.box
      .clear()
      .roundRect(0, 0, this.cellWidth, this.cellHeight, 2)
      .fill(0x111819);
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
    visual.sprite.scale.set(Math.min((this.cellWidth * SYMBOL_SCALE) / texture.width, (this.cellHeight * SYMBOL_SCALE) / texture.height));
  }

  private applyWinFocus(groups: ReadonlyArray<PayingCellGroup>, unlockedRows: number): void {
    if (groups.length === 0) {
      return;
    }
    this.focusActive = true;
    this.focusStartedAt = performance.now();
    this.focusGroups = groups;
    this.payingKeys = allPayingPositionKeys(groups);
    this.activeFocusGroup = -1;
    this.focusUnlockedRows = unlockedRows;
    this.setActiveFocusGroup(0, unlockedRows);
  }

  private setActiveFocusGroup(index: number, unlockedRows: number): void {
    const group = this.focusGroups[index];
    if (group === undefined) {
      throw new Error("Sword paying-cell focus group was not initialized");
    }
    const color = FOCUS_COLORS[index % FOCUS_COLORS.length]!;
    this.activeFocusGroup = index;
    for (let column = 0; column < COLUMNS; column += 1) {
      const visual = this.columns[column];
      if (visual === undefined) {
        throw new Error("Sword board column was not initialized");
      }
      for (let row = 0; row < ROWS; row += 1) {
        const cell = visual.cells[row];
        if (cell === undefined) {
          throw new Error("Sword board cell was not initialized");
        }
        if (row < ROWS - unlockedRows) {
          cell.container.alpha = 1;
          cell.winFocus.visible = false;
          continue;
        }
        const key = positionKey({ row, column });
        const paying = this.payingKeys.has(key);
        const active = group.keys.has(key);
        cell.container.alpha = active ? 1 : paying ? 0.68 : 0.36;
        cell.winFocus.visible = active;
        if (active) {
          this.drawWinFocus(cell, color);
        }
      }
    }
  }

  private clearWinFocus(): void {
    this.focusActive = false;
    this.focusGroups = [];
    this.payingKeys = new Set();
    this.activeFocusGroup = -1;
    this.focusUnlockedRows = ROWS;
    for (const column of this.columns) {
      for (const cell of column.cells) {
        cell.container.alpha = 1;
        cell.winFocus.visible = false;
      }
    }
  }

  private updateWinFocus(): void {
    if (!this.focusActive) {
      return;
    }
    const group = activePayingCellGroupIndex(
      this.focusGroups.length,
      performance.now() - this.focusStartedAt,
      FOCUS_GROUP_DURATION_MS,
    );
    if (group !== this.activeFocusGroup) {
      this.setActiveFocusGroup(group, this.focusUnlockedRows);
    }
    const pulse = (Math.sin((performance.now() - this.focusStartedAt) / 180) + 1) / 2;
    for (const column of this.columns) {
      for (const cell of column.cells) {
        if (cell.winFocus.visible) {
          cell.winFocus.alpha = 0.36 + pulse * 0.56;
        }
      }
    }
  }

  private drawWinFocus(cell: CellVisual, color: number): void {
    cell.winFocus
      .clear()
      .roundRect(3, 3, this.cellWidth - 6, this.cellHeight - 6, 2)
      .fill({ color, alpha: 0.72 });
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
  if (grid.length !== ROWS
    || grid.some((row) => row.length !== COLUMNS || row.some((cell) => cell.kind === "blank"))) {
    throw new Error("Sword board must contain six non-blank rows and five columns");
  }
}

function validateUnlockedRows(unlockedRows: number): void {
  if (!Number.isInteger(unlockedRows) || unlockedRows < 3 || unlockedRows > ROWS) {
    throw new Error("Sword board must have three through six unlocked rows");
  }
}

function swordBoardAriaLabel(grid: WaysGrid, unlockedRows: number): string {
  const lockedRows = ROWS - unlockedRows;
  const rows = grid.map((row, index) =>
    `Row ${index + 1}${index < lockedRows ? " locked" : " unlocked"}: ${row.map(cellLabel).join(", ")}`,
  );
  return `Sword Cleave board, five columns by six rows. ${rows.join(". ")}.`;
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

function updateColumnLockImpact(column: ColumnVisual, state: SpinState, now: number): void {
  if (state.impactStartedAt === null) {
    column.track.y = 0;
    column.impactFlash.alpha = 0;
    return;
  }
  const progress = Math.min((now - state.impactStartedAt) / Math.max(state.impactDurationMs, 1), 1);
  column.track.y = reelLockImpactOffset(progress);
  column.impactFlash.alpha = reelLockFlashAlpha(progress);
  if (progress === 1) {
    state.impactStartedAt = null;
  }
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
