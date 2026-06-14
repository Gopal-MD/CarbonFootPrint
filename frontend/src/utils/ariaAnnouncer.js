/**
 * @fileoverview ARIA live region announcer utility.
 *
 * Provides a programmatic way to announce dynamic status messages to screen
 * readers (e.g., "AI is analyzing your bill...") without moving focus.
 * Uses the polite aria-live region defined in index.html.
 */

/** @type {HTMLElement|null} */
let announcer = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let clearTimer = null;

/**
 * Lazily initializes the ARIA announcer element.
 * Falls back gracefully if the DOM element is unavailable.
 *
 * @returns {HTMLElement|null}
 */
function getAnnouncer() {
  if (!announcer) {
    announcer = document.getElementById('aria-announcer');
  }
  return announcer;
}

/**
 * Announces a message to screen readers via a polite aria-live region.
 * Clears the previous announcement after a delay to allow re-announcement
 * of the same message.
 *
 * @param {string} message - The message to announce. Pass an empty string to clear.
 * @param {number} [clearAfterMs=5000] - Milliseconds after which to clear the announcement.
 * @returns {void}
 *
 * @example
 * announce('AI is analyzing your utility bill...');
 * announce('Carbon calculation complete: 2.4 kg CO₂e', 3000);
 */
export function announce(message, clearAfterMs = 5000) {
  const el = getAnnouncer();
  if (!el) {
    return;
  }

  // Clear any pending timer
  if (clearTimer !== null) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }

  // Briefly clear and re-set to ensure re-announcement of identical messages
  el.textContent = '';

  // Use a microtask delay to allow the DOM to register the cleared state
  requestAnimationFrame(() => {
    el.textContent = message;

    if (clearAfterMs > 0) {
      clearTimer = setTimeout(() => {
        el.textContent = '';
        clearTimer = null;
      }, clearAfterMs);
    }
  });
}

/**
 * Immediately clears any active ARIA announcement.
 *
 * @returns {void}
 */
export function clearAnnouncement() {
  announce('', 0);
}
