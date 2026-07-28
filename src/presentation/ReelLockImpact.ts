// The supplied MP3 effects retain roughly 24-31 ms of leading silence.
export const REEL_LOCK_SOUND_PREROLL_MS = 28;

export function reelLockImpactDurationMs(turbo: boolean): number {
  return turbo ? 72 : 120;
}

export function reelLockImpactOffset(progress: number): number {
  const bounded = clamp(progress, 0, 1);
  if (bounded < 0.25) {
    return interpolate(8, -3, easeOutCubic(bounded / 0.25));
  }
  if (bounded < 0.6) {
    return interpolate(-3, 1.5, easeInOutCubic((bounded - 0.25) / 0.35));
  }
  return interpolate(1.5, 0, easeOutCubic((bounded - 0.6) / 0.4));
}

export function reelLockFlashAlpha(progress: number): number {
  return 0.42 * (1 - clamp(progress, 0, 1)) ** 2;
}

function interpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
