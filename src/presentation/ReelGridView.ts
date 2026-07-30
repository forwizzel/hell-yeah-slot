import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { GAME_CONFIG } from "../config/gameConfig";
import { REEL_STRIPS } from "../config/reelStrips";
import { formatUsd } from "../core/formatUsd";
import type { BonusSymbolId, CardSymbolId, CashAwardSymbolId, Cell, FreeSpinCashAward, Grid, SymbolWin } from "../core/types";
import {
  REEL_LOCK_SOUND_PREROLL_MS,
  reelLockFlashAlpha,
  reelLockImpactDurationMs,
  reelLockImpactOffset,
} from "./ReelLockImpact";
import { ReelStripCycle } from "./ReelStripCycle";
import { activePayingCellGroupIndex, allPayingPositionKeys, createPayingCellGroups, positionKey, type PayingCellGroup } from "./PayingCells";

const WIDTH = 750;
const HEIGHT = 450;
const GAP = 4;
const MARGIN = 8;
const CELL_WIDTH = (WIDTH - MARGIN * 2 - GAP * (GAME_CONFIG.columns - 1)) / GAME_CONFIG.columns;
const CELL_HEIGHT = (HEIGHT - MARGIN * 2 - GAP * (GAME_CONFIG.rows - 1)) / GAME_CONFIG.rows;
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

interface CellVisual {
  readonly container: Container;
  readonly box: Graphics;
  readonly sprite: Sprite;
  readonly winFocus: Graphics;
  readonly cashAwardBox: Graphics;
  readonly cashAwardLabel: Text;
}

interface ReelVisual {
  readonly track: Container;
  readonly cells: CellVisual[];
  readonly impactFlash: Graphics;
}

interface ReelSpinState {
  stepStartedAt: number;
  stepDuration: number;
  settling: boolean;
  settleStartY: number;
  settleStartVelocity: number;
  finalQueue: CellDisplay[];
  finalSequenceStarted: boolean;
  finalSequenceComplete: boolean;
  locked: boolean;
  soundTriggered: boolean;
  impactStartedAt: number | null;
  impactDurationMs: number;
  readonly stripCycle: ReelStripCycle;
  readonly transientCashAwardSymbols: ReadonlySet<CashAwardSymbolId>;
  readonly triggeringBetCents: number;
}

interface CellDisplay {
  readonly cell: Cell;
  readonly cashAwardCents: number | null;
}

interface ActiveAnimation {
  readonly settle: () => void;
  readonly setTurbo: (enabled: boolean) => void;
}

export class ReelGridView {
  private readonly reels: ReelVisual[] = [];
  private activeAnimation: ActiveAnimation | null = null;
  private focusActive = false;
  private focusStartedAt = 0;
  private focusGroups: ReadonlyArray<PayingCellGroup> = [];
  private payingKeys: ReadonlySet<string> = new Set();
  private activeFocusGroup = -1;

  private constructor(
    private readonly application: Application,
    private readonly textures: ReadonlyMap<CellAsset, Texture>,
  ) {
    this.application.ticker.add(() => this.updateWinFocus());
    const reelHeight = GAME_CONFIG.rows * CELL_HEIGHT + (GAME_CONFIG.rows - 1) * GAP;
    for (let column = 0; column < GAME_CONFIG.columns; column += 1) {
      const viewport = new Container({
        x: MARGIN + column * (CELL_WIDTH + GAP),
        y: MARGIN,
      });
      const mask = new Graphics().rect(0, 0, CELL_WIDTH, reelHeight).fill(0xffffff);
      const track = new Container();
      const impactFlash = new Graphics()
        .roundRect(1, 1, CELL_WIDTH - 2, reelHeight - 2, 3)
        .fill({ color: 0xe7a53a, alpha: 0.18 })
        .stroke({ color: 0xffcf71, width: 4, alpha: 0.9 });
      impactFlash.alpha = 0;
      const reelCells: CellVisual[] = [];

      viewport.addChild(mask, track, impactFlash);
      viewport.mask = mask;
      this.application.stage.addChild(viewport);

      for (let row = 0; row <= GAME_CONFIG.rows; row += 1) {
        const visual = this.createCellVisual(track, row);
        reelCells.push(visual);
      }
      this.reels.push({ track, cells: reelCells, impactFlash });
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

  renderGrid(
    grid: Grid,
    winningWins: ReadonlyArray<SymbolWin> = [],
    cashAwards: ReadonlyArray<FreeSpinCashAward> = [],
    showFinalCashAwards = true,
  ): void {
    validateGrid(grid);
    this.clearWinFocus();
    for (const reel of this.reels) {
      reel.track.y = 0;
      reel.impactFlash.alpha = 0;
      for (const cell of reel.cells) {
        cell.container.alpha = 1;
      }
    }
    const cashAwardMap = cashAwardMapFrom(cashAwards);
    for (let row = 0; row < GAME_CONFIG.rows; row += 1) {
      for (let column = 0; column < GAME_CONFIG.columns; column += 1) {
        const cell = grid[row]![column]!;
        this.drawCell(
          row,
          column,
          cell,
          false,
          cashAwardDisplayAmount(cashAwardMap.get(`${row}:${column}`), showFinalCashAwards),
        );
      }
    }
    this.applyWinFocus(createPayingCellGroups(winningWins, cashAwards));
    this.application.canvas.setAttribute("aria-label", gridAriaLabel(grid, cashAwards));
  }

  setTurboEnabled(enabled: boolean): void {
    this.activeAnimation?.setTurbo(enabled);
  }

  settleActiveSpin(): void {
    this.activeAnimation?.settle();
  }

  animateBaseSpin(
    result: Grid,
    turboEnabled: boolean,
    onColumnLocked?: (column: number) => void,
    cashAwards: ReadonlyArray<FreeSpinCashAward> = [],
    transientCashAwardSymbols: ReadonlyArray<CashAwardSymbolId> = [],
    triggeringBetCents = 0,
  ): Promise<void> {
    validateGrid(result);
    this.clearWinFocus();
    const normalDuration = GAME_CONFIG.normalSpinDurationMs;
    const quickDuration = GAME_CONFIG.quickSpinDurationMs;
    const stepDuration = GAME_CONFIG.normalReelStepDurationMs;
    const cashAwardMap = cashAwardMapFrom(cashAwards);
    const transientSymbols = new Set(transientCashAwardSymbols);
    const spinStates: ReelSpinState[] = this.reels.map((_reel, column) => ({
      stepStartedAt: 0,
      stepDuration,
      settling: false,
      settleStartY: 0,
      settleStartVelocity: 0,
      finalQueue: [
        displayCell(result[GAME_CONFIG.rows - 1]![column]!, cashAwardMap.get(`${GAME_CONFIG.rows - 1}:${column}`)),
        displayCell(result[GAME_CONFIG.rows - 2]![column]!, cashAwardMap.get(`${GAME_CONFIG.rows - 2}:${column}`)),
        displayCell(result[GAME_CONFIG.rows - 3]![column]!, cashAwardMap.get(`0:${column}`)),
      ],
      finalSequenceStarted: false,
      finalSequenceComplete: false,
      locked: false,
      soundTriggered: false,
      impactStartedAt: null,
      impactDurationMs: 0,
      stripCycle: createStripCycle(column),
      transientCashAwardSymbols: transientSymbols,
      triggeringBetCents,
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
        this.renderGrid(result, [], cashAwards, false);
        for (let column = 0; column < GAME_CONFIG.columns; column += 1) {
          const state = spinStates[column];
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

        for (let column = 0; column < GAME_CONFIG.columns; column += 1) {
          const stopTime = normalDuration * (0.55 + ((column + 1) / GAME_CONFIG.columns) * 0.45);
          const reel = this.reels[column];
          const state = spinStates[column];
          if (reel === undefined) {
            throw new Error("Reel visual was not initialized");
          }
          if (state === undefined) {
            throw new Error("Reel spin state was not initialized");
          }
          if (state.locked) {
            updateReelLockImpact(reel, state, now);
            continue;
          }

          const settleDuration = Math.min(GAME_CONFIG.reelSettleDurationMs, stopTime * 0.35);
          const settleStart = stopTime - settleDuration;
          const soundPreroll = REEL_LOCK_SOUND_PREROLL_MS * (turbo ? normalDuration / quickDuration : 1);

          if (state.stepStartedAt === 0) {
            state.stepStartedAt = elapsed;
            recycleSpinCell(reel, state, (cell, display) =>
              this.drawCellVisual(cell, display.cell, true, display.cashAwardCents));
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
                (state.stepStartedAt - normalDuration * 0.3) / Math.max(settleStart - normalDuration * 0.3, 1),
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

            recycleSpinCell(reel, state, (cell, display) =>
              this.drawCellVisual(cell, display.cell, true, display.cashAwardCents));
          }

          if (state.finalSequenceComplete) {
            reel.track.y = 0;
          } else {
            const stepProgress = clamp((spinElapsed - state.stepStartedAt) / state.stepDuration, 0, 1);
            reel.track.y = -(CELL_HEIGHT + GAP) * (1 - stepProgress);
          }

          if (elapsed >= stopTime - soundPreroll && !state.soundTriggered) {
            state.soundTriggered = true;
            onColumnLocked?.(column);
          }
          if (elapsed >= settleStart) {
            if (!state.settling) {
              state.settling = true;
              state.settleStartY = reel.track.y;
              state.settleStartVelocity = (CELL_HEIGHT + GAP) / state.stepDuration;
              if (turbo && !state.finalSequenceComplete) {
                for (let row = 0; row < GAME_CONFIG.rows; row += 1) {
                  this.drawCell(
                    row,
                    column,
                    result[row]![column]!,
                    true,
                    cashAwardDisplayAmount(cashAwardMap.get(`${row}:${column}`), false),
                  );
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
                this.drawCell(
                  row,
                  column,
                  result[row]![column]!,
                  false,
                  cashAwardDisplayAmount(cashAwardMap.get(`${row}:${column}`), false),
                );
              }
              state.locked = true;
              state.impactStartedAt = now;
              state.impactDurationMs = reelLockImpactDurationMs(turbo);
              updateReelLockImpact(reel, state, now);
            }
            continue;
          }
        }

        const impactActive = spinStates.some((state) => state.impactStartedAt !== null);
        if (elapsed < normalDuration || impactActive) {
          animationFrame = requestAnimationFrame(frame);
        } else {
          finish();
        }
      };
      animationFrame = requestAnimationFrame(frame);
    });
  }

  wait(durationMs: number): Promise<void> {
    return wait(durationMs);
  }

  animateCashAwardCount(cashAwards: ReadonlyArray<FreeSpinCashAward>, turboEnabled: boolean): Promise<void> {
    const multiplierAwards = cashAwards.filter((award) => award.multiplier > 1);
    if (multiplierAwards.length === 0) {
      return Promise.resolve();
    }
    const duration = turboEnabled
      ? GAME_CONFIG.quickCashAwardCountDurationMs
      : GAME_CONFIG.normalCashAwardCountDurationMs;
    return new Promise((resolve) => {
      const startedAt = performance.now();
      const tick = (now: number): void => {
        const progress = Math.min((now - startedAt) / duration, 1);
        for (const award of multiplierAwards) {
          const reel = this.reels[award.position.column];
          const visual = reel?.cells[award.position.row];
          if (visual !== undefined) {
            const amount = Math.floor(award.baseAmountCents + (award.amountCents - award.baseAmountCents) * progress);
            this.drawCashAward(visual, amount);
          }
        }
        if (progress === 1) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  private createCellVisual(parent: Container, row: number): CellVisual {
    const container = new Container({ y: row * (CELL_HEIGHT + GAP) });
    const box = new Graphics();
    const sprite = new Sprite(Texture.EMPTY);
    const winFocus = new Graphics()
      .roundRect(3, 3, CELL_WIDTH - 6, CELL_HEIGHT - 6, 2)
      .fill({ color: 0xffc55c, alpha: 0.72 });
    winFocus.visible = false;
    const cashAwardBox = new Graphics();
    const cashAwardLabel = new Text({
      text: "",
      style: {
        fill: 0xfff6c9,
        fontFamily: "Silkscreen, monospace",
        fontSize: 22,
        fontWeight: "bold",
      },
    });
    sprite.anchor.set(0.5);
    sprite.position.set(CELL_WIDTH / 2, CELL_HEIGHT / 2);
    cashAwardLabel.anchor.set(0.5);
    container.addChild(box, sprite, winFocus, cashAwardBox, cashAwardLabel);
    parent.addChild(container);
    return { container, box, sprite, winFocus, cashAwardBox, cashAwardLabel };
  }

  private drawCell(
    row: number,
    column: number,
    cell: Cell,
    spinning: boolean,
    cashAwardCents: number | null = null,
  ): void {
    const reel = this.reels[column];
    const visual = reel?.cells[row];
    if (visual === undefined) {
      throw new Error("Cell visual was not initialized");
    }
    this.drawCellVisual(visual, cell, spinning, cashAwardCents);
  }

  private setSpinningState(row: number, column: number, spinning: boolean): void {
    const reel = this.reels[column];
    const visual = reel?.cells[row];
    if (visual === undefined) {
      throw new Error("Cell visual was not initialized");
    }
    visual.container.alpha = spinning ? 0.88 : 1;
  }

  private drawCellVisual(
    visual: CellVisual,
    cell: Cell,
    spinning: boolean,
    cashAwardCents: number | null = null,
  ): void {
    visual.box
      .clear()
      .roundRect(0, 0, CELL_WIDTH, CELL_HEIGHT, 2)
      .fill(0x111819);
    visual.container.alpha = spinning ? 0.88 : 1;
    const texture = this.textures.get(cellAsset(cell));
    if (texture === undefined) {
      throw new Error(`No texture was loaded for ${cellAsset(cell)}`);
    }
    visual.sprite.texture = texture;
    visual.sprite.scale.set(Math.min((CELL_WIDTH * SYMBOL_SCALE) / texture.width, (CELL_HEIGHT * SYMBOL_SCALE) / texture.height));
    this.drawCashAward(visual, cashAwardCents);
  }

  private applyWinFocus(groups: ReadonlyArray<PayingCellGroup>): void {
    if (groups.length === 0) {
      return;
    }
    this.focusActive = true;
    this.focusStartedAt = performance.now();
    this.focusGroups = groups;
    this.payingKeys = allPayingPositionKeys(groups);
    this.activeFocusGroup = -1;
    this.setActiveFocusGroup(0);
  }

  private setActiveFocusGroup(index: number): void {
    const group = this.focusGroups[index];
    if (group === undefined) {
      throw new Error("Paying-cell focus group was not initialized");
    }
    const color = FOCUS_COLORS[index % FOCUS_COLORS.length]!;
    this.activeFocusGroup = index;
    for (let column = 0; column < GAME_CONFIG.columns; column += 1) {
      const reel = this.reels[column];
      if (reel === undefined) {
        throw new Error("Reel visual was not initialized");
      }
      for (let row = 0; row < GAME_CONFIG.rows; row += 1) {
        const cell = reel.cells[row];
        if (cell === undefined) {
          throw new Error("Reel cell was not initialized");
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
    for (const reel of this.reels) {
      for (const cell of reel.cells) {
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
      this.setActiveFocusGroup(group);
    }
    const pulse = (Math.sin((performance.now() - this.focusStartedAt) / 180) + 1) / 2;
    for (const reel of this.reels) {
      for (const cell of reel.cells) {
        if (cell.winFocus.visible) {
          cell.winFocus.alpha = 0.36 + pulse * 0.56;
        }
      }
    }
  }

  private drawWinFocus(cell: CellVisual, color: number): void {
    cell.winFocus
      .clear()
      .roundRect(3, 3, CELL_WIDTH - 6, CELL_HEIGHT - 6, 2)
      .fill({ color, alpha: 0.72 });
  }

  private drawCashAward(visual: CellVisual, amountCents: number | null): void {
    if (amountCents === null) {
      visual.cashAwardBox.visible = false;
      visual.cashAwardLabel.visible = false;
      return;
    }
    const label = visual.cashAwardLabel;
    label.visible = true;
    label.text = formatUsd(amountCents);
    label.scale.set(1);
    const scale = Math.min(1, (CELL_WIDTH * 0.86) / label.width, (CELL_HEIGHT * 0.24) / label.height);
    label.scale.set(scale);
    label.position.set(CELL_WIDTH / 2, CELL_HEIGHT * 0.78);
    const padding = 5;
    visual.cashAwardBox
      .clear()
      .roundRect(
        label.x - label.width / 2 - padding,
        label.y - label.height / 2 - 3,
        label.width + padding * 2,
        label.height + 6,
        3,
      )
      .fill({ color: 0x21100d, alpha: 0.86 })
      .stroke({ color: 0xf1a637, alpha: 0.9, width: 1 });
    visual.cashAwardBox.visible = true;
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
  draw: (cell: CellVisual, display: CellDisplay) => void,
): void {
  const display = state.finalSequenceStarted
    ? state.finalQueue.shift()
    : transientDisplayCell(
      state.stripCycle.takeNextCell(),
      state.transientCashAwardSymbols,
      state.triggeringBetCents,
    );
  if (display === undefined) {
    throw new Error("Final reel sequence was exhausted before settling");
  }
  recycleReelCell(reel, (cell) => draw(cell, display));
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

function updateReelLockImpact(reel: ReelVisual, state: ReelSpinState, now: number): void {
  if (state.impactStartedAt === null) {
    reel.track.y = 0;
    reel.impactFlash.alpha = 0;
    return;
  }
  const progress = Math.min((now - state.impactStartedAt) / Math.max(state.impactDurationMs, 1), 1);
  reel.track.y = reelLockImpactOffset(progress);
  reel.impactFlash.alpha = reelLockFlashAlpha(progress);
  if (progress === 1) {
    state.impactStartedAt = null;
  }
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

function validateGrid(grid: Grid): void {
  if (grid.length !== GAME_CONFIG.rows || grid.some((row) => row.length !== GAME_CONFIG.columns)) {
    throw new Error("Grid dimensions do not match the renderer");
  }
}

function gridAriaLabel(grid: Grid, cashAwards: ReadonlyArray<FreeSpinCashAward>): string {
  const awardMap = cashAwardMapFrom(cashAwards);
  const rows = grid.map((row, index) =>
    `Row ${index + 1}: ${row.map((cell, column) => accessibleCellLabel(cell, awardMap.get(`${index}:${column}`))).join(", ")}`,
  );
  return `Three row by five column slot grid. ${rows.join(". ")}.`;
}

function accessibleCellLabel(cell: Cell, cashAward: FreeSpinCashAward | undefined): string {
  if (cell.kind === "wild") {
    return "WILD";
  }
  return cashAward === undefined ? cell.symbol : `${cell.symbol}, ${formatUsd(cashAward.amountCents)}`;
}

function cashAwardMapFrom(cashAwards: ReadonlyArray<FreeSpinCashAward>): ReadonlyMap<string, FreeSpinCashAward> {
  return new Map(cashAwards.map((award) => [`${award.position.row}:${award.position.column}`, award]));
}

function cashAwardDisplayAmount(award: FreeSpinCashAward | undefined, showFinalAmount: boolean): number | null {
  if (award === undefined) {
    return null;
  }
  return showFinalAmount ? award.amountCents : award.baseAmountCents;
}

function displayCell(cell: Cell, cashAward: FreeSpinCashAward | undefined): CellDisplay {
  return { cell, cashAwardCents: cashAwardDisplayAmount(cashAward, false) };
}

function transientDisplayCell(
  cell: Cell,
  cashAwardSymbols: ReadonlySet<CashAwardSymbolId>,
  betCents: number,
): CellDisplay {
  if (cell.kind !== "bonus" || !cashAwardSymbols.has(cell.symbol as CashAwardSymbolId)) {
    return { cell, cashAwardCents: null };
  }
  const [minimumTenths, maximumTenths] = cell.symbol === "CIGARETTE"
    ? [GAME_CONFIG.cigaretteCashAwardMinimumTenths, GAME_CONFIG.cigaretteCashAwardMaximumTenths]
    : [GAME_CONFIG.beerCashAwardMinimumTenths, GAME_CONFIG.beerCashAwardMaximumTenths];
  const choices = ((maximumTenths - minimumTenths) / 5) + 1;
  const multiplierTenths = minimumTenths + Math.floor(Math.random() * choices) * 5;
  return { cell, cashAwardCents: (betCents * multiplierTenths) / 10 };
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}
