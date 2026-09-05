import { useSheetManager } from "@/hooks/useSheetManager";

/**
 * A hook to bind an open UI element (like a modal, drawer, or sidebar) to the browser history.
 * When the element is open, pressing the native back button or performing the iOS back swipe
 * will close the element instead of navigating away.
 *
 * @param isOpen Whether the UI element is currently open.
 * @param onClose Callback function to close the UI element.
 */
export function useHistoryBound(isOpen: boolean, onClose: () => void) {
  useSheetManager(isOpen, onClose);
}
