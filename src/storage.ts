// Persistence for the workout library, via Capacitor Preferences.
//
// The whole library lives under one key as a JSON array of Workout. Preferences' web
// implementation is backed by localStorage, so this works unmodified in the browser during
// `npm run dev` — no separate dev-time fallback needed.

import { Preferences } from '@capacitor/preferences';
import { Workout } from './model';
import { builtInWorkouts } from './presets';

const LIBRARY_KEY = 'reffit.workouts';

/** Loads the saved library, seeding it from the built-in presets on first launch. */
export async function loadWorkouts(): Promise<Workout[]> {
  const { value } = await Preferences.get({ key: LIBRARY_KEY });
  if (value === null) {
    const seeded = builtInWorkouts();
    await saveWorkouts(seeded);
    return seeded;
  }
  return JSON.parse(value) as Workout[];
}

export async function saveWorkouts(workouts: Workout[]): Promise<void> {
  await Preferences.set({ key: LIBRARY_KEY, value: JSON.stringify(workouts) });
}
