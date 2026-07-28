type SymbolSoundName = "beer" | "cig" | "sword";

export type GameSoundEffect =
  | "spin"
  | "bet-up"
  | "bet-down"
  | "click"
  | `symbol-${SymbolSoundName}-${1 | 2 | 3}`
  | `win-${SymbolSoundName}`;

const SOUNDTRACK_PATH = new URL("../../audio/soundtrack-1.mp3", import.meta.url).href;

const EFFECT_PATHS: Record<GameSoundEffect, string> = {
  spin: new URL("../../audio/spin-button.mp3", import.meta.url).href,
  "bet-up": new URL("../../audio/bet-up-button.mp3", import.meta.url).href,
  "bet-down": new URL("../../audio/bet-down-button.mp3", import.meta.url).href,
  click: new URL("../../audio/cells-click.mp3", import.meta.url).href,
  "symbol-beer-1": new URL("../../audio/symbol-beer-1.mp3", import.meta.url).href,
  "symbol-beer-2": new URL("../../audio/symbol-beer-2.mp3", import.meta.url).href,
  "symbol-beer-3": new URL("../../audio/symbol-beer-3.mp3", import.meta.url).href,
  "symbol-cig-1": new URL("../../audio/symbol-cig-1.mp3", import.meta.url).href,
  "symbol-cig-2": new URL("../../audio/symbol-cig-2.mp3", import.meta.url).href,
  "symbol-cig-3": new URL("../../audio/symbol-cig-3.mp3", import.meta.url).href,
  "symbol-sword-1": new URL("../../audio/symbol-sword-1.mp3", import.meta.url).href,
  "symbol-sword-2": new URL("../../audio/symbol-sword-2.mp3", import.meta.url).href,
  "symbol-sword-3": new URL("../../audio/symbol-sword-3.mp3", import.meta.url).href,
  "win-beer": new URL("../../audio/win-beer.mp3", import.meta.url).href,
  "win-cig": new URL("../../audio/win-cig.mp3", import.meta.url).href,
  "win-sword": new URL("../../audio/win-sword.mp3", import.meta.url).href,
};

export class GameAudio {
  private readonly soundtrack = createAudio(SOUNDTRACK_PATH);
  private readonly effects = new Map<GameSoundEffect, HTMLAudioElement>();
  private readonly activeEffects = new Set<HTMLAudioElement>();
  private musicEnabled = true;
  private sfxEnabled = true;

  constructor() {
    this.soundtrack.loop = true;
    this.soundtrack.autoplay = true;
    this.soundtrack.addEventListener("canplay", this.handleMusicReady);
    for (const [effect, path] of Object.entries(EFFECT_PATHS)) {
      this.effects.set(effect as GameSoundEffect, createAudio(path));
    }
    this.soundtrack.load();
    document.addEventListener("pointerdown", this.handleUserInteraction);
    document.addEventListener("keydown", this.handleUserInteraction);
    this.startMusic();
  }

  toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    if (this.musicEnabled) {
      this.startMusic();
    } else {
      this.soundtrack.pause();
    }
    return this.musicEnabled;
  }

  toggleSfx(): boolean {
    this.sfxEnabled = !this.sfxEnabled;
    if (!this.sfxEnabled) {
      for (const effect of this.activeEffects) {
        effect.pause();
      }
      this.activeEffects.clear();
    }
    return this.sfxEnabled;
  }

  play(effect: GameSoundEffect): void {
    if (this.musicEnabled) {
      this.startMusic();
    }
    if (!this.sfxEnabled) {
      return;
    }
    const source = this.effects.get(effect);
    if (source === undefined) {
      return;
    }

    const playback = source.cloneNode(true) as HTMLAudioElement;
    const finish = (): void => {
      playback.removeEventListener("ended", finish);
      playback.removeEventListener("error", finish);
      this.activeEffects.delete(playback);
    };
    playback.addEventListener("ended", finish);
    playback.addEventListener("error", finish);
    this.activeEffects.add(playback);
    void playback.play().catch(finish);
  }

  private startMusic(): void {
    if (!this.musicEnabled || !this.soundtrack.paused) {
      return;
    }
    void this.soundtrack.play().catch(() => {
      // Audio failures must not interrupt the game.
    });
  }

  private readonly handleUserInteraction = (): void => {
    this.startMusic();
  };

  private readonly handleMusicReady = (): void => {
    this.startMusic();
  };
}

function createAudio(path: string): HTMLAudioElement {
  const audio = new Audio(path);
  audio.preload = "auto";
  return audio;
}
