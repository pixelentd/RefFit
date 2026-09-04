// Builds the whole session's schedule up front, as absolute elapsed-ms offsets from t=0 at
// start(). This is the piece that makes the engine correct under dropped frames: tick() never
// asks "does remaining == this mark?" on a live clock — it just walks this precomputed, sorted
// list forward and fires whatever falls within the elapsed window it's given.

import { expandedPhases, Phase, Workout } from '../model';
import { TimedEngineEvent } from './types';

interface TimelineEntry {
  atMs: number;
  /** Tie-breaker for entries at the same atMs, so coincident events fire in the intended order
   *  (e.g. phase-end(N) before phase-start(N+1), the final phase-end before workout-complete). */
  order: number;
  event: TimedEngineEvent;
}

export interface Schedule {
  workout: Workout;
  /** phases repeated repeatCount times — see model.ts's expandedPhases(). */
  expanded: Phase[];
  leadInMs: number;
  totalMs: number;
  /** Absolute elapsed-ms offset of the start of each phase. Length expanded.length + 1; the
   *  last entry equals totalMs (the offset one past the final phase). */
  phaseOffsetsMs: number[];
  /** Every timed event for the session, sorted by (atMs, order). Immutable once built. */
  timeline: TimelineEntry[];
}

/** Builds the immutable schedule for one workout. Call once, in IntervalEngine.start(). */
export function buildSchedule(workout: Workout): Schedule {
  const expanded = expandedPhases(workout);

  if (expanded.length === 0) {
    // Nothing to run (zero reps, or an empty phase list) — one workout-complete event at t=0.
    // See IntervalEngine.start(), which turns this straight into an idle -> complete transition.
    return {
      workout,
      expanded,
      leadInMs: 0,
      totalMs: 0,
      phaseOffsetsMs: [0],
      timeline: [{ atMs: 0, order: 0, event: { type: 'workout-complete' } }],
    };
  }

  const leadInMs = Math.max(0, workout.leadInSeconds) * 1000;
  const phaseOffsetsMs: number[] = [leadInMs];
  const timeline: TimelineEntry[] = [];
  let order = 0;
  const push = (atMs: number, event: TimedEngineEvent) => timeline.push({ atMs, order: order++, event });

  if (leadInMs > 0) {
    push(0, { type: 'preroll-start' });
    for (const secondsRemaining of [3, 2, 1]) {
      const atMs = leadInMs - secondsRemaining * 1000;
      if (atMs >= 0) push(atMs, { type: 'countdown', secondsRemaining });
    }
  }
  // leadInSeconds === 0: no preroll state at all, phase 0 starts immediately at t=0 below.

  const phasesPerRep = workout.phases.length;
  let cursorMs = leadInMs;
  expanded.forEach((phase, phaseIndex) => {
    const repNumber = Math.floor(phaseIndex / phasesPerRep) + 1;
    const phaseEndMs = cursorMs + phase.durationSeconds * 1000;

    push(cursorMs, { type: 'phase-start', phaseIndex, phase, repNumber });

    for (const secondsRemaining of phase.warningsAtSecondsRemaining) {
      // A 10s warning on an 8s (or shorter) phase never occurs.
      if (secondsRemaining <= 0 || secondsRemaining >= phase.durationSeconds) continue;
      push(phaseEndMs - secondsRemaining * 1000, { type: 'warning-cue', phaseIndex, secondsRemaining });
    }

    push(phaseEndMs, { type: 'phase-end', phaseIndex });
    cursorMs = phaseEndMs;
    phaseOffsetsMs.push(cursorMs);
  });

  push(cursorMs, { type: 'workout-complete' });
  timeline.sort((a, b) => a.atMs - b.atMs || a.order - b.order);

  return { workout, expanded, leadInMs, totalMs: cursorMs, phaseOffsetsMs, timeline };
}
