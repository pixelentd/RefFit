import { Workout, makePhase } from './model';

/** The default when the user taps "New": the test as you're training it (17s run / 17s walk × 40). */
export function makeDefaultWorkout(): Workout {
  return {
    id: crypto.randomUUID(),
    name: 'New Workout',
    leadInSeconds: 5,
    phases: [
      makePhase({ type: 'run', durationSeconds: 17, distanceMeters: 75 }),
      makePhase({ type: 'walk', durationSeconds: 17, distanceMeters: 25 }),
    ],
    repeatCount: 40,
  };
}

/**
 * Built-in referee presets, seeded on first launch.
 *
 * Labels use the run/walk seconds (what actually governs the run); walk times vary by
 * category/federation. Distances are the standard 75m run / 25m walk; 40 reps = 4000m.
 * These are just starting points — edit any of them freely.
 */
export function builtInWorkouts(): Workout[] {
  return [
    fifaInterval('Referee Interval 17/17 (training)', 17),
    fifaInterval('FIFA Interval 17/20', 20),
    fifaInterval('FIFA Interval 17/22', 22),
    fifaInterval('FIFA Interval 17/24 (lower cat.)', 24),
    repeatSprint(),
  ];
}

function fifaInterval(name: string, walkSeconds: number): Workout {
  return {
    id: crypto.randomUUID(),
    name,
    leadInSeconds: 5,
    phases: [
      makePhase({ type: 'run', durationSeconds: 17, distanceMeters: 75 }),
      makePhase({ type: 'walk', durationSeconds: walkSeconds, distanceMeters: 25 }),
    ],
    repeatCount: 40,
  };
}

/** Part 1 of the FIFA battery: 6 × 40m sprints with recovery between. Same model, different phases. */
function repeatSprint(): Workout {
  return {
    id: crypto.randomUUID(),
    name: 'Repeat Sprint 6×40 m',
    leadInSeconds: 5,
    phases: [
      makePhase({ type: 'sprint', durationSeconds: 8, distanceMeters: 40, warningsAtSecondsRemaining: [3] }),
      makePhase({ type: 'rest', durationSeconds: 40, distanceMeters: 0, warningsAtSecondsRemaining: [10, 5] }),
    ],
    repeatCount: 6,
  };
}
