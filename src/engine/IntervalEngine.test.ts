import { describe, expect, it } from 'vitest';
import { makePhase, Workout } from '../model';
import { IntervalEngine } from './IntervalEngine';
import { EngineEvent } from './types';

/** leadIn 3s; 2 reps of run 3s / walk 2s; warnings [2, 1]. Full timeline in timeline.test.ts. */
function tinyWorkout(): Workout {
  return {
    id: 'w',
    name: 'Tiny',
    leadInSeconds: 3,
    phases: [
      makePhase({ type: 'run', durationSeconds: 3, distanceMeters: 30, warningsAtSecondsRemaining: [2, 1] }),
      makePhase({ type: 'walk', durationSeconds: 2, distanceMeters: 10, warningsAtSecondsRemaining: [2, 1] }),
    ],
    repeatCount: 2,
  };
}

function types(events: EngineEvent[]): string[] {
  return events.map((e) => e.type);
}

describe('IntervalEngine — deterministic timestamp sequences', () => {
  it('fires every event exactly once, in order, ticking once per second for the whole session', () => {
    const engine = new IntervalEngine(tinyWorkout());
    const fired: EngineEvent[] = [...engine.start(0).events];
    for (let ms = 1000; ms <= 14000; ms += 1000) {
      fired.push(...engine.tick(ms).events);
    }

    expect(types(fired)).toEqual([
      'preroll-start',
      'countdown', // 3
      'countdown', // 2
      'countdown', // 1
      'phase-start', // idx0, rep1 run
      'warning-cue', // idx0, 2s
      'warning-cue', // idx0, 1s
      'phase-end', // idx0
      'phase-start', // idx1, rep1 walk
      'warning-cue', // idx1, 1s (its 2s mark == its duration, so it's skipped)
      'phase-end', // idx1
      'phase-start', // idx2, rep2 run
      'warning-cue',
      'warning-cue',
      'phase-end', // idx2
      'phase-start', // idx3, rep2 walk
      'warning-cue',
      'phase-end', // idx3
      'workout-complete',
    ]);

    // Ticking further past completion is a no-op — no duplicate workout-complete.
    const after = engine.tick(20000);
    expect(after.events).toEqual([]);
    expect(after.snapshot.status).toBe('complete');
  });

  it('still fires every cue crossed even when a dropped frame jumps the clock past it', () => {
    // 11s -> 9s remaining must still fire the 10s cue; here, jumping straight from start to
    // mid-phase must still fire every preroll and phase-start/warning cue in between.
    const engine = new IntervalEngine(tinyWorkout());
    const started = engine.start(0); // already fires preroll-start + countdown{3} at t=0

    const jumped = engine.tick(5500); // deep into phase 0 (which spans [3000, 6000))
    expect(types([...started.events, ...jumped.events])).toEqual([
      'preroll-start',
      'countdown',
      'countdown',
      'countdown',
      'phase-start',
      'warning-cue', // the 2s-remaining cue at 4000ms
      'warning-cue', // the 1s-remaining cue at 5000ms
    ]);
    expect(jumped.snapshot.status).toBe('active');
    expect(jumped.snapshot.currentPhaseIndex).toBe(0);
    expect(jumped.snapshot.phaseElapsedSeconds).toBeCloseTo(2.5); // 5500 - 3000 phase-start

    // Continuing from there fires phase-end(0) + phase-start(1), each exactly once.
    const next = engine.tick(6000);
    expect(types(next.events)).toEqual(['phase-end', 'phase-start']);
  });

  it('jumping straight past the finish fires the whole remaining tail once, ending in complete', () => {
    const engine = new IntervalEngine(tinyWorkout());
    engine.start(0);
    const result = engine.tick(999999); // way past totalMs (13000)

    expect(result.events.at(-1)).toEqual({ type: 'workout-complete' });
    expect(result.snapshot).toMatchObject({ status: 'complete', workoutProgress: 1, phaseProgress: 1 });
  });
});

describe('IntervalEngine — pause/resume', () => {
  it('freezes elapsed time while paused and resumes exactly where it left off', () => {
    const engine = new IntervalEngine(tinyWorkout());
    engine.start(0);
    engine.tick(3500); // 500ms into phase 0

    const paused = engine.pause(3500);
    expect(paused.events).toEqual([{ type: 'paused' }]);
    expect(paused.snapshot.isPaused).toBe(true);
    expect(paused.snapshot.phaseElapsedSeconds).toBeCloseTo(0.5);

    // Wall-clock time marches on for six and a half seconds — none of it should count, and no
    // timeline event (e.g. the 2s-remaining warning at elapsed 4000ms) should fire early.
    const stillPaused = engine.tick(10000);
    expect(stillPaused.events).toEqual([]);
    expect(stillPaused.snapshot).toEqual(paused.snapshot);

    const resumed = engine.resume(10000);
    expect(resumed.events).toEqual([{ type: 'resumed' }]);
    expect(resumed.snapshot.isPaused).toBe(false);
    expect(resumed.snapshot.phaseElapsedSeconds).toBeCloseTo(0.5); // unchanged by the pause

    // 500ms of real time after resuming = elapsed 4000ms = exactly the 2s-remaining warning.
    const after = engine.tick(10500);
    expect(after.events).toEqual([{ type: 'warning-cue', phaseIndex: 0, secondsRemaining: 2 }]);
  });

  it('fires events crossed up to the pause instant itself before freezing', () => {
    const engine = new IntervalEngine(tinyWorkout());
    const started = engine.start(0); // already fires preroll-start + countdown{3} at t=0
    // No intervening tick() — pause() itself must catch up the timeline to elapsed 4000ms.
    const paused = engine.pause(4000);
    expect(types([...started.events, ...paused.events])).toEqual([
      'preroll-start',
      'countdown',
      'countdown',
      'countdown',
      'phase-start',
      'warning-cue', // the 2s-remaining cue, exactly at the pause instant
      'paused',
    ]);
  });

  it('pause()/resume() are no-ops when not applicable', () => {
    const engine = new IntervalEngine(tinyWorkout());
    expect(engine.resume(0).events).toEqual([]); // never started
    engine.start(0);
    expect(engine.pause(100).events.at(-1)).toEqual({ type: 'paused' });
    expect(engine.pause(200).events).toEqual([]); // already paused
  });
});

describe('IntervalEngine — edge cases', () => {
  it('goes straight from idle to complete for a zero-rep workout', () => {
    const workout: Workout = { id: 'w', name: 'Empty', leadInSeconds: 5, phases: [makePhase({ type: 'run' })], repeatCount: 0 };
    const engine = new IntervalEngine(workout);
    const result = engine.start(0);

    expect(result.events).toEqual([{ type: 'workout-complete' }]);
    expect(result.snapshot.status).toBe('complete');
    expect(result.snapshot.totalReps).toBe(0);
  });

  it('reset() returns to idle without emitting an event', () => {
    const engine = new IntervalEngine(tinyWorkout());
    engine.start(0);
    engine.tick(4000);

    const result = engine.reset();
    expect(result.events).toEqual([]);
    expect(result.snapshot.status).toBe('idle');

    // Starting again re-runs the whole schedule from scratch.
    const restarted = engine.start(100);
    expect(restarted.events[0]).toEqual({ type: 'preroll-start' });
  });

  it('exposes the on-screen countdown as Math.ceil(ms/1000): 5..1 then exactly 0 at the boundary', () => {
    const workout: Workout = {
      id: 'w',
      name: 'Countdown',
      leadInSeconds: 0,
      phases: [makePhase({ type: 'run', durationSeconds: 5, distanceMeters: 40 })],
      repeatCount: 1,
    };
    const engine = new IntervalEngine(workout);
    engine.start(0);

    const remainingAt = (ms: number) => engine.tick(ms).snapshot.phaseRemainingSeconds;
    expect(remainingAt(0)).toBe(5);
    expect(remainingAt(1)).toBe(5); // just after the boundary, still reads 5
    expect(remainingAt(999)).toBe(5);
    expect(remainingAt(1000)).toBe(4);
    expect(remainingAt(4999)).toBe(1);
    expect(remainingAt(5000)).toBe(0); // phase (and workout) complete exactly here
  });
});

describe('IntervalEngine — subscribe()', () => {
  it('notifies subscribers of every start/tick/pause/resume result, in addition to the return value', () => {
    const engine = new IntervalEngine(tinyWorkout());
    const seen: EngineEvent[] = [];
    const unsubscribe = engine.subscribe((result) => seen.push(...result.events));

    engine.start(0);
    engine.tick(1000);
    unsubscribe();
    engine.tick(2000); // after unsubscribing — should not be observed

    expect(types(seen)).toEqual(['preroll-start', 'countdown', 'countdown']);
  });
});
