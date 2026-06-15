/**
 * @fileoverview ARIA live region announcer utility.
 *
 * Provides a programmatic way to announce dynamic status messages to screen
 * readers (e.g., "AI is analyzing your bill...") without moving focus.
 * Uses the polite aria-live region defined in index.html.
 */

let announcer: HTMLElement | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Lazily initializes the ARIA announcer element.
 * Falls back gracefully if the DOM element is unavailable.
 *
 * @returns Announcer element if found.
 */
function getAnnouncer(): HTMLElement | null {
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
 * @param message - The message to announce. Pass an empty string to clear.
 * @param clearAfterMs - Milliseconds after which to clear the announcement.
 */
export function announce(message: string, clearAfterMs = 5000): void {
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
 */
export function clearAnnouncement(): void {
  announce('', 0);
}
