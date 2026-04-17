import { NOTIFICATION_SOUND_URL } from './constants.js';

/**
 * Lazy `HTMLAudioElement` singleton used by the notification system.
 *
 * Why a singleton:
 *   - Construction is deferred until the first call so we don't pay
 *     the network cost (and don't fail in SSR/jsdom) for users who
 *     never receive a notification.
 *   - One element shared across the app means the browser never holds
 *     more than one decoded copy of the audio buffer in memory.
 *
 * Why we tolerate `play()` rejections:
 *   - Most browsers reject `audio.play()` until the user has interacted
 *     with the page at least once (autoplay policy). That's a totally
 *     normal "permission not yet granted" scenario, not a bug — we
 *     swallow it silently rather than spam the console.
 */
let audioInstance = null;

const getAudio = () => {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return null;
  }
  if (!audioInstance) {
    audioInstance = new Audio(NOTIFICATION_SOUND_URL);
    audioInstance.preload = 'auto';
    // Keep the cue subtle — full volume on a 1 second alert is jarring.
    audioInstance.volume = 0.5;
  }
  return audioInstance;
};

/**
 * Play the notification sound. Safe to call from any event handler;
 * never throws. Resets `currentTime` to 0 so back-to-back notifications
 * don't get clipped by a still-playing previous cue.
 */
export const playNotificationSound = () => {
  const audio = getAudio();
  if (!audio) return;
  try {
    audio.currentTime = 0;
    const result = audio.play();
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        /* Autoplay blocked or asset missing — both non-fatal. */
      });
    }
  } catch {
    /* Some browsers throw synchronously when audio is detached. */
  }
};
