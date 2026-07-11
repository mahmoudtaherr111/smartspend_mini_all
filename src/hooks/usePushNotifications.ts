import { useState, useEffect } from "react";
import { trpc } from "../providers/trpc";
import { toast } from "sonner";
import { messaging, isFirebaseConfigured } from "../pwa/firebase";
import { getToken } from "firebase/messaging";

const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY || "BBtKP6w97Av5YT6NvKCh3EostLvYiXIHQqM-QGSMlMYRk8fJPalWo3dvXEcghrnlizV1selpCWTOjU4qTjIBb3o";

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
  const [isSubscribed, setIsSubscribed] = useState(false);

  const saveSubscription = trpc.profile.savePushSubscription.useMutation();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      setIsSupported(true);

      // 1. If Firebase is configured and permission is already granted, refresh/fetch token
      if (isFirebaseConfigured && messaging && Notification.permission === "granted") {
        getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        })
          .then((token) => {
            if (token) {
              setIsSubscribed(true);
              saveSubscription.mutate({
                fcmToken: token,
                deviceType: "web",
              });
            }
          })
          .catch((err) => console.warn("Failed to auto-fetch FCM token:", err));
      } else {
        // 2. Check legacy browser subscription for backward compatibility
        navigator.serviceWorker.ready.then((reg) => {
          reg.pushManager.getSubscription().then((sub) => {
            if (sub) {
              setIsSubscribed(true);
            }
          });
        });
      }
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

      // 1. Firebase Cloud Messaging Path (If configured)
      if (isFirebaseConfigured && messaging) {
        // Get registration token
        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        });

        if (token) {
          setIsSubscribed(true);
          await saveSubscription.mutateAsync({
            fcmToken: token,
            deviceType: "web",
          });
          toast.success("تم تفعيل الإشعارات بنجاح");
        } else {
          throw new Error("No FCM token returned");
        }
      } else {
        // 2. Legacy standard Web-Push Path (Fallback)
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
        });

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
          deviceType: "web",
        });

        toast.success("تم تفعيل الإشعارات بنجاح (وضع التوافق)");
      }
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
