// Domain model for interval workouts.
//
// Plain data + pure helpers on purpose: everything here is JSON-serializable, so it round-trips
// through storage (Preferences / localStorage / SQLite) and over the wire without any custom
// (de)serialization. No classes, no methods hanging off the data — derived values are functions.

export type PhaseType = 'run' | 'walk' | 'sprint' | 'rest';

export interface Phase {
  id: string;
  type: PhaseType;
  /** Target duration of the phase, in seconds. */
  durationSeconds: number;
  /** Target distance to cover, in meters. Ignored when the type isn't distance-tracked. */
  distanceMeters: number;
  /** "Seconds remaining" marks at which to fire a cue (beep). e.g. [10, 5]. */
  warningsAtSecondsRemaining: number[];
}

export interface Workout {
  id: string;
  name: string;
  /** Countdown before the first phase, in seconds (0 = none). */
  leadInSeconds: number;
  /** The per-rep sequence of phases. */
  phases: Phase[];
  /** How many times `phases` repeats. */
  repeatCount: number;
}

// --- PhaseType metadata ------------------------------------------------------

export function phaseDisplayName(type: PhaseType): string {
  switch (type) {
    case 'run': return 'Run';
    case 'walk': return 'Walk';
    case 'sprint': return 'Sprint';
    case 'rest': return 'Rest';
  }
}

/** Whether the phase has a GPS distance target. Rest is time-only. */
export function tracksDistance(type: PhaseType): boolean {
  return type !== 'rest';
}

// --- Phase helpers -----------------------------------------------------------

/** Average target pace in m/s; 0 for non-distance or zero-duration phases (guards divide-by-zero). */
export function targetPaceMetersPerSecond(phase: Phase): number {
  if (!tracksDistance(phase.type) || phase.durationSeconds <= 0) return 0;
  return phase.distanceMeters / phase.durationSeconds;
}

/** Factory for a new phase. `type` is required; everything else has referee-test defaults. */
export function makePhase(partial: Partial<Phase> & Pick<Phase, 'type'>): Phase {
  return {
    id: crypto.randomUUID(),
    durationSeconds: 17,
    distanceMeters: 75,
    warningsAtSecondsRemaining: [10, 5],
    ...partial,
  };
}

// --- Workout derived values --------------------------------------------------

/** The phases actually executed, in order: `phases` repeated `repeatCount` times. */
export function expandedPhases(w: Workout): Phase[] {
  if (w.repeatCount <= 0) return [];
  const out: Phase[] = [];
  for (let i = 0; i < w.repeatCount; i++) out.push(...w.phases);
  return out;
}

export function totalDistanceMeters(w: Workout): number {
  const perRep = w.phases.reduce(
    (sum, p) => sum + (tracksDistance(p.type) ? p.distanceMeters : 0),
    0,
  );
  return perRep * w.repeatCount;
}

export function totalPhaseSeconds(w: Workout): number {
  const perRep = w.phases.reduce((sum, p) => sum + p.durationSeconds, 0);
  return perRep * w.repeatCount;
}

export function totalDurationSeconds(w: Workout): number {
  return w.leadInSeconds + totalPhaseSeconds(w);
}

export function totalPhaseCount(w: Workout): number {
  return w.phases.length * w.repeatCount;
}
