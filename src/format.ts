// Presentation-only formatting helpers. Kept out of model.ts, which is display-agnostic.

/** Formats a duration in seconds as "m:ss". */
export function formatMinSec(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds - m * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
