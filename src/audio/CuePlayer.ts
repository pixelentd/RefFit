// The interface every sound backend implements. AudioBridge (the pure glue) talks only to this —
// it never touches an AudioContext or a Capacitor plugin directly, which is what lets the
// decision logic be unit-tested with a fake in place of real audio I/O.

import { PhaseType } from '../model';

export type CueType = 'countdown' | 'phase-start' | 'warning' | 'phase-end' | 'complete';

export interface CuePlayer {
  /**
   * Creates/resumes the underlying audio output. MUST be called from inside a user gesture
   * (e.g. the Start button's click handler) — browsers, and iOS Safari especially, block audio
   * output until one fires. Safe to call again later (e.g. after the tab was backgrounded and
   * the output got suspended) — implementations should treat it as idempotent.
   */
  unlock(): Promise<void> | void;
  /**
   * Plays one cue. `opts.phaseType` matters only for 'phase-start', to pick that phase's pitch.
   * `opts.secondsRemaining` matters only for 'warning', to pick how urgent it sounds (10s-or-more
   * out is a single beep; anything closer than that keeps the double beep).
   */
  play(cue: CueType, opts?: { phaseType?: PhaseType; secondsRemaining?: number }): void;
  setMuted(muted: boolean): void;
  /** Releases any underlying audio resources. Call on unmount. */
  dispose(): void;
}
