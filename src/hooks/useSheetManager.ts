import { useEffect, useRef } from "react";
import {
  registerBackButtonHandler,
  initBackButtonListener,
  suppressNextBackPopstate,
} from "@/lib/back-button-manager";

export type SheetCloseHandler = () => void;

/**
 * Hook that registers an active bottom sheet, dialog, or drawer with the LIFO BackButtonManager.
 * When the user presses the Android hardware back button (Capacitor) or triggers a browser popstate,
 * the top-most active sheet is closed gracefully before any underlying route transition occurs.
 *
 * @param isOpen Whether the sheet or modal is currently visible
 * @param onClose Callback triggered to close the sheet/modal
 * @param priority Priority level on the stack (higher = executed first, default: 10)
 */
export function useSheetManager(
  isOpen: boolean,
  onClose?: SheetCloseHandler,
  priority = 10,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Ensure the Capacitor / popstate listener is attached
    initBackButtonListener();

    if (!isOpen || !onCloseRef.current) return;

    const historyToken = `smartspend-overlay-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

    // A same-URL sentinel makes browser/PWA Back close the overlay without
    // allowing the underlying route to navigate as a side effect.
    if (typeof window !== "undefined") {
      window.history.pushState(
        {
          ...window.history.state,
          smartSpendOverlay: historyToken,
        },
        "",
        window.location.href,
      );
    }

    const unregister = registerBackButtonHandler(() => {
      if (onCloseRef.current) {
        onCloseRef.current();
        return true; // event consumed
      }
      return false;
    }, priority);

    return () => {
      unregister();

      // If the overlay closed from a button or gesture, remove only its own
      // sentinel. Browser Back already removed it before invoking the handler.
      if (
        typeof window !== "undefined" &&
        window.history.state?.smartSpendOverlay === historyToken
      ) {
        suppressNextBackPopstate();
        window.history.back();
      }
    };
  }, [isOpen, priority]);
}
