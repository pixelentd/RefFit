// Screen Wake Lock (Safari 16.4+, so fine on iOS 17+). Load-bearing for the run screen: on iOS,
// Web Audio stops firing beeps once the screen locks, so keeping the screen ON for the length of
// a workout is what makes the whole audio channel actually work on a real run.

import { useEffect, useRef, useState } from 'react';

export interface WakeLockState {
  /** False if the Screen Wake Lock API doesn't exist at all in this browser — RunScreen shows a
   *  manual "keep your screen on" hint in that case, since there's nothing else it can do. */
  isSupported: boolean;
  /** True once a lock is actually being held right now. */
  isActive: boolean;
}

/**
 * Holds a screen wake lock for as long as `shouldHold` is true, and releases it the moment it
 * flips false (or the component unmounts) — so callers get "acquire on start, release on
 * pause/stop/complete/unmount" for free just by deriving `shouldHold` from their own state.
 *
 * The browser force-releases the lock whenever the tab/app is hidden (that's what "the screen
 * locked" looks like from here too) — this hook re-requests it the instant the page becomes
 * visible again, as long as `shouldHold` is still true at that point.
 */
export function useScreenWakeLock(shouldHold: boolean): WakeLockState {
  const [isActive, setIsActive] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  useEffect(() => {
    if (!isSupported || !shouldHold) return;

    let cancelled = false;

    async function acquire() {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          // shouldHold flipped false, or we unmounted, while the request was in flight.
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        setIsActive(true);
        sentinel.addEventListener('release', () => setIsActive(false));
      } catch {
        // Acquisition can fail (e.g. some browsers refuse it below a battery threshold) — degrade
        // silently; isActive staying false is exactly what drives RunScreen's on-screen hint.
      }
    }

    function handleVisibilityChange() {
      // The lock is auto-released as soon as the tab/app is hidden; re-arm it once it's visible
      // again, same as AudioBridge does for the AudioContext.
      if (document.visibilityState === 'visible' && !sentinelRef.current) void acquire();
    }

    void acquire();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      sentinelRef.current?.release();
      sentinelRef.current = null;
      setIsActive(false);
    };
  }, [isSupported, shouldHold]);

  return { isSupported, isActive };
}
