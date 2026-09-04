import { describe, expect, it } from 'vitest';
import { makePhase, Workout } from '../model';
import { buildSchedule } from './timeline';

describe('buildSchedule', () => {
  it('lays out preroll, phases, and warnings as absolute ms offsets, sorted and tie-broken', () => {
    // leadIn 3s; 2 reps of run 3s / walk 2s; warnings [2, 1] on both phase types.
    const workout: Workout = {
      id: 'w',
      name: 'Tiny',
      leadInSeconds: 3,
      phases: [
        makePhase({ type: 'run', durationSeconds: 3, distanceMeters: 30, warningsAtSecondsRemaining: [2, 1] }),
        makePhase({ type: 'walk', durationSeconds: 2, distanceMeters: 10, warningsAtSecondsRemaining: [2, 1] }),
      ],
      repeatCount: 2,
    };

    const schedule = buildSchedule(workout);

    expect(schedule.leadInMs).toBe(3000);
    expect(schedule.totalMs).toBe(13000); // 3000 lead-in + 4 * (run 3s or walk 2s) = 3000 + 10000
    expect(schedule.phaseOffsetsMs).toEqual([3000, 6000, 8000, 11000, 13000]);

    // The mark === leadInSeconds case (countdown{3}) coincides with preroll-start at t=0; it
    // must sort after preroll-start, not before — ties are broken by construction order.
    expect(schedule.timeline[0]).toMatchObject({ atMs: 0, event: { type: 'preroll-start' } });
    expect(schedule.timeline[1]).toMatchObject({ atMs: 0, event: { type: 'countdown', secondsRemaining: 3 } });

    const shaped = schedule.timeline.map((e) => ({ atMs: e.atMs, ...e.event }));
    expect(shaped).toEqual([
      { atMs: 0, type: 'preroll-start' },
      { atMs: 0, type: 'countdown', secondsRemaining: 3 },
      { atMs: 1000, type: 'countdown', secondsRemaining: 2 },
      { atMs: 2000, type: 'countdown', secondsRemaining: 1 },
      { atMs: 3000, type: 'phase-start', phaseIndex: 0, phase: workout.phases[0], repNumber: 1 },
      { atMs: 4000, type: 'warning-cue', phaseIndex: 0, secondsRemaining: 2 },
      { atMs: 5000, type: 'warning-cue', phaseIndex: 0, secondsRemaining: 1 },
      { atMs: 6000, type: 'phase-end', phaseIndex: 0 },
      // walk is only 2s long, so its "2s remaining" warning (== its full duration) is skipped.
      { atMs: 6000, type: 'phase-start', phaseIndex: 1, phase: workout.phases[1], repNumber: 1 },
      { atMs: 7000, type: 'warning-cue', phaseIndex: 1, secondsRemaining: 1 },
      { atMs: 8000, type: 'phase-end', phaseIndex: 1 },
      { atMs: 8000, type: 'phase-start', phaseIndex: 2, phase: workout.phases[0], repNumber: 2 },
      { atMs: 9000, type: 'warning-cue', phaseIndex: 2, secondsRemaining: 2 },
      { atMs: 10000, type: 'warning-cue', phaseIndex: 2, secondsRemaining: 1 },
      { atMs: 11000, type: 'phase-end', phaseIndex: 2 },
      { atMs: 11000, type: 'phase-start', phaseIndex: 3, phase: workout.phases[1], repNumber: 2 },
      { atMs: 12000, type: 'warning-cue', phaseIndex: 3, secondsRemaining: 1 },
      { atMs: 13000, type: 'phase-end', phaseIndex: 3 },
      { atMs: 13000, type: 'workout-complete' },
    ]);
  });

  it('skips preroll entirely when leadInSeconds is 0 — phase 0 starts right at t=0', () => {
    const workout: Workout = {
      id: 'w',
      name: 'No lead-in',
      leadInSeconds: 0,
      phases: [makePhase({ type: 'run', durationSeconds: 5, distanceMeters: 40 })],
      repeatCount: 1,
    };

    const schedule = buildSchedule(workout);

    expect(schedule.timeline.map((e) => e.event.type)).toEqual(['phase-start', 'phase-end', 'workout-complete']);
    expect(schedule.timeline[0].atMs).toBe(0);
  });

  it('produces a single workout-complete at t=0 for a zero-rep workout', () => {
    const workout: Workout = {
      id: 'w',
      name: 'Empty',
      leadInSeconds: 5,
      phases: [makePhase({ type: 'run' })],
      repeatCount: 0,
    };

    const schedule = buildSchedule(workout);

    expect(schedule.totalMs).toBe(0);
    expect(schedule.timeline).toEqual([{ atMs: 0, order: 0, event: { type: 'workout-complete' } }]);
  });

  it('produces a single workout-complete at t=0 for an empty phase list', () => {
    const workout: Workout = { id: 'w', name: 'No phases', leadInSeconds: 5, phases: [], repeatCount: 40 };

    const schedule = buildSchedule(workout);

    expect(schedule.timeline).toEqual([{ atMs: 0, order: 0, event: { type: 'workout-complete' } }]);
  });
});
