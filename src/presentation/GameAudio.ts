type SymbolSoundName = "beer" | "cig" | "sword";

export type GameSoundEffect =
  | "spin"
  | "bet-up"
  | "bet-down"
  | "click"
  | "count-win"
  | "win-combination"
  | `symbol-${SymbolSoundName}-${1 | 2 | 3}`
  | `win-${SymbolSoundName}`;

const SOUNDTRACK_PATH = new URL("../../audio/soundtrack-1.mp3", import.meta.url).href;
const SOUNDTRACK_VOLUME = 0.7;
const SYMBOL_EFFECT_GAIN = 2;

const EFFECT_PATHS: Record<GameSoundEffect, string> = {
  spin: new URL("../../audio/spin-button.mp3", import.meta.url).href,
  "bet-up": new URL("../../audio/bet-up-button.mp3", import.meta.url).href,
  "bet-down": new URL("../../audio/bet-down-button.mp3", import.meta.url).href,
  click: new URL("../../audio/cells-click.mp3", import.meta.url).href,
  "count-win": new URL("../../audio/count-win.mp3", import.meta.url).href,
  "win-combination": new URL("../../audio/win-combination.mp3", import.meta.url).href,
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
  private readonly audioContext = new AudioContext();
  private readonly effects = new Map<GameSoundEffect, AudioBuffer>();
  private readonly activeEffects = new Set<AudioBufferSourceNode>();
  private musicEnabled = true;
  private sfxEnabled = true;

  constructor() {
    this.soundtrack.loop = true;
    this.soundtrack.volume = SOUNDTRACK_VOLUME;
    this.soundtrack.autoplay = true;
    this.soundtrack.addEventListener("canplay", this.handleMusicReady);
    for (const [effect, path] of Object.entries(EFFECT_PATHS)) {
      void this.loadEffect(effect as GameSoundEffect, path);
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
        effect.stop();
      }
      this.activeEffects.clear();
    }
    return this.sfxEnabled;
  }

  play(effect: GameSoundEffect, loop = false): (() => void) | null {
    if (this.musicEnabled) {
      this.startMusic();
    }
    if (!this.sfxEnabled) {
      return null;
    }
    const buffer = this.effects.get(effect);
    if (buffer === undefined) {
      return null;
    }

    const playback = this.audioContext.createBufferSource();
    playback.buffer = buffer;
    playback.loop = loop;
    const symbolGain = isSymbolSoundEffect(effect) ? this.audioContext.createGain() : null;
    if (symbolGain === null) {
      playback.connect(this.audioContext.destination);
    } else {
      symbolGain.gain.value = SYMBOL_EFFECT_GAIN;
      playback.connect(symbolGain);
      symbolGain.connect(this.audioContext.destination);
    }
    let finished = false;
    const finish = (): void => {
      if (finished) {
        return;
      }
      finished = true;
      this.activeEffects.delete(playback);
      playback.disconnect();
      symbolGain?.disconnect();
    };
    playback.addEventListener("ended", finish, { once: true });
    this.activeEffects.add(playback);
    playback.start();
    return () => {
      if (finished) {
        return;
      }
      playback.stop();
      finish();
    };
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
    void this.audioContext.resume().catch(() => {
      // SFX remain unavailable until a browser allows the audio context to resume.
    });
    this.startMusic();
  };

  private readonly handleMusicReady = (): void => {
    this.startMusic();
  };

  private async loadEffect(effect: GameSoundEffect, path: string): Promise<void> {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        return;
      }
      const data = await response.arrayBuffer();
      this.effects.set(effect, await this.audioContext.decodeAudioData(data));
    } catch {
      // Audio failures must not interrupt the game.
    }
  }
}

function createAudio(path: string): HTMLAudioElement {
  const audio = new Audio(path);
  audio.preload = "auto";
  return audio;
}

function isSymbolSoundEffect(effect: GameSoundEffect): boolean {
  return effect.startsWith("symbol-");
}
