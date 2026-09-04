// Types for the interval engine: the abstract state + events it emits. The engine knows nothing
// about audio or GPS — downstream layers (audio cues, a run UI) decide what to do with these.

import { Phase, PhaseType } from '../model';

export type EngineStatus = 'idle' | 'preroll' | 'active' | 'complete';

export interface EngineSnapshot {
  status: EngineStatus;
  isPaused: boolean;

  /** Index into expandedPhases(workout); null during idle/preroll/complete. */
  currentPhaseIndex: number | null;
  currentPhase: Phase | null;
  currentPhaseType: PhaseType | null;

  /** 1-based; null during idle/preroll/complete. */
  repNumber: number | null;
  totalReps: number;

  /** Elapsed/duration track the lead-in during preroll, and the current phase during active. */
  phaseElapsedSeconds: number;
  phaseDurationSeconds: number;
  /** Math.ceil'd, for the on-screen countdown — reads e.g. 17..1 and hits 0 exactly at the boundary. */
  phaseRemainingSeconds: number;

  workoutElapsedSeconds: number;
  workoutTotalSeconds: number;
  /** Math.ceil'd, same reasoning as phaseRemainingSeconds. */
  workoutRemainingSeconds: number;

  /** 0..1, for progress bars. Continuous (not rounded), unlike the *RemainingSeconds fields. */
  phaseProgress: number;
  workoutProgress: number;
}

export type EngineEvent =
  | { type: 'preroll-start' }
  | { type: 'countdown'; secondsRemaining: number } // final 3, 2, 1 of preroll
  | { type: 'phase-start'; phaseIndex: number; phase: Phase; repNumber: number }
  | { type: 'warning-cue'; phaseIndex: number; secondsRemaining: number }
  | { type: 'phase-end'; phaseIndex: number }
  | { type: 'workout-complete' }
  | { type: 'paused' }
  | { type: 'resumed' };

/**
 * The events scheduled on the precomputed timeline (see timeline.ts). `paused`/`resumed` are
 * excluded on purpose: they're issued directly by pause()/resume() at the moment the caller
 * invokes them, not scheduled in advance.
 */
export type TimedEngineEvent = Exclude<EngineEvent, { type: 'paused' } | { type: 'resumed' }>;

export interface EngineResult {
  snapshot: EngineSnapshot;
  events: EngineEvent[];
}
