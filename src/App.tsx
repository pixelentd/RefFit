import { useEffect, useState } from 'react';
import { Workout } from './model';
import { makeDefaultWorkout } from './presets';
import { loadWorkouts, saveWorkouts } from './storage';
import { WorkoutLibrary } from './screens/WorkoutLibrary';
import { WorkoutEditor } from './screens/WorkoutEditor';
import { RunScreen } from './screens/RunScreen';

type Screen =
  | { kind: 'library' }
  | { kind: 'editor'; workout: Workout }
  | { kind: 'run'; workout: Workout };

export default function App() {
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'library' });

  useEffect(() => {
    loadWorkouts().then(setWorkouts);
  }, []);

  if (workouts === null) {
    return <div className="loading">Loading…</div>;
  }

  async function persist(next: Workout[]) {
    setWorkouts(next);
    await saveWorkouts(next);
  }

  if (screen.kind === 'editor') {
    return (
      <WorkoutEditor
        workout={screen.workout}
        onSave={(saved) => {
          const exists = workouts.some((w) => w.id === saved.id);
          const next = exists
            ? workouts.map((w) => (w.id === saved.id ? saved : w))
            : [...workouts, saved];
          persist(next);
          setScreen({ kind: 'library' });
        }}
        onCancel={() => setScreen({ kind: 'library' })}
      />
    );
  }

  if (screen.kind === 'run') {
    // key={workout.id} forces a fresh IntervalEngine if the user backs out and runs another.
    return <RunScreen key={screen.workout.id} workout={screen.workout} onExit={() => setScreen({ kind: 'library' })} />;
  }

  return (
    <WorkoutLibrary
      workouts={workouts}
      onSelect={(id) => {
        const workout = workouts.find((w) => w.id === id);
        if (workout) setScreen({ kind: 'editor', workout });
      }}
      onRun={(id) => {
        const workout = workouts.find((w) => w.id === id);
        if (workout) setScreen({ kind: 'run', workout });
      }}
      onNew={() => setScreen({ kind: 'editor', workout: makeDefaultWorkout() })}
      onDelete={(id) => persist(workouts.filter((w) => w.id !== id))}
      onReorder={persist}
    />
  );
}
