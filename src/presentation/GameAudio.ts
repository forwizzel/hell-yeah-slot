export type GameSoundEffect =
  | "spin"
  | "bet-up"
  | "bet-down"
  | "click"
  | "symbol-first"
  | "symbol-second"
  | "symbol-third"
  | "symbol-winner";

const SOUNDTRACK_PATH = new URL("../../sfx/sfx/soundtrack.mp3", import.meta.url).href;

const EFFECT_PATHS: Record<GameSoundEffect, string> = {
  spin: new URL("../../sfx/sfx/spin.mp3", import.meta.url).href,
  "bet-up": new URL("../../sfx/sfx/bet-up.mp3", import.meta.url).href,
  "bet-down": new URL("../../sfx/sfx/bet-down.mp3", import.meta.url).href,
  click: new URL("../../sfx/sfx/click.mp3", import.meta.url).href,
  "symbol-first": new URL("../../sfx/sfx/symbol-first.mp3", import.meta.url).href,
  "symbol-second": new URL("../../sfx/sfx/symbol-second.mp3", import.meta.url).href,
  "symbol-third": new URL("../../sfx/sfx/symbol-third.mp3", import.meta.url).href,
  "symbol-winner": new URL("../../sfx/sfx/symbol-winner.mp3", import.meta.url).href,
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
