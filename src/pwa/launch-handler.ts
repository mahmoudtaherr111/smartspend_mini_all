/**
 * Consumes Web App Launch Handler events.
 *
 * The manifest asks for `focus-existing`, so tapping the home-screen icon (or
 * sharing into the app) brings the running window forward instead of
 * navigating the document — a document navigation is what threw away the
 * session and made a two-second absence look like a cold start.
 *
 * The cost of `focus-existing` is that the browser stops navigating for us: the
 * target URL arrives on `window.launchQueue` and is dropped on the floor unless
 * something consumes it. Without this file, sharing a receipt into SmartSpend
 * would focus the app and then do nothing.
 */

export const LAUNCH_NAVIGATION_EVENT = "smartspend:launch-navigate";

type LaunchParams = { targetURL?: string };

type LaunchQueue = {
  setConsumer: (consumer: (params: LaunchParams) => void) => void;
};

function getLaunchQueue(): LaunchQueue | null {
  if (typeof window === "undefined") return null;
  const queue = (window as Window & { launchQueue?: LaunchQueue }).launchQueue;
  return queue && typeof queue.setConsumer === "function" ? queue : null;
}

/**
 * Resolves a launch target to a same-origin, in-app path.
 *
 * A launch target is attacker-influenceable (a share sheet hands over whatever
 * the source app sent), so it is resolved against this origin and rejected if
 * it lands anywhere else. Only a path is ever handed to the router.
 */
export function resolveLaunchPath(targetUrl: string | undefined): string | null {
  if (!targetUrl) return null;
  try {
    const url = new URL(targetUrl, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Nothing to do when the launch points at the screen already showing.
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return path === current ? null : path;
  } catch {
    return null;
  }
}

let pendingLaunchPath: string | null = null;

/**
 * Takes the launch target that arrived before the router existed, if any.
 * Reading it clears it, so a share is acted on exactly once.
 */
export function consumePendingLaunchPath(): string | null {
  const path = pendingLaunchPath;
  pendingLaunchPath = null;
  return path;
}

/**
 * Registers the consumer as early as possible — from `main.tsx`, before React
 * mounts. A launch can be delivered before the router exists, so the path is
 * held here and drained by `useLaunchNavigation` on mount; later launches,
 * arriving while the app is already running, go straight out as an event.
 */
export function initLaunchHandler(): void {
  const queue = getLaunchQueue();
  if (!queue) return;

  queue.setConsumer((params) => {
    const path = resolveLaunchPath(params?.targetURL);
    if (!path) return;
    pendingLaunchPath = path;
    window.dispatchEvent(
      new CustomEvent(LAUNCH_NAVIGATION_EVENT, { detail: { path } }),
    );
  });
}
