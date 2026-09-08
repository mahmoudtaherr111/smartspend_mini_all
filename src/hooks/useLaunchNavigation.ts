import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  consumePendingLaunchPath,
  LAUNCH_NAVIGATION_EVENT,
} from "@/pwa/launch-handler";

/**
 * Routes launches delivered by the Web App Launch Handler.
 *
 * Because the manifest asks the browser to focus the running window rather than
 * navigate it, the app is responsible for going where the launch pointed. This
 * runs a client-side navigation, so a share or a notification tap lands on the
 * right screen without discarding the session — which is the whole point of
 * `focus-existing`.
 *
 * Mounted from the shell layout so it is live for signed-out visitors too, and
 * so it is not tied to any one route.
 */
export function useLaunchNavigation(): void {
  const navigate = useNavigate();

  useEffect(() => {
    // A launch that arrived before React mounted is waiting in the buffer.
    const pending = consumePendingLaunchPath();
    if (pending) navigate(pending);

    const handleLaunch = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path;
      // Clear the buffer too: this same launch filled it.
      consumePendingLaunchPath();
      if (path) navigate(path);
    };

    window.addEventListener(LAUNCH_NAVIGATION_EVENT, handleLaunch);
    return () =>
      window.removeEventListener(LAUNCH_NAVIGATION_EVENT, handleLaunch);
  }, [navigate]);
}
