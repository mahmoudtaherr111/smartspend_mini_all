import { useState, useEffect } from "react";
import { usePwaLifecycle } from "@/hooks/usePwaLifecycle";
import { PwaInstallPrompt } from "./PwaInstallPrompt";
import { PwaOfflineSyncDialog } from "./PwaOfflineSyncDialog";
import { NetworkStatusToast } from "./NetworkStatusToast";

export function PwaEnhancements() {
  // Initialize PWA lifecycle (badges, status-bar theme, SW navigation).
  // Keyboard viewport ownership lives exclusively in VirtualKeyboardProvider.
  usePwaLifecycle();

  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [showNetworkStatus, setShowNetworkStatus] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    const handleOnline = () => {
      if (timer) clearTimeout(timer);
      setIsOnline(true);
      setShowNetworkStatus(true);
      timer = setTimeout(() => setShowNetworkStatus(false), 3500);
    };

    const handleOffline = () => {
      if (timer) clearTimeout(timer);
      setIsOnline(false);
      setShowNetworkStatus(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <NetworkStatusToast
        isOnline={isOnline}
        showNetworkStatus={showNetworkStatus}
      />
      <PwaOfflineSyncDialog isOnline={isOnline} />
      <PwaInstallPrompt />
    </>
  );
}
