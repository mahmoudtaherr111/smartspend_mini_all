import { useEffect, useRef } from "react";

/**
 * A hook to bind an open UI element (like a modal, drawer, or sidebar) to the browser history.
 * When the element is open, pressing the native back button or performing the iOS back swipe
 * will close the element instead of navigating away.
 *
 * @param isOpen Whether the UI element is currently open.
 * @param onClose Callback function to close the UI element.
 */
export function useHistoryBound(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    // Push a dummy state to browser history when the element opens
    const stateId = `modal-${Date.now()}`;
    window.history.pushState({ modalOpenId: stateId }, "");

    const handlePopState = (e: PopStateEvent) => {
      // If user went back, close the modal
      onCloseRef.current();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      
      // Clean up: If the modal closed programmatically (not via back button),
      // we must pop the dummy state to keep the history clean.
      if (window.history.state && window.history.state.modalOpenId === stateId) {
        window.history.back();
      }
    };
  }, [isOpen]);
}
