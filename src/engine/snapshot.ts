// Pure "what's true right now" query: given a Schedule and an elapsed-ms offset, compute the
// full snapshot. Deliberately independent of the timeline's event list — the snapshot is a
// function of elapsed time alone, not of which events have fired, so it's trivial to test in
// isolation and can never disagree with itself after a dropped-frame jump.

import { EngineSnapshot } from './types';
import { Schedule } from './timeline';

/** The snapshot before start() has ever been called (or after reset()). */
export function idleSnapshot(schedule: Schedule): EngineSnapshot {
  return {
    status: 'idle',
    isPaused: false,
    currentPhaseIndex: null,
    currentPhase: null,
    currentPhaseType: null,
    repNumber: null,
    totalReps: schedule.workout.repeatCount,
    phaseElapsedSeconds: 0,
    phaseDurationSeconds: 0,
    phaseRemainingSeconds: 0,
    workoutElapsedSeconds: 0,
    workoutTotalSeconds: schedule.totalMs / 1000,
    workoutRemainingSeconds: Math.ceil(schedule.totalMs / 1000),
    phaseProgress: 0,
    workoutProgress: 0,
  };
}

export function computeSnapshot(schedule: Schedule, elapsedMs: number, isPaused: boolean): EngineSnapshot {
  const { workout, expanded, leadInMs, totalMs, phaseOffsetsMs } = schedule;
  const totalReps = workout.repeatCount;
  const workoutTotalSeconds = totalMs / 1000;

  if (expanded.length === 0 || elapsedMs >= totalMs) {
    return {
      status: 'complete',
      isPaused,
      currentPhaseIndex: null,
      currentPhase: null,
      currentPhaseType: null,
      repNumber: null,
      totalReps,
      phaseElapsedSeconds: 0,
      phaseDurationSeconds: 0,
      phaseRemainingSeconds: 0,
      workoutElapsedSeconds: workoutTotalSeconds,
      workoutTotalSeconds,
      workoutRemainingSeconds: 0,
      phaseProgress: 1,
      workoutProgress: 1,
    };
  }

  const shared = {
    isPaused,
    totalReps,
    workoutElapsedSeconds: elapsedMs / 1000,
    workoutTotalSeconds,
    workoutRemainingSeconds: Math.ceil((totalMs - elapsedMs) / 1000),
    workoutProgress: totalMs > 0 ? elapsedMs / totalMs : 0,
  };

  if (elapsedMs < leadInMs) {
    return {
      ...shared,
      status: 'preroll',
      currentPhaseIndex: null,
      currentPhase: null,
      currentPhaseType: null,
      repNumber: null,
      phaseElapsedSeconds: elapsedMs / 1000,
      phaseDurationSeconds: leadInMs / 1000,
      phaseRemainingSeconds: Math.ceil((leadInMs - elapsedMs) / 1000),
      phaseProgress: leadInMs > 0 ? elapsedMs / leadInMs : 1,
    };
  }

  const phaseIndex = findPhaseIndex(phaseOffsetsMs, elapsedMs);
  const phase = expanded[phaseIndex];
  const phaseStartMs = phaseOffsetsMs[phaseIndex];
  const phaseDurationMs = phaseOffsetsMs[phaseIndex + 1] - phaseStartMs;
  const phaseElapsedMs = elapsedMs - phaseStartMs;
  const phasesPerRep = workout.phases.length;

  return {
    ...shared,
    status: 'active',
    currentPhaseIndex: phaseIndex,
    currentPhase: phase,
    currentPhaseType: phase.type,
    repNumber: Math.floor(phaseIndex / phasesPerRep) + 1,
    phaseElapsedSeconds: phaseElapsedMs / 1000,
    phaseDurationSeconds: phaseDurationMs / 1000,
    phaseRemainingSeconds: Math.ceil((phaseDurationMs - phaseElapsedMs) / 1000),
    phaseProgress: phaseDurationMs > 0 ? phaseElapsedMs / phaseDurationMs : 1,
  };
}

/** Finds i such that phaseOffsetsMs[i] <= elapsedMs < phaseOffsetsMs[i + 1]. Caller guarantees
 *  elapsedMs < totalMs (i.e. < phaseOffsetsMs[last]) — completion is handled before this runs. */
function findPhaseIndex(phaseOffsetsMs: number[], elapsedMs: number): number {
  for (let i = 0; i < phaseOffsetsMs.length - 1; i++) {
    if (elapsedMs < phaseOffsetsMs[i + 1]) return i;
  }
  return phaseOffsetsMs.length - 2;
}
