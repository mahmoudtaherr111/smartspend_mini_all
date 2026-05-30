import { useState, useEffect } from "react";
import { trpc } from "../providers/trpc";
import { toast } from "sonner";

// Use the public key generated
const VAPID_PUBLIC_KEY =
  "BBtKP6w97Av5YT6NvKCh3EostLvYiXIHQqM-QGSMlMYRk8fJPalWo3dvXEcghrnlizV1selpCWTOjU4qTjIBb3o";

function urlB64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  const [isSubscribed, setIsSubscribed] = useState(false);

  const saveSubscription = trpc.profile.savePushSubscription.useMutation();

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true);
      // Check if already subscribed
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          if (sub) {
            setSubscription(sub);
            setIsSubscribed(true);
          }
        });
      });
    }
  }, []);

  const subscribeToPush = async () => {
    if (!isSupported) {
      toast.error("متصفحك لا يدعم الإشعارات");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("تم رفض صلاحية الإشعارات");
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      setSubscription(sub);
      setIsSubscribed(true);

      const p256dh = btoa(
        String.fromCharCode.apply(
          null,
          Array.from(new Uint8Array(sub.getKey("p256dh") as ArrayBuffer)),
        ),
      );
      const auth = btoa(
        String.fromCharCode.apply(
          null,
          Array.from(new Uint8Array(sub.getKey("auth") as ArrayBuffer)),
        ),
      );

      await saveSubscription.mutateAsync({
        endpoint: sub.endpoint,
        p256dh,
        auth,
      });

      toast.success("تم تفعيل الإشعارات بنجاح");
    } catch (err) {
      console.error("Error subscribing to push:", err);
      toast.error("حدث خطأ أثناء تفعيل الإشعارات");
    }
  };

  return {
    isSupported,
    isSubscribed,
    subscribeToPush,
  };
}
